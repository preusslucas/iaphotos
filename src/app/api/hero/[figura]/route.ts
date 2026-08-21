import { prisma } from '@/lib/prisma';
import { getObject } from '@/lib/storage';

export const dynamic = 'force-dynamic';

/**
 * Serve a foto de exemplo da figura a partir do bucket, numa URL ESTAVEL.
 *
 * Assinar a URL na landing quebraria o cache: a assinatura muda a cada render,
 * e o `next/image` trataria a mesma foto como imagem nova toda vez —
 * re-otimizando e piorando o LCP justamente na pagina que recebe trafego pago.
 *
 * Servir sem assinatura nao expoe nada: a hero e material de marketing, feita
 * para ser vista por qualquer visitante. Selfie e resultado do cliente, que sao
 * privados, nao passam por aqui.
 */
export async function GET(_req: Request, ctx: RouteContext<'/api/hero/[figura]'>) {
  const { figura } = await ctx.params;

  const figure = await prisma.figure.findUnique({
    where: { slug: figura },
    select: { heroImage: true },
  });

  // Caminho de `public/` nao passa por aqui — o Next ja serve direto.
  if (!figure?.heroImage || figure.heroImage.startsWith('/')) {
    return new Response('sem imagem', { status: 404 });
  }

  let bytes: Buffer;
  try {
    bytes = await getObject(figure.heroImage);
  } catch {
    console.error('[hero] chave no banco sem objeto no bucket:', figure.heroImage);
    return new Response('sem imagem', { status: 404 });
  }

  const ext = figure.heroImage.split('.').pop()?.toLowerCase();
  const tipo =
    ext === 'png' ? 'image/png' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/webp';

  return new Response(new Uint8Array(bytes), {
    headers: {
      'Content-Type': tipo,
      // 5 minutos: curto o bastante para uma troca no /admin aparecer logo,
      // longo o bastante para a landing nao bater no bucket a cada visita.
      // `stale-while-revalidate` serve a antiga enquanto busca a nova.
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
    },
  });
}
