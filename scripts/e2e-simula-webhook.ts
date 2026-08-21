/**
 * Metade do teste ponta a ponta: libera a geracao sem passar pelo Mercado Pago.
 *
 * Reproduz exatamente o que o webhook do Mercado Pago faz depois de um
 * pagamento aprovado (src/app/api/webhooks/mercadopago/route.ts, o updateMany
 * idempotente seguido de enqueueGeneration). Existe porque MP_ACCESS_TOKEN
 * nesta maquina e placeholder: nao da para consultar um pagamento real nem
 * assinar a notificacao, e a perna de pagamento nao foi tocada pela troca de
 * provider — o que precisa de cobertura e o que vem DEPOIS dela.
 *
 *   pnpm tsx scripts/e2e-simula-webhook.ts <orderId>
 */
import { prisma } from '../src/lib/prisma';
import { enqueueGeneration } from '../src/lib/queue';

async function main() {
  const orderId = process.argv[2];
  if (!orderId) throw new Error('uso: tsx scripts/e2e-simula-webhook.ts <orderId>');

  const { count } = await prisma.order.updateMany({
    where: { id: orderId, status: 'PENDING' },
    data: {
      status: 'PAID',
      mpStatus: 'approved',
      mpPaymentId: `e2e-${Date.now()}`,
      paidAt: new Date(),
    },
  });

  if (count === 0) {
    console.log('nada a fazer: pedido nao estava PENDING (idempotencia OK)');
    return;
  }

  await enqueueGeneration(orderId);
  console.log(`pedido ${orderId} -> PAID e enfileirado`);
}

main()
  .catch((e) => {
    console.error('ERRO:', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
