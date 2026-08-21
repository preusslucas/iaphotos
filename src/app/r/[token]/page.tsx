import Link from 'next/link';
import { getFigure } from '@/content';
import { AiBadge, Card, LegalFooter } from '@/components/ui';
import { prisma } from '@/lib/prisma';
import { presignedDownload } from '@/lib/storage';
import { verifyDeliveryToken } from '@/lib/tokens';

/**
 * Destino do link enviado por e-mail. O token carrega o próprio prazo de
 * validade e é assinado, então não guardamos nada por link — e um link vazado
 * expira sozinho em 30 dias.
 */
export const dynamic = 'force-dynamic';

export default async function DeliveryPage(props: PageProps<'/r/[token]'>) {
  const { token } = await props.params;

  const payload = verifyDeliveryToken(token);
  if (!payload) return <Message title="Link inválido ou expirado" body="Peça um novo pelo suporte." />;

  const order = await prisma.order.findUnique({
    where: { id: payload.orderId },
    include: { assets: true },
  });

  if (!order || order.status !== 'READY') {
    return <Message title="Ainda não está pronto" body="Tente de novo em alguns minutos." />;
  }

  const result = order.assets.find((a) => a.kind === 'RESULT');
  const preview = order.assets.find((a) => a.kind === 'PREVIEW');
  if (!result) {
    return <Message title="Arquivo indisponível" body="A imagem já passou do prazo de retenção." />;
  }

  const figure = await getFigure(order.figureSlug);
  const [resultUrl, previewUrl, bonuses] = await Promise.all([
    presignedDownload(result.objectKey, 3600),
    preview ? presignedDownload(preview.objectKey, 3600) : Promise.resolve(null),
    Promise.all(
      (figure?.bonuses ?? []).map(async (b) => ({
        label: b.label,
        description: b.description,
        url: await presignedDownload(b.objectKey, 3600),
      })),
    ),
  ]);

  return (
    <main className="mx-auto min-h-dvh w-full max-w-2xl px-5 py-10">
      <h1 className="text-center text-2xl font-bold">Sua foto</h1>

      <figure className="relative mt-6 overflow-hidden rounded-2xl border border-border">
        {/* eslint-disable-next-line @next/next/no-img-element -- URL assinada com expiração */}
        <img src={previewUrl ?? resultUrl} alt="Sua foto gerada por IA" className="w-full" />
        <figcaption className="absolute inset-x-2 bottom-2">
          <AiBadge />
        </figcaption>
      </figure>

      <a
        href={resultUrl}
        download
        className="mt-6 block w-full rounded-xl bg-accent px-6 py-4 text-center font-bold text-white hover:bg-accent-hover"
      >
        Baixar em alta resolução
      </a>

      {/* {bonuses.length > 0 && (
        <section className="mt-8 space-y-3">
          <h2 className="text-lg font-bold">Seus bônus</h2>
          {bonuses.map((b) => (
            <Card key={b.label} className="flex items-center justify-between gap-4">
              <span>
                <span className="block font-semibold">{b.label}</span>
                <span className="block text-sm text-muted">{b.description}</span>
              </span>
              <a
                href={b.url}
                download
                className="shrink-0 rounded-lg bg-surface-2 px-4 py-2 text-sm font-semibold hover:bg-border"
              >
                Baixar
              </a>
            </Card>
          ))}
        </section>
      )} */}

      <LegalFooter />
    </main>
  );
}

function Message({ title, body }: { title: string; body: string }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-6 text-center">
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="mt-3 text-muted">{body}</p>
      <Link href="/" className="mt-6 text-sm text-accent underline">
        Voltar ao início
      </Link>
      <LegalFooter />
    </main>
  );
}
