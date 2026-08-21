import { z } from 'zod';
import { getFigure, getScene } from '@/content';
import { sincronizaItens } from '@/lib/order-items';
import { createCardCharge, createPixCharge } from '@/lib/mercadopago';
import { loadOrder, tokenFrom } from '@/lib/orders';
import { prisma } from '@/lib/prisma';
import { clientIp, rateLimit, tooManyRequests } from '@/lib/ratelimit';
import { checkFaces } from '@/lib/face-check';
import { inspect, validateSelfie } from '@/lib/image';
import { getObject, keys, objectExists } from '@/lib/storage';

export const dynamic = 'force-dynamic';

const baseSchema = z.object({
  orderId: z.string().min(1),
  email: z.email('E-mail inválido'),
  phone: z.string().trim().min(8).max(20).optional(),
  fileExt: z.enum(['jpg', 'jpeg', 'png', 'webp'], {
    message: 'Use uma foto JPG, PNG ou WEBP.',
  }),
  /**
   * Order bump: leva as fotos com os lideres adicionais.
   *
   * A tela manda so o SIM ou NAO — o preco e recalculado no servidor a partir
   * do banco. Se o valor viesse daqui, um POST forjado compraria o combo pelo
   * preco que quisesse.
   */
  combo: z.boolean().default(false),
});

const bodySchema = z.discriminatedUnion('method', [
  baseSchema.extend({ method: z.literal('pix') }),
  baseSchema.extend({
    method: z.literal('card'),
    cardToken: z.string().min(1),
    paymentMethodId: z.string().min(1),
    installments: z.number().int().min(1).max(12),
    issuerId: z.string().optional(),
    identification: z.object({ type: z.string(), number: z.string() }).optional(),
  }),
]);

/**
 * Cria a cobranca. NAO libera a geracao: quem faz isso e o webhook, depois de
 * o Mercado Pago confirmar. Ate mesmo o cartao aprovado na hora passa pelo
 * webhook, para haver um unico caminho de liberacao no sistema.
 */
export async function POST(req: Request) {
  const ip = clientIp(req);
  const limit = await rateLimit(`checkout:${ip}`, 8, 600);
  if (!limit.allowed) return tooManyRequests(limit);

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? 'Dados inválidos' },
      { status: 400 },
    );
  }
  const body = parsed.data;

  const order = await loadOrder(body.orderId, tokenFrom(req));
  if (!order) return Response.json({ error: 'Pedido não encontrado' }, { status: 404 });

  // Um pedido ja pago que recebe checkout de novo e duplo clique ou reload, não
  // uma segunda compra.
  if (order.status !== 'PENDING') {
    return Response.json({ error: 'Este pedido já foi processado', status: order.status }, { status: 409 });
  }

  // Prova que a selfie chegou ao MinIO antes de cobrar. Sem esta checagem,
  // um upload que falhou no browser vira um pedido pago e impossivel de gerar.
  const selfieKey = keys.selfie(order.id, body.fileExt);
  if (!(await objectExists(selfieKey))) {
    return Response.json({ error: 'Não recebemos a sua foto. Envie novamente.' }, { status: 409 });
  }

  // Ultima chance de barrar uma foto que sabemos que vai falhar. Aqui ainda e
  // uma troca de foto; um passo adiante seria estorno, e-mail de desculpa e um
  // cliente insatisfeito. Roda no servidor, entao nao ha bytes de modelo no
  // browser nem como o cliente burlar.
  const selfie = await getObject(selfieKey);

  // Formato, resolucao e tamanho ANTES do detector: e a checagem barata, e ela
  // ja existia — escrita, exportada e nunca chamada. O upload vai direto ao
  // MinIO por URL pre-assinada, entao ate aqui NINGUEM olhou os bytes: o
  // /api/orders so valida a extensao que o proprio cliente declara no JSON.
  // Sem isto, uma foto 447x928 (recusada pelo harness da Fase 0) passava o
  // checkout e virava R$29,90 cobrados por uma geracao que ja nasce ruim.
  let facts;
  try {
    facts = await inspect(selfie);
  } catch {
    // Arquivo corrompido ou que nao e imagem apesar da extensao declarada.
    // Fecha OPOSTO ao face-check: aqui negar e barato (o cliente troca a foto)
    // e deixar passar e caro (cobranca + estorno), entao falha FECHADO.
    return Response.json(
      { error: 'Não conseguimos ler essa foto. Envie outra.', reason: 'unreadable_image' },
      { status: 422 },
    );
  }

  const invalid = validateSelfie(facts, selfie.byteLength);
  if (invalid) {
    return Response.json({ error: invalid, reason: 'invalid_image' }, { status: 422 });
  }

  const faceCheck = await checkFaces(selfie);
  if (faceCheck.code === 'no_face' || faceCheck.code === 'multiple_faces') {
    return Response.json({ error: faceCheck.message, reason: faceCheck.code }, { status: 422 });
  }

  const figure = await getFigure(order.figureSlug);
  const scene = await getScene(order.figureSlug, order.sceneId);
  if (!figure || !scene) {
    return Response.json({ error: 'Produto não encontrado' }, { status: 404 });
  }

  // Ultimo ponto em que o pedido ainda pode mudar de forma. Depois daqui existe
  // cobranca, e o que foi cobrado tem de continuar batendo com o que sera
  // entregue — por isso os itens e o valor sao fixados AGORA, do banco, e nao
  // do que a tela mandou.
  const { itens, amountCents } = await sincronizaItens(
    order.id,
    figure,
    order.sceneId,
    body.combo,
  );

  const description =
    itens > 1
      ? `${figure.productName} — ${scene.label} (${itens} fotos)`
      : `${figure.productName} — ${scene.label}`;

  // Contato gravado ANTES de cobrar, de propósito.
  //
  // Antes ele só era salvo depois de a cobrança dar certo — então quem
  // preenchia e desistia, ou tinha o Pix recusado, sumia sem deixar rastro. E
  // esse é justamente o lead que mais vale: a pessoa já escolheu a cena, já
  // mandou a selfie e já digitou o e-mail. Ela parou a um passo.
  //
  // Não é dado a mais: já pedimos os dois campos na tela. Só deixamos de jogar
  // fora o que a pessoa entregou.
  await prisma.order.update({
    where: { id: order.id },
    data: { email: body.email, phone: body.phone },
  });

  try {
    if (body.method === 'pix') {
      const charge = await createPixCharge({
        orderId: order.id,
        amountCents,
        description,
        email: body.email,
      });

      await prisma.order.update({
        where: { id: order.id },
        data: {
          mpPaymentId: charge.paymentId,
          mpStatus: charge.status,
          mpMethod: 'pix',
        },
      });

      return Response.json({
        method: 'pix',
        status: charge.status,
        qrCode: charge.qrCode,
        qrCodeBase64: charge.qrCodeBase64,
        expiresAt: charge.expiresAt,
      });
    }

    const charge = await createCardCharge({
      orderId: order.id,
      amountCents,
      description,
      email: body.email,
      cardToken: body.cardToken,
      paymentMethodId: body.paymentMethodId,
      installments: body.installments,
      issuerId: body.issuerId,
      identification: body.identification,
    });

    await prisma.order.update({
      where: { id: order.id },
      data: {
        mpPaymentId: charge.paymentId,
        mpStatus: charge.status,
        mpMethod: 'card',
      },
    });

    return Response.json({
      method: 'card',
      status: charge.status,
      statusDetail: charge.statusDetail,
    });
  } catch (err) {
    console.error('[checkout] falha ao cobrar', order.id, err);
    return Response.json(
      { error: 'Não foi possível iniciar o pagamento. Tente novamente.' },
      { status: 502 },
    );
  }
}
