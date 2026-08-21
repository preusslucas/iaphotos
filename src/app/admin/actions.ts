'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ADMIN_COOKIE, isAuthenticated, passwordMatches, sessionCookie } from '@/lib/admin-auth';
import { prisma } from '@/lib/prisma';
import { enqueueGeneration } from '@/lib/queue';

/**
 * Toda ação verifica a sessão por conta própria.
 *
 * Server Actions são endpoints HTTP de verdade — quem descobrir o id da ação
 * pode chamá-la sem nunca carregar a página. Confiar na proteção do layout
 * deixaria o kill switch e o reprocessamento abertos para qualquer um.
 */
async function requireAdmin() {
  if (!(await isAuthenticated())) throw new Error('não autorizado');
}

export async function login(formData: FormData) {
  const password = String(formData.get('password') ?? '');

  if (!passwordMatches(password)) {
    redirect('/admin?erro=1');
  }

  (await cookies()).set(sessionCookie());
  redirect('/admin');
}

export async function logout() {
  (await cookies()).delete(ADMIN_COOKIE);
  redirect('/admin');
}

/**
 * Libera a geração de um pedido PENDENTE, sem cobrar.
 *
 * Existe por dois motivos, e o segundo é o que importa em produção:
 *
 *  1. Validar a geração num ambiente novo antes de o pagamento existir — foi
 *     como a produção foi conferida pela primeira vez.
 *  2. **Webhook perdido.** O webhook do Mercado Pago é o único caminho que
 *     autoriza uma geração. Se ele se perder — instabilidade do MP, deploy no
 *     momento errado, rede — o cliente paga e o pedido fica PENDING para
 *     sempre. Sem este botão, a saída seria editar o banco à mão.
 *
 * NÃO cobra e NÃO confere pagamento: quem clica está afirmando que o dinheiro
 * entrou (ou que é um teste). Por isso `mpPaymentId` continua nulo e o
 * `mpStatus` registra que a liberação foi manual — um pedido liberado assim não
 * pode ser estornado pelo sistema, o que está certo, já que nada foi cobrado
 * por ele aqui dentro.
 */
export async function liberarSemCobrar(orderId: string) {
  await requireAdmin();

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  });
  if (!order || order.status !== 'PENDING') return;

  // Sem selfie no storage a geração falharia logo depois, e o pedido sairia de
  // PENDING para retido — troca um estado claro por um confuso.
  const { keys, objectExists } = await import('@/lib/storage');
  const temSelfie = (
    await Promise.all(
      ['jpg', 'jpeg', 'png', 'webp'].map((ext) => objectExists(keys.selfie(order.id, ext))),
    )
  ).some(Boolean);

  if (!temSelfie || order.items.length === 0) {
    console.warn(`[admin] ${orderId} não pode ser liberado: sem selfie ou sem itens`);
    return;
  }

  await prisma.order.update({
    where: { id: orderId },
    data: {
      status: 'PAID',
      paidAt: new Date(),
      mpStatus: 'liberado_no_painel',
      failureReason: null,
    },
  });

  console.warn(`[admin] pedido ${orderId} LIBERADO SEM COBRANÇA pelo painel`);
  await enqueueGeneration(orderId);

  revalidatePath('/admin');
}

/** Recoloca um pedido pago na fila. Útil quando a falha foi do provedor. */
export async function reprocess(orderId: string) {
  await requireAdmin();

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || order.status === 'READY' || order.status === 'PENDING') return;

  await prisma.order.update({
    where: { id: orderId },
    data: { status: 'PAID', failureReason: null },
  });

  // O jobId é o orderId, então o job antigo precisa sair antes: sem isso o
  // BullMQ trata o novo como duplicado e o reprocessamento não acontece.
  const { getGenerationQueue } = await import('@/lib/queue');
  await getGenerationQueue().remove(orderId).catch(() => {});
  await enqueueGeneration(orderId);

  revalidatePath('/admin');
}

/**
 * Estorna um pedido à mão.
 *
 * O estorno automático só acontece em falha definitiva (moderação). Todo o
 * resto fica retido em NEEDS_REVIEW e chega aqui: primeiro você tenta consertar
 * a causa e reprocessar; se não der, devolve o dinheiro por este botão.
 *
 * `permitirRetido` existe porque o `refundFailedOrder` se recusa a estornar um
 * pedido retido — a guarda é contra o caminho automático, e aqui a decisão é
 * humana, que é justamente a exceção que ela prevê.
 */
export async function refund(orderId: string) {
  await requireAdmin();

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || order.status === 'READY' || order.status === 'REFUNDED') return;

  const { refundFailedOrder } = await import('@/worker/refund');
  await refundFailedOrder(orderId, { permitirRetido: true });

  revalidatePath('/admin');
}

/** Liga/desliga uma figura. É a alavanca para uma notificação extrajudicial. */
export async function toggleFigure(slug: string, enabled: boolean) {
  await requireAdmin();

  await prisma.figure.update({ where: { slug }, data: { enabled } });

  revalidatePath('/admin');
  revalidatePath(`/${slug}`);
}
