import type { Order } from '@prisma/client';
import { env } from './env';
import { prisma } from './prisma';
import { safeEqual } from './tokens';

/**
 * Carrega um pedido exigindo o token de acesso.
 *
 * Toda rota que expoe dados de pedido passa por aqui. Centralizar impede o erro
 * classico de uma rota nova esquecer a checagem e vazar o resultado alheio — e
 * a comparacao e em tempo constante, para nao dar pistas por tempo de resposta.
 */
export async function loadOrder(orderId: string, token: string | null): Promise<Order | null> {
  if (!token) return null;

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return null;

  return safeEqual(order.accessToken, token) ? order : null;
}

/** Le o token do header ou da query — o polling usa header, o link de e-mail usa query. */
export function tokenFrom(req: Request): string | null {
  const header = req.headers.get('x-order-token');
  if (header) return header;
  return new URL(req.url).searchParams.get('token');
}

/**
 * O que o front precisa saber para desenhar a tela de progresso.
 *
 * `failed` e `needsReview` sao estados DIFERENTES para o cliente, e a diferenca
 * e sobre o dinheiro dele: em `failed` o estorno ja foi disparado, em
 * `needsReview` o pagamento continua conosco enquanto alguem resolve. Nunca
 * junte os dois — dizer "foi estornado" para quem nao foi estornado e a origem
 * de chargeback e reclamacao publica.
 */
export function publicStatus(order: Order) {
  const needsReview = order.status === 'NEEDS_REVIEW';

  return {
    status: order.status,
    paid: order.paidAt !== null,
    ready: order.status === 'READY',
    failed: order.status === 'FAILED' || order.status === 'REFUNDED',
    needsReview,

    // O motivo de uma falha operacional e escrito para VOCE, no /admin, e cita
    // chave de storage e nome de bucket. Mandar isso para a tela do cliente
    // vazaria detalhe de infraestrutura e nao diria nada a ele. O texto
    // completo continua no banco, so nao sai por aqui.
    failureReason: needsReview ? null : order.failureReason,
    mpStatus: order.mpStatus,

    // O numero do suporte sai sempre que houver token valido — ou seja, so
    // para quem ja tem um pedido criado, nunca no bundle publico (por isso
    // NAO e NEXT_PUBLIC_). Antes so saia em NEEDS_REVIEW, mas gente travada na
    // tela do Pix — que nao sabe se o QR esta errado, se o banco caiu, etc. —
    // tambem precisa de uma saida, e e o estado com MAIS gente perdendo a
    // venda por duvida.
    supportWhatsapp: env().SUPPORT_WHATSAPP ?? null,
  };
}
