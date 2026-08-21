import { prisma } from '@/lib/prisma';
import { getObject } from '@/lib/storage';

export const dynamic = 'force-dynamic';

/**
 * Serve a imagem de exemplo de uma cena a partir do bucket, numa URL ESTAVEL.
 *
 * Por que nao usar URL assinada direto na landing: a assinatura muda a cada
 * render, entao o `next/image` trataria a mesma foto como uma imagem nova toda
 * vez — re-otimizando, enchendo o cache e piorando o LCP justamente na pagina
 * que recebe trafego pago. Com URL estavel, o navegador e o otimizador
 * cacheiam de verdade.
 *
 * Nao ha risco em servir sem assinatura: a amostra e material de marketing,
 * exibido para qualquer visitante. O que continua privado — selfie e resultado
 * do cliente — nao passa por aqui.
 */
export async function GET(req: Request, ctx: RouteContext<'/api/samples/[figura]/[cena]'>) {
  const { figura, cena } = await ctx.params;

  const scene = await prisma.scene.findUnique({
    where: { figureSlug_sceneId: { figureSlug: figura, sceneId: cena } },
    select: { sampleImage: true },
  });

  // Caminho de `public/` nao passa por aqui: o Next ja serve. Isso so acontece
  // se alguem montar a URL a mao para uma cena que ainda usa o formato antigo.
  if (!scene?.sampleImage || scene.sampleImage.startsWith('/')) {
    return new Response('sem amostra', { status: 404 });
  }

  let bytes: Buffer;
  try {
    bytes = await getObject(scene.sampleImage);
  } catch {
    console.error('[samples] chave no banco sem objeto no bucket:', scene.sampleImage);
    return new Response('sem amostra', { status: 404 });
  }

  const ext = scene.sampleImage.split('.').pop()?.toLowerCase();
  const tipo =
    ext === 'png' ? 'image/png' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/webp';

  return new Response(new Uint8Array(bytes), {
    headers: {
      'Content-Type': tipo,
      // 5 minutos: curto o bastante para uma amostra trocada no /admin aparecer
      // logo, longo o bastante para a landing nao buscar no bucket a cada
      // visita. `stale-while-revalidate` serve a versao antiga enquanto busca a
      // nova, entao ninguem espera.
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
    },
  });
}
