import { getFigure } from '@/content';
import { loadOrder, tokenFrom } from '@/lib/orders';
import { prisma } from '@/lib/prisma';
import { presignedAttachment, presignedDownload } from '@/lib/storage';

export const dynamic = 'force-dynamic';

/**
 * Entrega os links do resultado. O bucket e privado: o que sai daqui sao URLs
 * assinadas de curta duracao, geradas na hora.
 *
 * Desde 2026-08-13 um pedido pode ter mais de uma foto, entao a resposta traz
 * uma lista. Um pedido RETIDO tambem e servido, com as fotos que ja ficaram
 * prontas: quem pagou por tres e recebeu duas deve poder baixar as duas
 * enquanto a terceira e resolvida.
 */
export async function GET(req: Request, ctx: RouteContext<'/api/orders/[id]/result'>) {
  const { id } = await ctx.params;

  const order = await loadOrder(id, tokenFrom(req));
  if (!order) return Response.json({ error: 'Pedido não encontrado' }, { status: 404 });

  // A checagem de status e o paywall. Sem ela, um pedido PENDING entregaria a
  // imagem de graca assim que o worker terminasse.
  if (order.status !== 'READY' && order.status !== 'NEEDS_REVIEW') {
    return Response.json({ error: 'Ainda não está pronto', status: order.status }, { status: 409 });
  }

  const figure = await getFigure(order.figureSlug);

  const items = await prisma.orderItem.findMany({
    where: { orderId: order.id, status: 'DONE' },
    orderBy: { sortOrder: 'asc' },
    include: { assets: true },
  });

  // Pedidos anteriores a 2026-08-13 nao tem item: os assets estao presos ao
  // pedido. Sem este ramo, uma foto ja vendida sumiria da tela do cliente.
  const legado =
    items.length === 0
      ? await prisma.asset.findMany({
          where: { orderId: order.id, orderItemId: null, kind: { in: ['RESULT', 'PREVIEW'] } },
        })
      : [];

  const grupos =
    items.length > 0
      ? items.map((i) => ({ figureSlug: i.figureSlug, sceneId: i.sceneId, assets: i.assets }))
      : [{ figureSlug: order.figureSlug, sceneId: order.sceneId, assets: legado }];

  const photos = (
    await Promise.all(
      grupos.map(async (g) => {
        const result = g.assets.find((a) => a.kind === 'RESULT');
        const preview = g.assets.find((a) => a.kind === 'PREVIEW');
        if (!result) return null;

        const fig = g.figureSlug === order.figureSlug ? figure : await getFigure(g.figureSlug);
        const scene = fig?.scenes.find((s) => s.id === g.sceneId);

        // Nome com que o arquivo chega na galeria da pessoa. "result.png" no
        // meio de mil fotos nao diz nada; isto diz.
        const filename = `${g.figureSlug}-${g.sceneId}.png`;

        const [resultUrl, downloadUrl, previewUrl] = await Promise.all([
          presignedDownload(result.objectKey, 3600),
          presignedAttachment(result.objectKey, filename, 3600),
          preview ? presignedDownload(preview.objectKey, 3600) : Promise.resolve(null),
        ]);

        return {
          figureSlug: g.figureSlug,
          label: fig?.productName ?? g.figureSlug,
          sceneLabel: scene?.label ?? '',
          resultUrl,
          downloadUrl,
          previewUrl,
          width: result.width,
          height: result.height,
        };
      }),
    )
  ).filter((p): p is NonNullable<typeof p> => p !== null);

  if (photos.length === 0) {
    return Response.json({ error: 'Resultado indisponível', status: order.status }, { status: 409 });
  }

  const bonuses = await Promise.all(
    (figure?.bonuses ?? []).map(async (b) => ({
      label: b.label,
      description: b.description,
      url: await presignedAttachment(b.objectKey, b.objectKey.split('/').pop() ?? 'bonus', 3600),
    })),
  );

  // Quantas o cliente comprou contra quantas ficaram prontas. A tela usa isso
  // para dizer a verdade quando falta alguma, em vez de fingir que acabou.
  const compradas = await prisma.orderItem.count({ where: { orderId: order.id } });

  return Response.json(
    {
      photos,
      bonuses,
      compradas: compradas || photos.length,
      prontas: photos.length,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
