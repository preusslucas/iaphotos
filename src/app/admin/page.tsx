import Link from 'next/link';
import { listFigures } from '@/content';
import { isAuthenticated } from '@/lib/admin-auth';
import { prisma } from '@/lib/prisma';
import { liberarSemCobrar, login, logout, refund, reprocess, toggleFigure } from './actions';

export const dynamic = 'force-dynamic';

/**
 * As consultas ficam fora do corpo do componente porque `Date.now()` é impuro:
 * chamá-lo durante o render quebra a garantia de que renderizar duas vezes dá o
 * mesmo resultado — e o React 19 avisa sobre isso.
 */
const POR_PAGINA = 10;

/**
 * O painel não mostra mais métrica agregada — nem volume, nem taxa de sucesso,
 * nem custo de API.
 *
 * Todas elas descreviam a operação de longe e nenhuma levava a uma ação: saber
 * que a taxa está em 92% não diz qual pedido consertar. O que resolve problema
 * são as duas listas que sobraram — os RETIDOS, que é gente que pagou e está
 * esperando, e os últimos pedidos, onde se abre um caso concreto. Custo e
 * receita vivem melhor no fal.ai e no Mercado Pago, que são a fonte de verdade
 * de cada um.
 */
async function loadDashboard(pagina: number) {
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);

  // `isTest: false` em TODAS as consultas daqui.
  //
  // A bancada cria pedidos de verdade, que passam pela mesma fila e pelo mesmo
  // worker — é o que faz o teste medir a produção. O preço disso é que, sem este
  // filtro, uma rodada de teste apareceria no meio dos pedidos de cliente.
  const naoTeste = { isTest: false };

  const [orders, totalPedidos, states, retidos] = await Promise.all([
    prisma.order.findMany({
      where: { ...naoTeste, createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      skip: (pagina - 1) * POR_PAGINA,
      take: POR_PAGINA,
      include: { jobs: { orderBy: { createdAt: 'desc' }, take: 1 } },
    }),
    prisma.order.count({ where: { ...naoTeste, createdAt: { gte: since } } }),
    listFigures(),

    // Sem recorte de data, ao contrário do resto do painel: um pedido retido é
    // dinheiro de cliente parado esperando você. Se ficar velho o bastante para
    // sair da janela de 30 dias, é justamente quando você MAIS precisa ver.
    prisma.order.findMany({
      where: { ...naoTeste, status: 'NEEDS_REVIEW' },
      orderBy: { paidAt: 'asc' },
    }),
  ]);

  return { orders, totalPedidos, states, retidos };
}

export default async function AdminPage(props: PageProps<'/admin'>) {
  const { erro, p } = await props.searchParams;

  if (!(await isAuthenticated())) {
    return <LoginForm failed={erro === '1'} />;
  }

  // `Math.max(1, ...)` porque `?p=0` e `?p=-3` chegam de qualquer um que edite a
  // URL, e `skip` negativo é erro do Prisma, não página vazia.
  const pagina = Math.max(1, Number(p) || 1);
  const { orders, totalPedidos, states, retidos } = await loadDashboard(pagina);
  const totalPaginas = Math.max(1, Math.ceil(totalPedidos / POR_PAGINA));

  return (
    <main className="mx-auto max-w-5xl px-5 py-8">
      <header className="mb-8 flex items-center justify-between">
        <h1 className="text-xl font-bold">Painel · últimos 30 dias</h1>
        <div className="flex gap-2">
          {/* Inclui quem não pagou: o desistente no checkout é o lead que mais
              vale recuperar. São dados pessoais — veja a nota na rota.

              `<a>` e não `<Link>`: o destino é um arquivo, não uma página. O
              Link faria navegação client-side, o React tentaria renderizar um
              CSV como rota e o download nunca aconteceria. */}
          <Link
            href="/admin/testes"
            className="rounded-lg bg-surface-2 px-3 py-1.5 text-sm font-semibold hover:bg-border"
          >
            Bancada de teste
          </Link>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/admin/leads"
            className="rounded-lg bg-surface-2 px-3 py-1.5 text-sm hover:bg-border"
          >
            Baixar leads
          </a>
          <form action={logout}>
            <button className="rounded-lg bg-surface-2 px-3 py-1.5 text-sm hover:bg-border">
              Sair
            </button>
          </form>
        </div>
      </header>

      {retidos.length > 0 && (
        <section className="mb-8 rounded-xl border border-warn/40 bg-warn/10 p-4">
          <h2 className="font-bold text-warn">
            {retidos.length === 1
              ? '1 pedido pago aguardando você'
              : `${retidos.length} pedidos pagos aguardando você`}
          </h2>
          <p className="mt-1 text-sm text-muted">
            O cliente pagou e a geração falhou por um problema que tem conserto — nada foi
            estornado. Corrija a causa e reprocesse; se não der, estorne à mão.
          </p>
          <ul className="mt-3 space-y-2">
            {retidos.map((order) => (
              <li
                key={order.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="font-mono text-xs">{order.id.slice(-8)}</p>
                  <p className="text-xs text-muted">
                    {order.failureReason ?? 'sem motivo registrado'}
                  </p>
                  <p className="text-xs text-muted">
                    pago {order.paidAt?.toLocaleString('pt-BR') ?? '—'} · {order.email ?? 'sem e-mail'}
                  </p>
                </div>
                <div className="flex gap-2">
                  <form action={reprocess.bind(null, order.id)}>
                    <button className="rounded bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-hover">
                      Reprocessar
                    </button>
                  </form>
                  <form action={refund.bind(null, order.id)}>
                    <button className="rounded bg-surface-2 px-3 py-1.5 text-xs font-semibold text-danger hover:bg-border">
                      Estornar
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-bold">Figuras</h2>
          <Link
            href="/admin/figuras/nova"
            className="rounded-lg bg-surface-2 px-3 py-1.5 text-sm font-semibold hover:bg-border"
          >
            + Nova figura
          </Link>
        </div>
        <div className="space-y-2">
          {states.map((figure) => {
            // Uma figura só pode vender com cena E referência. Dizer isso aqui
            // evita o caso de ligar o Trump, anunciar, e todo pedido cair em
            // NEEDS_REVIEW porque faltava cadastro.
            // "falta cadastrar X e Y" — a frase precisa fazer sentido lida
            // inteira. A versão anterior montava "falta nenhuma cena e nenhuma
            // referência", que é o contrário do que quer dizer.
            const faltando = [
              figure.scenes.length === 0 && 'uma cena',
              figure.referenceKeys.length === 0 && 'uma foto de referência',
            ].filter((x): x is string => typeof x === 'string');

            return (
              <div
                key={figure.slug}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface px-4 py-3"
              >
                <span className="min-w-0">
                  <span className="font-semibold">{figure.productName}</span>
                  <span className="ml-2 text-sm text-muted">/{figure.slug}</span>
                  {!figure.isPrimary && (
                    <span className="ml-2 rounded bg-surface-2 px-1.5 py-0.5 text-xs text-muted">
                      só adicional
                    </span>
                  )}
                  <span className="mt-0.5 block text-xs text-muted">
                    {figure.scenes.length} cena(s) · {figure.referenceKeys.length} referência(s)
                    {figure.addons.length > 0 && ` · oferece ${figure.addons.length} adicional(is)`}
                  </span>
                  {faltando.length > 0 && (
                    <span className="mt-0.5 block text-xs text-warn">
                      falta cadastrar {faltando.join(' e ')} — não pode vender ainda
                    </span>
                  )}
                </span>
                <div className="flex shrink-0 gap-2">
                  <Link
                    href={`/admin/figuras/${figure.slug}`}
                    className="rounded-lg bg-surface-2 px-3 py-1.5 text-sm font-semibold hover:bg-border"
                  >
                    Editar
                  </Link>
                  <form action={toggleFigure.bind(null, figure.slug, !figure.enabled)}>
                    <button
                      className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
                        figure.enabled ? 'bg-danger/15 text-danger' : 'bg-accent/15 text-accent'
                      }`}
                    >
                      {figure.enabled ? 'Desligar agora' : 'Ligar'}
                    </button>
                  </form>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-bold">Últimos pedidos</h2>
          {totalPedidos > 0 && (
            <span className="text-xs text-muted">
              {totalPedidos} nos últimos 30 dias
            </span>
          )}
        </div>
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-2 text-muted">
              <tr>
                <th className="px-3 py-2">Pedido</th>
                <th className="px-3 py-2">Cena</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Erro</th>
                <th className="px-3 py-2">Criado</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id} className="border-t border-border">
                  <td className="px-3 py-2 font-mono text-xs">{order.id.slice(-8)}</td>
                  <td className="px-3 py-2">{order.sceneId}</td>
                  <td className="px-3 py-2">
                    <StatusPill status={order.status} />
                    {/* Um READY liberado pelo painel é visualmente idêntico a um
                        READY vendido. Sem esta marca, a única forma de saber
                        quais entraram dinheiro é conferir pedido a pedido. */}
                    {order.paidAt && !order.mpPaymentId && (
                      <span className="ml-1.5 rounded bg-warn/15 px-1.5 py-0.5 text-[10px] font-semibold text-warn">
                        sem cobrança
                      </span>
                    )}
                  </td>
                  <td className="max-w-56 truncate px-3 py-2 text-xs text-muted">
                    {order.jobs[0]?.errorCode ?? order.failureReason ?? '—'}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted">
                    {order.createdAt.toLocaleString('pt-BR')}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      {(order.status === 'FAILED' ||
                        order.status === 'PROCESSING' ||
                        order.status === 'NEEDS_REVIEW') && (
                        <form action={reprocess.bind(null, order.id)}>
                          <button className="rounded bg-surface-2 px-2 py-1 text-xs hover:bg-border">
                            Reprocessar
                          </button>
                        </form>
                      )}
                      {order.status === 'NEEDS_REVIEW' && (
                        <form action={refund.bind(null, order.id)}>
                          <button className="rounded bg-surface-2 px-2 py-1 text-xs text-danger hover:bg-border">
                            Estornar
                          </button>
                        </form>
                      )}
                      {/* Só em PENDING. O texto diz "sem cobrar" de propósito:
                          é o botão que gera imagem de graça, e quem clica tem
                          de saber disso antes, não depois. */}
                      {order.status === 'PENDING' && (
                        <form action={liberarSemCobrar.bind(null, order.id)}>
                          <button
                            title="Gera a imagem sem cobrar. Use quando o pagamento entrou mas o webhook não chegou — ou para testar."
                            className="rounded bg-surface-2 px-2 py-1 text-xs text-warn hover:bg-border"
                          >
                            Liberar sem cobrar
                          </button>
                        </form>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {orders.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-muted">
                    {pagina > 1 ? 'Nada nesta página.' : 'Nenhum pedido ainda.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {totalPaginas > 1 && <Paginacao atual={pagina} total={totalPaginas} />}
      </section>
    </main>
  );
}

/**
 * Paginação em links, e não em botões com estado.
 *
 * A página é um Server Component: navegar por `?p=` faz o servidor buscar só as
 * 10 linhas daquela página. Guardar tudo no cliente e paginar no navegador
 * significaria trazer todos os pedidos do mês para depois esconder 90% deles.
 *
 * Também torna cada página um endereço de verdade: dá para abrir a 3 numa aba
 * nova, mandar o link para alguém, e o voltar do navegador funciona.
 */
function Paginacao({ atual, total }: { atual: number; total: number }) {
  // Janela deslizante de 5: com 40 páginas, listar todas empurraria a tabela
  // para fora da tela e nenhuma delas é útil de longe.
  const inicio = Math.max(1, Math.min(atual - 2, total - 4));
  const fim = Math.min(total, inicio + 4);
  const paginas = Array.from({ length: fim - inicio + 1 }, (_, i) => inicio + i);

  const estilo = (ativa: boolean) =>
    `rounded-lg px-3 py-1.5 text-sm font-semibold ${
      ativa ? 'bg-accent text-white' : 'bg-surface-2 hover:bg-border'
    }`;

  return (
    <nav className="mt-3 flex flex-wrap items-center justify-center gap-1.5" aria-label="Páginas">
      {atual > 1 && (
        <Link href={`/admin?p=${atual - 1}`} className={estilo(false)} rel="prev">
          ← Anterior
        </Link>
      )}

      {inicio > 1 && <span className="px-1 text-sm text-muted">…</span>}

      {paginas.map((p) => (
        <Link
          key={p}
          href={`/admin?p=${p}`}
          className={estilo(p === atual)}
          aria-current={p === atual ? 'page' : undefined}
        >
          {p}
        </Link>
      ))}

      {fim < total && <span className="px-1 text-sm text-muted">…</span>}

      {atual < total && (
        <Link href={`/admin?p=${atual + 1}`} className={estilo(false)} rel="next">
          Próxima →
        </Link>
      )}
    </nav>
  );
}

function StatusPill({ status }: { status: string }) {
  const tones: Record<string, string> = {
    READY: 'bg-accent/15 text-accent',
    FAILED: 'bg-danger/15 text-danger',
    NEEDS_REVIEW: 'bg-warn/15 text-warn font-bold',
    REFUNDED: 'bg-warn/15 text-warn',
  };
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-semibold ${tones[status] ?? 'bg-surface-2 text-muted'}`}>
      {status}
    </span>
  );
}

function LoginForm({ failed }: { failed: boolean }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6">
      <h1 className="mb-6 text-center text-xl font-bold">Painel</h1>
      <form action={login} className="space-y-4">
        <input
          type="password"
          name="password"
          required
          autoFocus
          placeholder="Senha"
          className="w-full rounded-xl border border-border bg-surface-2 px-4 py-3 outline-none focus:border-accent"
        />
        {failed && <p className="text-sm text-danger">Senha incorreta.</p>}
        <button className="w-full rounded-xl bg-accent px-6 py-3 font-bold text-white hover:bg-accent-hover">
          Entrar
        </button>
      </form>
    </main>
  );
}
