import { loadOrder, publicStatus, tokenFrom } from '@/lib/orders';

export const dynamic = 'force-dynamic';

/**
 * Alvo do polling da tela "processando". Precisa ser barato: o cliente bate
 * aqui a cada 2s enquanto espera.
 */
export async function GET(req: Request, ctx: RouteContext<'/api/orders/[id]/status'>) {
  const { id } = await ctx.params;

  const order = await loadOrder(id, tokenFrom(req));
  // 404 tambem para token errado: um 403 confirmaria que o pedido existe.
  if (!order) return Response.json({ error: 'Pedido não encontrado' }, { status: 404 });

  return Response.json(publicStatus(order), {
    headers: { 'Cache-Control': 'no-store' },
  });
}
