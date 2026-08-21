/**
 * Outra metade do teste ponta a ponta: inspeciona o que o cliente receberia.
 *
 * Le o pedido, os jobs e os assets direto do banco e baixa o RESULT do storage.
 * Nao passa pela API de proposito — quando o /api/orders/.../result falhou por
 * instabilidade do `next dev`, foi isto que provou que a geracao tinha dado
 * certo. Serve tambem para conferir custo gravado, providerJobId e expiracao.
 *
 *   pnpm tsx scripts/e2e-pega-resultado.ts <orderId> [destino.png]
 */
import { writeFileSync } from 'node:fs';
import { prisma } from '../src/lib/prisma';
import { getObject } from '../src/lib/storage';

async function main() {
  const orderId = process.argv[2];
  const destino = process.argv[3] ?? 'resultado-e2e.png';

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { jobs: true, assets: true },
  });
  if (!order) throw new Error('pedido nao encontrado');

  console.log('status do pedido :', order.status);
  console.log('pago em          :', order.paidAt?.toISOString() ?? '-');
  console.log('pronto em        :', order.readyAt?.toISOString() ?? '-');
  console.log('notificado em    :', order.notifiedAt?.toISOString() ?? '-');

  for (const j of order.jobs) {
    console.log(`job ${j.id}`);
    console.log('  status       :', j.status);
    console.log('  providerJobId:', j.providerJobId ?? '-');
    console.log('  custo(cents) :', j.costUsdCents);
    console.log('  erro         :', j.errorCode ?? '-', j.errorDetail ?? '');
  }

  for (const a of order.assets) {
    console.log(`asset ${a.kind}`);
    console.log('  objectKey    :', a.objectKey);
    console.log('  dimensoes    :', `${a.width}x${a.height}`, `${a.bytes} bytes`, a.mimeType);
    console.log('  expira em    :', a.expiresAt.toISOString());

    if (a.kind === 'RESULT') {
      writeFileSync(destino, await getObject(a.objectKey));
      console.log('  -> salvo em  :', destino);
    }
  }
}

main()
  .catch((e) => {
    console.error('ERRO:', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
