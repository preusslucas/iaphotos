import { z } from 'zod';
import { getFigure, getScene } from '@/content';
import { TERMS_VERSION } from '@/content/terms';
import { prisma } from '@/lib/prisma';
import { sincronizaItens } from '@/lib/order-items';
import { clientIp, rateLimit, tooManyRequests } from '@/lib/ratelimit';
import { keys, presignedUpload } from '@/lib/storage';
import { newAccessToken } from '@/lib/tokens';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  figureSlug: z.string().min(1),
  sceneId: z.string().min(1),
  /**
   * Extensao vinda do arquivo escolhido, restrita ao que sabemos processar.
   * Mensagem propria porque o texto padrao do Zod chega em ingles na tela de
   * quem esta comprando.
   */
  fileExt: z.enum(['jpg', 'jpeg', 'png', 'webp'], {
    message: 'Use uma foto JPG, PNG ou WEBP.',
  }),
  /**
   * Enquadramento e clima escolhidos nos passos 2 e 3.
   *
   * Validados por medicao em 2026-08-14, nota 5 nas sete combinacoes testadas.
   * O `default` mantem compatibilidade com qualquer chamada antiga e garante
   * que a ausencia caia no enquadramento que ganhou a Fase 0.
   */
  framing: z.enum(['CHEST_UP', 'HALF_BODY', 'CLOSE_SELFIE']).default('CHEST_UP'),
  mood: z.enum(['NONE', 'DISCREET', 'FLAGS', 'CROWD']).default('NONE'),

  consent: z.literal(true, { message: 'É obrigatório aceitar os termos' }),
});

/**
 * Abre um pedido e devolve uma URL pre-assinada para o browser enviar a selfie
 * DIRETO ao MinIO. O arquivo nunca passa por este processo: 10MB por request
 * ocupariam o servidor que precisa estar livre para vender.
 *
 * Nada e cobrado e nada e gerado aqui — o pedido nasce PENDING.
 */
export async function POST(req: Request) {
  const ip = clientIp(req);
  const limit = await rateLimit(`orders:${ip}`, 10, 600);
  if (!limit.allowed) return tooManyRequests(limit);

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? 'Dados inválidos' },
      { status: 400 },
    );
  }

  const { figureSlug, sceneId, fileExt, framing, mood } = parsed.data;

  const figure = await getFigure(figureSlug);
  const scene = await getScene(figureSlug, sceneId);
  if (!figure || !figure.isPrimary || !scene) {
    return Response.json({ error: 'Produto não encontrado' }, { status: 404 });
  }

  // Kill switch: uma figura desligada para de aceitar pedidos novos, mas os
  // pedidos ja pagos continuam sendo processados normalmente.
  if (!figure.enabled) {
    return Response.json(
      { error: figure.notice ?? 'Este produto está temporariamente indisponível.' },
      { status: 403 },
    );
  }

  const order = await prisma.order.create({
    data: {
      accessToken: newAccessToken(),
      figureSlug,
      sceneId,
      framing,
      mood,
      amountCents: figure.priceCents,
      consent: {
        create: {
          termsVersion: TERMS_VERSION,
          ip,
          userAgent: req.headers.get('user-agent') ?? 'desconhecido',
        },
      },
    },
  });

  // Nasce com o item principal e o preco base. O combo e escolhido na tela de
  // pagamento, e e o /api/checkout que refaz os itens e o valor — aqui ainda
  // nao se sabe se a pessoa vai levar as tres fotos.
  await sincronizaItens(order.id, figure, sceneId, false);

  const objectKey = keys.selfie(order.id, fileExt);
  const uploadUrl = await presignedUpload(objectKey, 300);

  return Response.json({
    orderId: order.id,
    accessToken: order.accessToken,
    uploadUrl,
    objectKey,
    amountCents: order.amountCents,
    bundlePriceCents: figure.bundlePriceCents ?? null,
    addons: figure.addons.filter((a) => a.vendavel).map((a) => a.productName),
  });
}
