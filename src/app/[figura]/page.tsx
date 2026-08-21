import { notFound } from 'next/navigation';
import { Funnel } from '@/components/funnel/Funnel';
import { LegalFooter } from '@/components/ui';
import { contaFotosEntregues, getFigure, toPublicFigure } from '@/content';

/**
 * Rota da figura: /patriota, /outra-figura...
 *
 * Publicar uma nova é cadastrá-la no /admin — nenhuma rota, componente ou query
 * muda, e não há deploy no caminho.
 *
 * SEM `generateStaticParams`, de propósito. Ele rodaria durante o `next build`
 * e o catálogo agora vive no banco — dentro do Docker, na hora do build, não há
 * banco nenhum, e o build quebrava com "Failed to collect page data". Não faz
 * falta: a rota é `force-dynamic` e é renderizada a cada request, que é o que o
 * kill switch exige de qualquer forma.
 *
 * Cuidado ao mexer: `pnpm build` na sua máquina PASSA mesmo com este erro,
 * porque o Postgres local está no ar. Quem pega é o build da imagem.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata(props: PageProps<'/[figura]'>) {
  const { figura } = await props.params;
  const figure = await getFigure(figura);
  if (!figure) return {};

  return {
    title: figure.productName,
    description: figure.subheadline,
    // Landing de tráfego pago não quer indexação: o que traz visita é o
    // anúncio, e página indexada só rende comparação de preço e cópia.
    robots: { index: false, follow: false },
  };
}

export default async function FiguraPage(props: PageProps<'/[figura]'>) {
  const { figura } = await props.params;

  const figure = await getFigure(figura);
  // Uma figura que só existe como adicional (Trump, Flávio) não tem landing:
  // ela é vendida dentro do checkout da principal, nunca sozinha.
  if (!figure || !figure.isPrimary) notFound();

  // Kill switch: precisa valer também para quem já está com a página aberta,
  // por isso é consultado a cada request e não no build.
  if (!figure.enabled) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-6 text-center">
        <h1 className="text-2xl font-bold">Temporariamente indisponível</h1>
        <p className="mt-3 text-muted">
          {figure.notice ?? 'Este produto está fora do ar no momento. Volte mais tarde.'}
        </p>
        <LegalFooter />
      </main>
    );
  }

  // Depois do kill switch, e não antes: figura desligada não desenha landing
  // nenhuma, e o COUNT seria uma ida ao banco para jogar fora.
  const fotosEntregues = await contaFotosEntregues(figure.slug);

  return <Funnel figure={toPublicFigure(figure)} fotosEntregues={fotosEntregues} />;
}
