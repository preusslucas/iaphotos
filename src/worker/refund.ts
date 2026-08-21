import { refundPayment } from '@/lib/mercadopago';
import { prisma } from '@/lib/prisma';
import { sendFailureEmail } from '@/lib/email';

/**
 * Estorno de um pedido que nao pode ser entregue.
 *
 * Idempotente por `refundedAt`: o worker pode chegar aqui por caminhos
 * diferentes (esgotou tentativas, moderacao, reprocessamento manual no admin) e
 * estornar duas vezes seria um problema contabil de verdade.
 */
export async function refundFailedOrder(
  orderId: string,
  { permitirRetido = false } = {},
): Promise<void> {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || !order.mpPaymentId || order.refundedAt) return;
  if (order.status === 'READY') return; // entregue: nao ha o que estornar

  // Segunda barreira, alem da guarda em `settleFailedOrder`: um pedido retido
  // espera decisao humana, e estornar por engano aqui e irreversivel. O /admin
  // passa `permitirRetido` justamente porque ali a decisao FOI humana.
  if (order.status === 'NEEDS_REVIEW' && !permitirRetido) {
    console.warn(`[refund] ${orderId} está retido para revisão; estorno automático ignorado`);
    return;
  }

  try {
    await refundPayment(order.mpPaymentId);
    await prisma.order.update({
      where: { id: order.id },
      data: { status: 'REFUNDED', refundedAt: new Date() },
    });
    console.log(`[refund] pedido ${order.id} estornado`);
  } catch (err) {
    // Nao relanca: o pedido ja esta FAILED e visivel no /admin. Transformar
    // isso em excecao so faria o BullMQ repetir a geracao que ja desistimos.
    console.error(`[refund] falha ao estornar ${order.id} — estorne à mão no painel do MP`, err);
    return;
  }

  await sendFailureEmail(order.id).catch((err) =>
    console.error('[refund] e-mail de aviso falhou', order.id, err),
  );
}
