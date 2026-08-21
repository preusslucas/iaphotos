import { Queue, Worker } from 'bullmq';
import { listFigures } from '@/content';
import { env } from '@/lib/env';
import { prisma } from '@/lib/prisma';
import { QUEUE_GENERATION, QUEUE_RETENTION, type GenerationJobData } from '@/lib/queue';
import { redis } from '@/lib/redis';
import { ensureBucket, objectExists } from '@/lib/storage';
import { processGeneration, settleFailedOrder } from './generation';
import { runRetention } from './retention';

/**
 * Confere no boot que as referencias de cada figura estao no storage.
 *
 * Referencia ausente e erro de DEPLOY, nao de runtime: acontece quando alguem
 * sobe um ambiente novo, migra de bucket ou renomeia uma chave. Descobrir isso
 * no primeiro pedido significa descobrir com o dinheiro de um cliente na mao —
 * entao conferimos antes de aceitar job nenhum.
 *
 * NAO derruba o processo de proposito: uma figura com referencia faltando nao
 * pode impedir as outras de vender, e os pedidos dela ja ficam retidos em
 * NEEDS_REVIEW pelo `loadReferences`. Aqui o objetivo e o aviso chegar cedo.
 */
async function conferirReferencias() {
  for (const figure of await listFigures()) {
    if (figure.loraUrl) continue; // rota LoRA nao usa referencia

    // Figura desligada nao vende, entao nao ter referencia ainda e o estado
    // NORMAL de quem acabou de ser cadastrada no /admin — nao e alarme.
    if (!figure.enabled) continue;

    if (figure.referenceKeys.length === 0) {
      console.error(
        `[worker] FIGURA "${figure.slug}" está LIGADA e não tem nenhuma referência cadastrada.\n` +
          `         Todo pedido dela vai ser retido em NEEDS_REVIEW sem gerar.\n` +
          `         Cadastre no /admin ou desligue a figura.`,
      );
      continue;
    }

    const faltando: string[] = [];
    for (const key of figure.referenceKeys) {
      if (!(await objectExists(key))) faltando.push(key);
    }

    if (faltando.length === figure.referenceKeys.length) {
      console.error(
        `[worker] FIGURA "${figure.slug}" SEM NENHUMA REFERÊNCIA no storage.\n` +
          `         Todo pedido dela vai ser retido em NEEDS_REVIEW sem gerar.\n` +
          `         Faltando: ${faltando.join(', ')}\n` +
          `         Suba com: pnpm exec tsx --env-file=.env scripts/sobe-referencias.ts ${figure.slug} <arquivos>`,
      );
    } else if (faltando.length > 0) {
      console.warn(
        `[worker] figura "${figure.slug}" com ${faltando.length} referência(s) faltando: ${faltando.join(', ')}`,
      );
    }
  }
}

/**
 * Processo separado do web. Uma geracao segura o event loop por dezenas de
 * segundos; deixar isso no container que atende a landing faria a pagina de
 * venda engasgar exatamente quando o trafego pago aperta.
 */
async function main() {
  env(); // valida a configuracao antes de aceitar qualquer job
  await ensureBucket();
  await conferirReferencias();

  const connection = redis();

  const generation = new Worker<GenerationJobData>(
    QUEUE_GENERATION,
    (job) => processGeneration(job.data.orderId),
    {
      connection,
      // Cada job passa a maior parte do tempo esperando o provedor, mas a etapa
      // com sharp e CPU-bound. 3 e um teto conservador para um container
      // pequeno; suba com base no p95 medido, nao no chute.
      concurrency: 3,
      // Maior que o timeout de 90s da BFL mais o pos-processamento. Se o lock
      // expirasse durante uma geracao, o BullMQ entregaria o MESMO pedido a
      // outro worker e pagariamos a imagem duas vezes.
      lockDuration: 180_000,
    },
  );

  generation.on('failed', async (job, err) => {
    if (!job) return;
    const last = job.attemptsMade >= (job.opts.attempts ?? 1);
    console.error(
      `[worker] geração ${job.id} falhou (${job.attemptsMade}/${job.opts.attempts}):`,
      err.message,
    );

    // So desiste na ultima tentativa. Desistir cedo demais encerraria pedidos
    // que a proxima tentativa entregaria.
    //
    // `settleFailedOrder` decide entre estornar e reter — nao replique a regra
    // aqui, ela vive num lugar so de proposito.
    if (last || err.name === 'UnrecoverableError') {
      await settleFailedOrder(job.data.orderId, 'Não conseguimos gerar a imagem.').catch((e) =>
        console.error('[worker] falha ao encerrar pedido', job.data.orderId, e),
      );
    }
  });

  generation.on('completed', (job) => console.log(`[worker] geração ${job.id} concluída`));

  // Retencao: uma fila repetivel em vez de cron do sistema, para que o job
  // sobreviva a redeploy e nao dependa de nada fora do container.
  const retentionQueue = new Queue(QUEUE_RETENTION, { connection });
  await retentionQueue.upsertJobScheduler(
    'retencao-diaria',
    { pattern: '0 4 * * *' }, // 4h da manha, fora do horario de venda
    { name: 'retention' },
  );

  const retention = new Worker(QUEUE_RETENTION, () => runRetention(), {
    connection,
    concurrency: 1,
  });
  retention.on('failed', (_job, err) => console.error('[worker] retenção falhou:', err.message));

  console.log(`[worker] ouvindo "${QUEUE_GENERATION}" e "${QUEUE_RETENTION}"`);

  // Sem shutdown gracioso, um redeploy no Coolify mata o container no meio de
  // uma geracao ja paga: o job fica preso com lock ate expirar e o cliente
  // espera olhando a tela de progresso.
  const shutdown = async (signal: string) => {
    console.log(`[worker] ${signal} recebido, encerrando...`);
    await Promise.allSettled([generation.close(), retention.close(), retentionQueue.close()]);
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('[worker] falha no boot:', err);
  process.exit(1);
});
