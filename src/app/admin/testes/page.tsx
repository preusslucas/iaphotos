import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isAuthenticated } from '@/lib/admin-auth';
import { prisma } from '@/lib/prisma';
import { presignedDownload } from '@/lib/storage';
import { apagarLote, rodarTeste } from './actions';
import { Contador } from './Contador';

export const dynamic = 'force-dynamic';

/**
 * Bancada de teste: uma foto de base, todas as combinacoes de uma vez.
 *
 * O pedido criado aqui e um pedido de VERDADE, marcado com `isTest`. Passa pela
 * mesma fila, pelo mesmo worker e pelo mesmo prompt — um atalho que gerasse por
 * fora mediria um caminho que nenhum cliente percorre, e e justamente a
 * diferenca entre os dois que produziria o bug que o teste deveria pegar.
 *
 * O que a marca muda e o depois: esses pedidos ficam fora das metricas e da
 * lista do painel.
 */

const ENQUADRAMENTOS = [
  { id: 'CHEST_UP', label: 'Peito para cima' },
  { id: 'HALF_BODY', label: 'Meio corpo' },
  { id: 'CLOSE_SELFIE', label: 'Selfie próxima' },
];

const CLIMAS = [
  { id: 'NONE', label: 'Como no cenário' },
  { id: 'DISCREET', label: 'Discreto' },
  { id: 'FLAGS', label: 'Com bandeiras' },
  { id: 'CROWD', label: 'Encontro popular' },
];

export default async function Bancada(props: PageProps<'/admin/testes'>) {
  if (!(await isAuthenticated())) notFound();

  const { erro, figura } = await props.searchParams;

  const figuras = await prisma.figure.findMany({
    include: {
      scenes: { where: { enabled: true }, orderBy: { sortOrder: 'asc' } },
      _count: { select: { references: true } },
    },
    orderBy: [{ isPrimary: 'desc' }, { slug: 'asc' }],
  });

  const slugEscolhido = typeof figura === 'string' ? figura : figuras[0]?.slug;
  const atual = figuras.find((f) => f.slug === slugEscolhido) ?? figuras[0];

  // Os testes, agrupados por bateria. `mpStatus` guarda `teste_<lote>` — é o que
  // permite apagar uma rodada inteira sem caçar pedido por pedido.
  const testes = await prisma.order.findMany({
    where: { isTest: true },
    orderBy: { createdAt: 'desc' },
    take: 120,
    include: {
      items: { include: { assets: { where: { kind: 'PREVIEW' } } } },
    },
  });

  const previews = new Map<string, string>();
  await Promise.all(
    testes.flatMap((o) =>
      o.items.flatMap((i) =>
        i.assets.map(async (a) => {
          try {
            previews.set(a.objectKey, await presignedDownload(a.objectKey, 600));
          } catch {
            // Linha sem objeto no bucket. O card mostra o status em texto.
          }
        }),
      ),
    ),
  );

  const lotes = new Map<string, typeof testes>();
  for (const t of testes) {
    const lote = t.mpStatus?.replace('teste_', '') ?? 'sem-lote';
    lotes.set(lote, [...(lotes.get(lote) ?? []), t]);
  }

  return (
    <main className="mx-auto max-w-4xl space-y-8 px-5 py-8">
      <header>
        <Link href="/admin" className="text-sm text-muted hover:underline">
          ← Painel
        </Link>
        <h1 className="mt-2 text-xl font-bold">Bancada de teste</h1>
        <p className="text-sm text-muted">
          Uma foto de base, todas as combinações de uma vez. Cada combinação é uma imagem paga ao
          provedor (US$0,005) e passa exatamente pelo mesmo caminho de um pedido de cliente.
        </p>
      </header>

      {erro && (
        <p className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          {erro}
        </p>
      )}

      {/* ------------------------------------------------------- formulário */}
      <section className="rounded-xl border border-border bg-surface p-4">
        {/* Trocar de figura é um GET, não parte do formulário de gerar: um
            <select> que reenviasse o formulário perderia o arquivo já escolhido
            e as marcações, e a pessoa refaria tudo só para ver outra figura. */}
        <form method="get" className="mb-5 flex flex-wrap items-end gap-2">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Figura</span>
            <select
              name="figura"
              defaultValue={atual?.slug}
              className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm"
            >
              {figuras.map((f) => (
                <option key={f.slug} value={f.slug}>
                  {f.productName} ({f._count.references} referência(s), {f.scenes.length} cena(s))
                </option>
              ))}
            </select>
          </label>
          <button className="rounded-lg bg-surface-2 px-4 py-2 text-sm font-semibold hover:bg-border">
            Trocar
          </button>
        </form>

        {!atual && <p className="text-sm text-muted">Nenhuma figura cadastrada.</p>}

        {atual && atual._count.references === 0 && (
          <p className="rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-warn">
            <strong>{atual.productName}</strong> não tem foto de referência. Toda geração aqui
            falharia do mesmo jeito — cadastre uma referência antes.
          </p>
        )}

        {atual && atual.scenes.length === 0 && (
          <p className="rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-warn">
            <strong>{atual.productName}</strong> não tem cena ativa. Não há o que combinar.
          </p>
        )}

        {atual && atual._count.references > 0 && atual.scenes.length > 0 && (
          <form id="form-bancada" action={rodarTeste} className="space-y-5">
            <input type="hidden" name="figureSlug" value={atual.slug} />

            <label className="block">
              <span className="mb-1 block text-sm font-medium">Foto de base</span>
              <input
                type="file"
                name="selfie"
                accept="image/jpeg,image/png,image/webp"
                required
                className="text-sm"
              />
              <span className="mt-1 block text-xs text-muted">
                A mesma em todas as combinações. Mínimo de 512px, igual ao que o funil exige de um
                cliente.
              </span>
            </label>

            <Grupo titulo="Cenas" nome="cena" itens={atual.scenes.map((s) => ({ id: s.sceneId, label: `${s.icon ?? '📷'} ${s.label}` }))} />
            <Grupo titulo="Enquadramentos" nome="enquadramento" itens={ENQUADRAMENTOS} primeiro />
            <Grupo titulo="Climas" nome="clima" itens={CLIMAS} primeiro />

            <Contador />

            <button className="rounded-xl bg-accent px-5 py-2.5 text-sm font-bold text-white hover:bg-accent-hover">
              Gerar combinações
            </button>
          </form>
        )}
      </section>

      {/* ---------------------------------------------------------- rodadas */}
      {[...lotes.entries()].map(([lote, pedidos]) => (
        <section key={lote} className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-bold">
              Rodada {lote}
              <span className="ml-2 text-sm font-normal text-muted">
                {pedidos.length} imagem(ns) · {pedidos[0]?.createdAt.toLocaleString('pt-BR')}
              </span>
            </h2>
            <form action={apagarLote.bind(null, lote)}>
              <button className="rounded bg-surface-2 px-3 py-1.5 text-xs font-semibold text-danger hover:bg-border">
                Apagar rodada
              </button>
            </form>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {pedidos.map((p) => {
              const asset = p.items[0]?.assets[0];
              const url = asset ? previews.get(asset.objectKey) : undefined;
              return (
                <figure key={p.id} className="overflow-hidden rounded-xl border border-border bg-surface">
                  {url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- URL assinada com expiração
                    <img src={url} alt={`${p.sceneId} · ${p.framing} · ${p.mood}`} className="aspect-3/4 w-full object-cover" />
                  ) : (
                    <div className="flex aspect-3/4 w-full items-center justify-center bg-surface-2 px-2 text-center text-xs text-muted">
                      {p.status === 'READY' ? 'sem prévia' : p.status}
                    </div>
                  )}
                  <figcaption className="p-2 text-[11px] leading-tight">
                    <span className="block font-semibold">{p.sceneId}</span>
                    <span className="block text-muted">
                      {ENQUADRAMENTOS.find((e) => e.id === p.framing)?.label ?? p.framing}
                    </span>
                    <span className="block text-muted">
                      {CLIMAS.find((c) => c.id === p.mood)?.label ?? p.mood}
                    </span>
                    {p.failureReason && (
                      <span className="mt-1 block text-danger">{p.failureReason}</span>
                    )}
                  </figcaption>
                </figure>
              );
            })}
          </div>
        </section>
      ))}

      {lotes.size === 0 && (
        <p className="text-center text-sm text-muted">Nenhuma rodada ainda.</p>
      )}
    </main>
  );
}

/**
 * Grupo de caixas de seleção.
 *
 * `primeiro` marca a primeira opção por padrão: enquadramento e clima têm um
 * valor que é o da produção (peito para cima, clima da cena), e abrir a tela com
 * nada marcado faria a rodada mais óbvia — variar só a cena — exigir seis
 * cliques antes do primeiro teste.
 */
function Grupo({
  titulo,
  nome,
  itens,
  primeiro,
}: {
  titulo: string;
  nome: string;
  itens: { id: string; label: string }[];
  primeiro?: boolean;
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium">{titulo}</legend>
      <div className="flex flex-wrap gap-2">
        {itens.map((i, idx) => (
          <label
            key={i.id}
            className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm hover:border-muted"
          >
            <input type="checkbox" name={nome} value={i.id} defaultChecked={primeiro && idx === 0} />
            {i.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
