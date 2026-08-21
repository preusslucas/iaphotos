import { UnrecoverableError } from 'bullmq';
import type { Framing, Mood } from '@prisma/client';
import { getFigure, getScene } from '@/content';
import { inspect, makePreview, normalizeSelfie, watermark } from '@/lib/image';
import { prisma } from '@/lib/prisma';
import { loraPrompt, multiRefPrompt } from '@/lib/prompts';
import { GPT_IMAGE_2_COST_USD_CENTS, generate } from '@/lib/providers/gpt-image-2';
import { env } from '@/lib/env';
import { getObject, keys, putObject } from '@/lib/storage';
import { deliverOrder } from './delivery';
import { refundFailedOrder } from './refund';

const SELFIE_EXTS = ['jpg', 'jpeg', 'png', 'webp'] as const;

/**
 * Pipeline de um pedido pago: selfie do MinIO -> gpt-image-2 -> marca d'agua -> MinIO.
 *
 * Lanca `UnrecoverableError` para falhas que repetir nao resolve (moderacao,
 * cena inexistente). Isso importa em dinheiro: sem essa distincao, o BullMQ
 * repetiria 3 vezes uma geracao que o provedor ja recusou por politica, e cada
 * tentativa e cobrada.
 */
export async function processGeneration(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: { orderBy: { sortOrder: 'asc' } } },
  });
  if (!order) throw new UnrecoverableError(`pedido ${orderId} não existe`);

  if (order.status === 'READY') return; // reentrega apos retry: nada a fazer
  if (order.status === 'PENDING') {
    throw new UnrecoverableError(`pedido ${orderId} não está pago`);
  }
  if (order.items.length === 0) {
    throw new UnrecoverableError(`pedido ${orderId} não tem itens`);
  }

  await prisma.order.update({ where: { id: order.id }, data: { status: 'PROCESSING' } });

  // A selfie e uma so para o pedido inteiro: carrega e normaliza UMA vez, nao
  // uma por foto. Sao ~1,5MB e uma passada de sharp que nao mudam entre itens.
  const selfie = await normalizeSelfie(await loadSelfie(order.id));

  // Em serie, nao em paralelo: a concorrencia do worker ja e 3, e disparar 3
  // geracoes de um pedido de uma vez faria um unico cliente ocupar a fila
  // inteira. Alem disso a medicao de 2026-08-13 mostrou que paralelizar NAO
  // melhora a latencia — serial deu p50 43,6s contra 38,8s com concorrencia 3.
  const falhas: string[] = [];
  for (const item of order.items) {
    if (item.status === 'DONE') continue; // reprocessamento: nao refaz o que ja saiu
    try {
      await geraItem(order.id, item.id, item.figureSlug, item.sceneId, selfie, {
        framing: order.framing,
        mood: order.mood,
      });
    } catch (err) {
      // Um item que falha NAO derruba os outros: a foto do Bolsonaro ja pronta
      // nao pode ser perdida porque a do Trump quebrou. O erro e registrado no
      // item e o pedido decide o proprio destino no fim.
      const motivo = err instanceof Error ? err.message : String(err);
      await prisma.orderItem.update({
        where: { id: item.id },
        data: { status: 'FAILED', failureReason: motivo.slice(0, 500) },
      });
      falhas.push(`${item.figureSlug}: ${motivo}`);
      console.error(`[generation] item ${item.id} (${item.figureSlug}) falhou:`, motivo);
    }
  }

  if (falhas.length > 0) {
    // Retem em vez de estornar: quase toda falha aqui tem conserto (referencia
    // ausente, provedor fora) e o cliente prefere a foto ao dinheiro. As fotos
    // que ficaram prontas continuam disponiveis para download — veja a rota de
    // resultado, que serve os itens DONE mesmo com o pedido retido.
    await holdForReview(order.id, `${falhas.length} de ${order.items.length} fotos falharam.`);
    throw new UnrecoverableError(falhas.join(' | '));
  }

  await prisma.order.update({
    where: { id: order.id },
    data: { status: 'READY', readyAt: new Date() },
  });

  // Fora da transacao de proposito: entrega que falha nao pode desfazer imagens
  // que ja foram geradas e pagas.
  await deliverOrder(order.id).catch((err) =>
    console.error('[generation] entrega falhou (imagens estão salvas)', order.id, err),
  );
}

/** Gera UMA foto do pedido. Lanca em qualquer falha; quem chama decide o resto. */
async function geraItem(
  orderId: string,
  itemId: string,
  figureSlug: string,
  sceneId: string,
  selfie: Buffer,
  // Enquadramento e clima valem para o pedido inteiro: as tres fotos do combo
  // saem no mesmo estilo, que e o que a pessoa escolheu.
  estilo: { framing: Framing; mood: Mood },
): Promise<void> {
  const figure = await getFigure(figureSlug);
  const scene = await getScene(figureSlug, sceneId);
  if (!figure || !scene) {
    throw new UnrecoverableError(`catálogo não tem ${figureSlug}/${sceneId}`);
  }

  const job = await prisma.generationJob.create({
    data: { orderId, orderItemId: itemId, status: 'RUNNING', startedAt: new Date() },
  });
  await prisma.orderItem.update({ where: { id: itemId }, data: { status: 'RUNNING' } });

  try {

    // Rota B (LoRA) quando a figura tiver uma treinada; senao rota A
    // (multi-referencia). A Fase 0 decide qual das duas sobrevive.
    const references = figure.loraUrl ? [] : await loadReferences(orderId, figure.referenceKeys);
    const prompt = figure.loraUrl
      ? loraPrompt(scene, figure.loraTrigger ?? 'the man')
      : multiRefPrompt(scene, references.length, estilo);

    const result = await generate({
      prompt,
      images: [selfie, ...references].slice(0, 4),
      aspectRatio: scene.aspectRatio,
      // Sem timeoutMs: o default do provider (90s) foi calibrado na medicao.
    });

    const costUsdCents = GPT_IMAGE_2_COST_USD_CENTS;

    if (result.outcome !== 'ok' || !result.image) {
      await prisma.generationJob.update({
        where: { id: job.id },
        data: {
          status: 'FAILED',
          providerJobId: result.providerJobId,
          errorCode: result.outcome,
          errorDetail: result.detail?.slice(0, 500),
          // Moderacao e timeout tambem sao cobrados em alguns casos; registrar
          // o custo mesmo na falha e o que mantem a margem do /admin honesta.
          costUsdCents,
          finishedAt: new Date(),
        },
      });

      if (result.outcome === 'moderated') {
        // Moderacao continua sendo falha DEFINITIVA do pedido inteiro: se o
        // filtro recusou esta selfie numa cena, repetir nas outras gasta
        // dinheiro para ser recusado de novo.
        await failOrder(orderId, 'A imagem foi recusada pelo filtro de conteúdo do gerador.');
        throw new UnrecoverableError(`moderado pelo provedor: ${result.detail}`);
      }
      throw new Error(`geração falhou (${result.outcome}): ${result.detail}`);
    }

    const stamped = await watermark(result.image);
    const preview = await makePreview(stamped);
    const facts = await inspect(stamped);

    const resultKey = keys.result(orderId, itemId);
    const previewKey = keys.preview(orderId, itemId);
    await Promise.all([
      putObject(resultKey, stamped, 'image/png'),
      putObject(previewKey, preview, 'image/webp'),
    ]);

    const expiresAt = daysFromNow(env().RESULT_RETENTION_DAYS);

    // Uma transacao para que "item pronto" e "assets existem" nunca sejam
    // verdade pela metade — a tela de resultado depende dos dois.
    await prisma.$transaction([
      prisma.asset.upsert({
        where: { objectKey: resultKey },
        create: {
          orderId,
          orderItemId: itemId,
          kind: 'RESULT',
          objectKey: resultKey,
          mimeType: 'image/png',
          bytes: stamped.byteLength,
          width: facts.width,
          height: facts.height,
          expiresAt,
        },
        update: { bytes: stamped.byteLength, expiresAt },
      }),
      prisma.asset.upsert({
        where: { objectKey: previewKey },
        create: {
          orderId,
          orderItemId: itemId,
          kind: 'PREVIEW',
          objectKey: previewKey,
          mimeType: 'image/webp',
          bytes: preview.byteLength,
          expiresAt,
        },
        update: { bytes: preview.byteLength, expiresAt },
      }),
      prisma.generationJob.update({
        where: { id: job.id },
        data: {
          status: 'DONE',
          providerJobId: result.providerJobId,
          costUsdCents,
          finishedAt: new Date(),
        },
      }),
      prisma.orderItem.update({
        where: { id: itemId },
        data: { status: 'DONE', failureReason: null, readyAt: new Date() },
      }),
    ]);
  } catch (err) {
    await prisma.generationJob.updateMany({
      where: { id: job.id, status: 'RUNNING' },
      data: {
        status: 'FAILED',
        errorDetail: (err instanceof Error ? err.message : String(err)).slice(0, 500),
        finishedAt: new Date(),
      },
    });
    throw err;
  }
}

/**
 * UNICO lugar que decide o destino de um pedido que nao pode ser entregue.
 *
 * A regra, decidida em 2026-08-13: **estorno automatico so para falha
 * definitiva.** Todo o resto retem o dinheiro e espera acao humana no /admin.
 *
 *  - DEFINITIVA (moderacao recusou): reprocessar nao resolve — a mesma selfie na
 *    mesma cena sera recusada de novo. `processGeneration` ja marcou FAILED
 *    antes de lancar, e e esse FAILED que autoriza o estorno aqui. Automatico
 *    porque sai mais barato que chargeback, em taxa e em reputacao.
 *  - OPERACIONAL (referencia ausente, storage fora, provedor fora): reprocessar
 *    RESOLVE. Estornar seria jogar fora uma venda ja ganha por um problema nosso
 *    de cinco minutos — o cliente prefere a foto ao dinheiro. Vira NEEDS_REVIEW.
 *  - JA RETIDO: `holdForReview` chegou primeiro (o handler de `failed` do worker
 *    passa por aqui logo depois, pelo mesmo erro). Sem esta guarda o estorno
 *    anularia a retencao um instante depois de ela acontecer.
 */
export async function settleFailedOrder(orderId: string, reason: string): Promise<void> {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || order.status === 'READY' || order.status === 'REFUNDED') return;
  if (order.status === 'NEEDS_REVIEW') return;

  if (order.status === 'FAILED') {
    await refundFailedOrder(orderId);
    return;
  }

  await holdForReview(orderId, reason);
}

/**
 * Falha OPERACIONAL: da para consertar e reprocessar. Retem o pedido para acao
 * humana no /admin e NAO estorna — nesses casos o cliente prefere a foto ao
 * dinheiro, e estornar joga fora uma venda ja ganha por um problema nosso.
 *
 * O estorno continua existindo, so deixa de ser automatico: e um botao no
 * /admin. A contrapartida e que alguem precisa OLHAR o painel — nao ha push
 * hoje, e um pedido esquecido aqui fica com o dinheiro do cliente e sem foto.
 */
export async function holdForReview(orderId: string, reason: string): Promise<void> {
  await prisma.order.updateMany({
    where: { id: orderId, status: { notIn: ['READY', 'REFUNDED'] } },
    data: { status: 'NEEDS_REVIEW', failureReason: reason },
  });
  console.error(`[generation] pedido ${orderId} RETIDO para revisão: ${reason}`);
}

async function failOrder(orderId: string, reason: string) {
  await prisma.order.updateMany({
    where: { id: orderId, status: { notIn: ['READY', 'REFUNDED', 'NEEDS_REVIEW'] } },
    data: { status: 'FAILED', failureReason: reason },
  });
}

/**
 * A extensao da selfie nao esta no banco, entao procuramos entre as aceitas.
 * Alternativa seria gravar mais uma coluna so para isto — quatro statObject
 * baratos resolvem sem migracao.
 */
async function loadSelfie(orderId: string): Promise<Buffer> {
  for (const ext of SELFIE_EXTS) {
    try {
      return await getObject(keys.selfie(orderId, ext));
    } catch {
      continue;
    }
  }
  throw new UnrecoverableError(`selfie do pedido ${orderId} não está no storage`);
}

/**
 * Carrega as fotos de referencia da figura.
 *
 * Faltar ALGUMA e degradacao aceitavel: `multiRefPrompt` se adapta a quantidade
 * e duas referencias ainda ancoram bem a identidade. Faltarem TODAS nao e
 * degradacao, e outro produto — o modelo passa a desenhar a figura "de memoria",
 * e o resultado sai parecido mas com a roupa errada (jaqueta generica em vez de
 * terno, faixa e broche). Foi medido em 2026-08-13: o pedido virava READY e era
 * entregue assim, sem um unico erro no log.
 *
 * Por isso zero referencias derruba o job em vez de gerar. E falha OPERACIONAL:
 * reprocessar resolve assim que os objetos voltarem, entao o pedido fica retido
 * em NEEDS_REVIEW esperando acao no /admin — sem estorno automatico.
 */
async function loadReferences(orderId: string, objectKeys: string[]): Promise<Buffer[]> {
  const esperadas = objectKeys.slice(0, 3);
  const loaded = await Promise.all(
    esperadas.map(async (key) => {
      try {
        return await getObject(key);
      } catch {
        console.warn(`[generation] referência ausente: ${key}`);
        return null;
      }
    }),
  );

  const references = loaded.filter((b): b is Buffer => b !== null);

  if (references.length === 0) {
    const motivo = `Nenhuma foto de referência da figura foi encontrada no storage (${esperadas.join(', ')}).`;
    await holdForReview(orderId, motivo);
    throw new UnrecoverableError(motivo);
  }

  if (references.length < esperadas.length) {
    console.warn(
      `[generation] pedido ${orderId} gerado com ${references.length} de ${esperadas.length} referências`,
    );
  }

  return references;
}

const daysFromNow = (days: number) => new Date(Date.now() + days * 24 * 3600 * 1000);
