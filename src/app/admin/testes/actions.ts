'use server';

import { revalidatePath } from 'next/cache';
import { getFigure } from '@/content';
import { TERMS_VERSION } from '@/content/terms';
import { comAviso, erro, requireAdmin } from '@/lib/admin-actions';
import { inspect } from '@/lib/image';
import { sincronizaItens } from '@/lib/order-items';
import { prisma } from '@/lib/prisma';
import { enqueueGeneration } from '@/lib/queue';
import { keys, putObject, removeObject } from '@/lib/storage';
import { newAccessToken } from '@/lib/tokens';

const EXT: Record<string, 'jpg' | 'png' | 'webp'> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/**
 * Teto de combinacoes por bateria.
 *
 * Era 24, e 24 estava errado: barrava a matriz completa de uma figura de 5
 * cenas (5x3x4 = 60), que e exatamente a rodada que alguem quer fazer ao montar
 * uma figura nova. E a justificativa que escrevi — "para nao gastar dolares" —
 * errava a ordem de grandeza: 60 imagens custam US$0,30.
 *
 * O teto agora existe so contra acidente de verdade (formulario forjado, script
 * repetido), nao contra a rodada mais util da ferramenta. Quem informa o gasto e
 * o contador ao vivo na tela, e nao uma recusa depois do clique.
 */
const MAX_COMBINACOES = 120;

const ENQUADRAMENTOS = ['CHEST_UP', 'HALF_BODY', 'CLOSE_SELFIE'] as const;
const CLIMAS = ['NONE', 'DISCREET', 'FLAGS', 'CROWD'] as const;

type Enquadramento = (typeof ENQUADRAMENTOS)[number];
type Clima = (typeof CLIMAS)[number];

const ehEnquadramento = (v: string): v is Enquadramento =>
  (ENQUADRAMENTOS as readonly string[]).includes(v);
const ehClima = (v: string): v is Clima => (CLIMAS as readonly string[]).includes(v);

export async function rodarTeste(fd: FormData) {
  await requireAdmin();

  return comAviso('/admin/testes', async () => {
    const figureSlug = String(fd.get('figureSlug') ?? '');
    const cenas = fd.getAll('cena').map(String).filter(Boolean);

    // Validado contra a lista, e nao convertido com `as`: os valores chegam de
    // um formulario, que e entrada de fora. Um cast faria uma string qualquer
    // atravessar ate o banco e so estourar la, com mensagem de driver.
    const enquadramentos = fd.getAll('enquadramento').map(String).filter(ehEnquadramento);
    const climas = fd.getAll('clima').map(String).filter(ehClima);

    if (!cenas.length) erro('Escolha pelo menos uma cena.');
    if (!enquadramentos.length) erro('Escolha pelo menos um enquadramento.');
    if (!climas.length) erro('Escolha pelo menos um clima.');

    const total = cenas.length * enquadramentos.length * climas.length;
    if (total > MAX_COMBINACOES) {
      erro(
        `${total} combinações passam do teto de ${MAX_COMBINACOES} por rodada. ` +
          'Divida em duas rodadas.',
      );
    }

    const figure = await getFigure(figureSlug);
    if (!figure) erro('Figura não encontrada.');
    // Sem referencia a geracao falha e o pedido cai retido, o que aqui so
    // produziria 12 falhas identicas e nenhuma informacao.
    if (figure.referenceKeys.length === 0) {
      erro('Esta figura não tem foto de referência — não há como gerar nada com ela.');
    }

    const file = fd.get('selfie');
    if (!(file instanceof File) || file.size === 0) erro('Escolha uma foto de base.');

    const ext = EXT[file.type];
    if (!ext) erro('Formato não suportado. Use JPG, PNG ou WEBP.');
    if (file.size > 10 * 1024 * 1024) erro('Arquivo grande demais. O limite é 10MB.');

    const buf = Buffer.from(await file.arrayBuffer());
    let facts;
    try {
      facts = await inspect(buf);
    } catch {
      erro('Não conseguimos ler essa imagem.');
    }
    // Mesmo piso do upload do cliente: testar com uma base que o funil recusaria
    // mediria um caminho que nenhum comprador percorre.
    if (Math.min(facts.width, facts.height) < 512) {
      erro(`Foto pequena demais (${facts.width}x${facts.height}). O mínimo é 512 pixels.`);
    }

    const lote = `t${Date.now().toString(36)}`;
    const criados: string[] = [];

    for (const sceneId of cenas) {
      for (const framing of enquadramentos) {
        for (const mood of climas) {
          const order = await prisma.order.create({
            data: {
              accessToken: newAccessToken(),
              figureSlug,
              sceneId,
              framing,
              mood,
              isTest: true,
              // PAID e paidAt porque e o que o worker exige para gerar — o mesmo
              // que `liberarSemCobrar` faz. `amountCents: 0` e `mpPaymentId`
              // nulo registram que nao houve dinheiro.
              status: 'PAID',
              paidAt: new Date(),
              amountCents: 0,
              mpStatus: `teste_${lote}`,
              consent: {
                create: { termsVersion: TERMS_VERSION, ip: 'painel', userAgent: 'bancada' },
              },
            },
          });

          await sincronizaItens(order.id, figure, sceneId, false);

          // A MESMA base em todas as combinacoes, de proposito: variar a selfie
          // junto com o estilo tornaria impossivel saber qual das duas mudancas
          // causou a diferenca no resultado.
          await putObject(keys.selfie(order.id, ext), buf, file.type);
          await enqueueGeneration(order.id);

          criados.push(order.id);
        }
      }
    }

    console.warn(`[admin] bancada ${lote}: ${criados.length} geração(ões) enfileirada(s)`);
    revalidatePath('/admin/testes');
  });
}

/**
 * Apaga uma bateria inteira: pedidos, itens, jobs e os objetos no bucket.
 *
 * Sem isto a bancada vira um deposito — cada rodada deixa 12 pedidos e 24
 * objetos para tras, e em duas semanas ninguem acha o teste que interessa.
 */
export async function apagarLote(lote: string) {
  await requireAdmin();

  return comAviso('/admin/testes', async () => {
    const orders = await prisma.order.findMany({
      where: { isTest: true, mpStatus: `teste_${lote}` },
      include: { assets: true },
    });

    for (const order of orders) {
      // Bucket ANTES do banco: se apagar a linha primeiro e o storage falhar,
      // sobra objeto sem dono e ninguem mais sabe que ele existe.
      for (const asset of order.assets) {
        await removeObject(asset.objectKey).catch(() => {});
      }
      for (const ext of ['jpg', 'png', 'webp']) {
        await removeObject(keys.selfie(order.id, ext)).catch(() => {});
      }
    }

    // Itens, jobs, assets e consentimento saem por cascade.
    await prisma.order.deleteMany({ where: { isTest: true, mpStatus: `teste_${lote}` } });

    revalidatePath('/admin/testes');
  });
}
