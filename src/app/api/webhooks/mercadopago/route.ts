import { getPayment, verifyWebhookSignature } from '@/lib/mercadopago';
import { sendPurchaseEvent } from '@/lib/meta';
import { prisma } from '@/lib/prisma';
import { enqueueGeneration } from '@/lib/queue';

export const dynamic = 'force-dynamic';

/**
 * Unico caminho que autoriza uma geracao.
 *
 * Tres regras que nao podem ser relaxadas:
 *  1. Assinatura validada ANTES de qualquer leitura do corpo. O endpoint e
 *     publico; sem isso um POST forjado libera imagem de graca.
 *  2. O status vem de uma consulta a API do Mercado Pago, nunca do corpo da
 *     notificacao — o corpo diz apenas QUAL pagamento olhar.
 *  3. Tudo idempotente. O MP reenvia a mesma notificacao varias vezes, e cada
 *     reprocessamento ingenuo seria uma imagem a mais paga por nos.
 */
export async function POST(req: Request) {
  const url = new URL(req.url);
  const dataId = url.searchParams.get('data.id') ?? url.searchParams.get('id');

  const valid = verifyWebhookSignature({
    signatureHeader: req.headers.get('x-signature'),
    requestId: req.headers.get('x-request-id'),
    dataId,
  });

  if (!valid) {
    console.warn('[webhook] assinatura invalida', { dataId });
    return Response.json({ error: 'assinatura inválida' }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { type?: string; action?: string };

  // O MP manda varios tipos no mesmo endpoint. 200 nos demais para ele parar de
  // reenviar — um erro aqui viraria retentativa eterna de algo que ignoramos.
  if (body.type && body.type !== 'payment') {
    return Response.json({ ignored: body.type });
  }
  if (!dataId) return Response.json({ error: 'sem data.id' }, { status: 400 });

  // Falha ao consultar o MP e transitoria. Respondemos 503 (e nao deixamos
  // estourar em 500) para que a retentativa do proprio Mercado Pago resolva —
  // e para que o log diga qual pagamento ficou pendente de confirmacao.
  let payment;
  try {
    payment = await getPayment(dataId);
  } catch (err) {
    console.error('[webhook] não consegui consultar o pagamento', dataId, err);
    return Response.json({ error: 'indisponível, tente de novo' }, { status: 503 });
  }

  const orderId = payment.external_reference;
  if (!orderId) {
    console.warn('[webhook] pagamento sem external_reference', dataId);
    return Response.json({ ignored: 'sem external_reference' });
  }

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) {
    console.warn('[webhook] pedido inexistente', orderId);
    return Response.json({ ignored: 'pedido inexistente' });
  }

  const status = payment.status ?? 'unknown';

  if (status !== 'approved') {
    // Recusa e cancelamento sao informacao util na tela do cliente, mas nao
    // mudam o estado do pedido: ele continua PENDING e pode ser tentado de novo.
    await prisma.order.update({
      where: { id: order.id },
      data: { mpStatus: status, mpPaymentId: String(payment.id) },
    });
    return Response.json({ ok: true, status });
  }

  // `updateMany` com filtro de status e o ponto de idempotencia: a primeira
  // notificacao aprova e as seguintes atualizam 0 linhas, sem enfileirar de novo.
  const { count } = await prisma.order.updateMany({
    where: { id: order.id, status: 'PENDING' },
    data: {
      status: 'PAID',
      mpStatus: status,
      mpPaymentId: String(payment.id),
      paidAt: new Date(),
    },
  });

  if (count === 0) {
    return Response.json({ ok: true, duplicated: true });
  }

  await enqueueGeneration(order.id);

  // Server-side em vez de pixel no browser: sobrevive a bloqueador de anuncio,
  // ao ITP do Safari e ao usuario que fecha a aba antes do redirect.
  await sendPurchaseEvent(order.id).catch((err) =>
    console.error('[webhook] Meta CAPI falhou (nao bloqueia)', err),
  );

  return Response.json({ ok: true, queued: true });
}
