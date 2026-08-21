import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isAuthenticated } from '@/lib/admin-auth';
import { prisma } from '@/lib/prisma';
import { presignedDownload } from '@/lib/storage';
import {
  apagarCena,
  apagarFigura,
  apagarReferencia,
  salvarAdicionais,
  salvarCena,
  salvarFigura,
  subirHero,
  subirReferencia,
} from '../actions';

export const dynamic = 'force-dynamic';

const ASPECTOS = ['1:1', '3:4', '4:3', '9:16', '16:9'];
const reais = (c: number | null) => (c === null ? '' : (c / 100).toFixed(2));

export default async function EditarFigura(props: PageProps<'/admin/figuras/[slug]'>) {
  if (!(await isAuthenticated())) notFound();

  const { slug } = await props.params;
  const { erro } = await props.searchParams;

  const [figure, outras] = await Promise.all([
    prisma.figure.findUnique({
      where: { slug },
      include: {
        scenes: { orderBy: { sortOrder: 'asc' } },
        references: { orderBy: { sortOrder: 'asc' } },
        addonsOffered: true,
      },
    }),
    prisma.figure.findMany({ where: { slug: { not: slug } }, orderBy: { slug: 'asc' } }),
  ]);
  if (!figure) notFound();

  const jaAdicional = new Set(figure.addonsOffered.map((a) => a.adicionalSlug));
  const vendida = await prisma.orderItem.count({ where: { figureSlug: slug } });

  /**
   * URLs assinadas para PREVISUALIZAR o que está no bucket.
   *
   * Sem isto o painel mostra só `figures/patriota/ref-37770a5d.jpg` e você
   * trabalha às cegas: não dá para saber qual foto é qual, nem conferir se subiu
   * a certa, nem perceber que apagou a errada. Assinar aqui e não numa rota
   * própria porque esta página já é servidor e já exige sessão de admin.
   */
  const previews = new Map<string, string>();
  await Promise.all(
    figure.references.map(async (r) => {
      try {
        previews.set(r.objectKey, await presignedDownload(r.objectKey, 600));
      } catch {
        // Linha no banco sem objeto no bucket. A tela mostra isso em vermelho.
      }
    }),
  );

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-5 py-8">
      <header>
        <Link href="/admin" className="text-sm text-muted hover:underline">
          ← Painel
        </Link>
        <h1 className="mt-2 text-xl font-bold">{figure.productName}</h1>
        <p className="text-sm text-muted">
          /{figure.slug} · {figure.enabled ? 'ligada' : 'desligada'} · vendida em {vendida}{' '}
          pedido(s)
        </p>
      </header>

      {/* Sem isto, toda validação vira 500 opaco: o Next troca a mensagem por um
          `digest` em produção, e o motivo só aparece no log do servidor. */}
      {erro && (
        <p className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          {erro}
        </p>
      )}

      {/* ---------------------------------------------------------- dados */}
      <Bloco titulo="Produto e preço">
        <form action={salvarFigura.bind(null, slug)} className="space-y-4">
          <Campo nome="productName" rotulo="Nome do produto" valor={figure.productName} />
          <Campo
            nome="figureLabel"
            rotulo="Como a figura é chamada na copy"
            valor={figure.figureLabel}
            ajuda="Nunca use o nome civil de uma pessoa real sem checar o risco jurídico."
          />
          <Campo nome="headline" rotulo="Headline" valor={figure.headline} />
          <Campo nome="subheadline" rotulo="Subheadline" valor={figure.subheadline} multilinha />
          <Campo nome="ctaLabel" rotulo="Texto do botão" valor={figure.ctaLabel} />

          <div className="grid gap-4 sm:grid-cols-3">
            <Campo nome="priceCents" rotulo="Preço (R$)" valor={reais(figure.priceCents)} />
            <Campo
              nome="compareAtCents"
              rotulo='Preço "de" (R$)'
              valor={reais(figure.compareAtCents)}
              ajuda="Só ancoragem. Deve ter existido de verdade algum dia."
            />
            <Campo
              nome="bundlePriceCents"
              rotulo="Preço do combo (R$)"
              valor={reais(figure.bundlePriceCents)}
              ajuda="Levando esta figura mais todos os adicionais."
            />
          </div>

          <Campo
            nome="notice"
            rotulo="Aviso quando desligada"
            valor={figure.notice ?? ''}
            obrigatorio={false}
          />

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="isPrimary" defaultChecked={figure.isPrimary} />
            Tem landing própria em /{figure.slug}
            <span className="text-muted">(desmarque para ela existir só como adicional)</span>
          </label>

          <button className="rounded-xl bg-accent px-5 py-2.5 text-sm font-bold text-white hover:bg-accent-hover">
            Salvar
          </button>
        </form>
      </Bloco>

      {/* ------------------------------------------------------------ hero */}
      <Bloco
        titulo="Foto de exemplo da landing"
        ajuda="A única imagem que o visitante vê antes de comprar. Precisa ser uma geração real deste produto."
      >
        <FormHero figureSlug={slug} atual={figure.heroImage} />
      </Bloco>

      {/* ----------------------------------------------------- referências */}
      <Bloco
        titulo={`Fotos de referência (${figure.references.length}/3)`}
        ajuda="São elas que ensinam o gerador quem é a figura. Sem nenhuma, todo pedido fica retido. O máximo é 3: o gerador recebe 4 imagens, e uma é a selfie do cliente."
      >
        {figure.references.length === 0 && (
          <p className="text-sm text-warn">Nenhuma referência — esta figura não pode gerar.</p>
        )}

        <ul className="space-y-2">
          {figure.references.map((r) => (
            <li
              key={r.id}
              className="flex items-center justify-between gap-3 rounded-lg bg-surface-2 px-3 py-2"
            >
              <span className="flex min-w-0 items-center gap-3">
                {previews.has(r.objectKey) ? (
                  // eslint-disable-next-line @next/next/no-img-element -- URL assinada com expiração
                  <img
                    src={previews.get(r.objectKey)}
                    alt="Referência"
                    className="h-14 w-14 shrink-0 rounded object-cover"
                  />
                ) : (
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded bg-danger/15 text-[10px] leading-tight text-danger">
                    sem<br />arquivo
                  </span>
                )}
                <span className="min-w-0">
                  <span className="block truncate font-mono text-xs">{r.objectKey}</span>
                  <span className="text-xs text-muted">
                    {(r.bytes / 1024).toFixed(0)} KB · {r.mimeType}
                  </span>
                </span>
              </span>
              <form action={apagarReferencia.bind(null, slug, r.id)}>
                <button className="shrink-0 rounded bg-surface px-3 py-1 text-xs text-danger hover:bg-border">
                  Apagar
                </button>
              </form>
            </li>
          ))}
        </ul>

        {figure.references.length < 3 && (
          <form action={subirReferencia.bind(null, slug)} className="flex flex-wrap gap-2">
            <input
              type="file"
              name="arquivo"
              accept="image/jpeg,image/png,image/webp"
              required
              className="text-sm"
            />
            <button className="rounded-lg bg-surface-2 px-4 py-2 text-sm font-semibold hover:bg-border">
              Enviar
            </button>
          </form>
        )}
      </Bloco>

      {/* ------------------------------------------------------------ cenas */}
      <Bloco
        titulo={`Cenas (${figure.scenes.length})`}
        ajuda="A descrição do cenário vai direto ao gerador. Não há revisão de código no caminho: um erro aqui quebra a geração em produção. Cena nova nasce desativada — confira e só então ative."
      >
        {figure.scenes.map((s) => (
          <details key={s.id} className="rounded-lg border border-border">
            <summary className="cursor-pointer px-3 py-2 text-sm">
              <span className="font-semibold">{s.label}</span>
              <span className="ml-2 font-mono text-xs text-muted">{s.sceneId}</span>
              {!s.enabled && <span className="ml-2 text-xs text-warn">desativada</span>}
            </summary>
            <div className="border-t border-border p-3">
              <FormCena figureSlug={slug} cena={s} />
            </div>
          </details>
        ))}

        <details className="rounded-lg border border-dashed border-border">
          <summary className="cursor-pointer px-3 py-2 text-sm font-semibold">
            + Adicionar cena
          </summary>
          <div className="border-t border-border p-3">
            <FormCena figureSlug={slug} cena={null} />
          </div>
        </details>
      </Bloco>

      {/* ------------------------------------------------------- adicionais */}
      <Bloco
        titulo="Adicionais no checkout"
        ajuda="Quais figuras são oferecidas como order bump desta. Só aparecem na tela se tiverem cena e referência cadastradas."
      >
        <form action={salvarAdicionais.bind(null, slug)} className="space-y-3">
          {outras.length === 0 && <p className="text-sm text-muted">Não há outras figuras.</p>}
          {outras.map((o) => (
            <label key={o.slug} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="adicional"
                value={o.slug}
                defaultChecked={jaAdicional.has(o.slug)}
              />
              {o.productName}
              <span className="text-muted">/{o.slug}</span>
              {!o.enabled && <span className="text-xs text-warn">desligada</span>}
            </label>
          ))}
          <button className="rounded-xl bg-accent px-5 py-2.5 text-sm font-bold text-white hover:bg-accent-hover">
            Salvar adicionais
          </button>
        </form>
      </Bloco>

      {/* ---------------------------------------------------------- apagar */}
      <Bloco titulo="Zona de perigo">
        <p className="mb-3 text-sm text-muted">
          {vendida > 0
            ? `Esta figura já foi vendida em ${vendida} pedido(s) e não pode ser apagada — o histórico precisa continuar legível. Para tirá-la do ar, desligue no painel.`
            : 'Apagar remove figura, cenas e referências. Não dá para desfazer.'}
        </p>
        {vendida === 0 && (
          <form action={apagarFigura.bind(null, slug)}>
            <button className="rounded-lg bg-danger/15 px-4 py-2 text-sm font-semibold text-danger hover:bg-danger/25">
              Apagar figura
            </button>
          </form>
        )}
      </Bloco>
    </main>
  );
}

function FormCena({
  figureSlug,
  cena,
}: {
  figureSlug: string;
  cena: {
    sceneId: string;
    label: string;
    hint: string;
    aspectRatio: string;
    setting: string;
    icon: string | null;
    enabled: boolean;
    sortOrder: number;
  } | null;
}) {
  return (
    <form action={salvarCena.bind(null, figureSlug)} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo
          nome="sceneId"
          rotulo="Id da cena"
          valor={cena?.sceneId ?? ''}
          somenteLeitura={cena !== null}
          ajuda={cena ? 'Não muda: pedidos antigos apontam para ele.' : 'ex.: comicio'}
        />
        <Campo nome="label" rotulo="Nome exibido" valor={cena?.label ?? ''} />
      </div>

      <Campo nome="hint" rotulo="Frase curta do card" valor={cena?.hint ?? ''} />

      <label className="block">
        <span className="mb-1 block text-sm font-medium">Descrição do cenário (prompt)</span>
        <textarea
          name="setting"
          required
          rows={4}
          defaultValue={cena?.setting ?? ''}
          className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <span className="mt-1 block text-xs text-muted">
          Em inglês, descrevendo só o cenário — nunca a identidade das pessoas. Vai direto ao
          gerador.
        </span>
      </label>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Proporção</span>
          <select
            name="aspectRatio"
            defaultValue={cena?.aspectRatio ?? '16:9'}
            className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm"
          >
            {ASPECTOS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        <Campo
          nome="icon"
          rotulo="Ícone"
          valor={cena?.icon ?? ''}
          obrigatorio={false}
          ajuda="Um emoji, exibido no card. Vazio vira 📷."
        />
        <Campo nome="sortOrder" rotulo="Ordem" valor={String(cena?.sortOrder ?? 0)} />
      </div>

      {cena && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="enabled" defaultChecked={cena.enabled} />
          Ativa (aparece para o cliente escolher)
        </label>
      )}

      <div className="flex gap-2">
        <button className="rounded-lg bg-accent px-4 py-2 text-sm font-bold text-white hover:bg-accent-hover">
          {cena ? 'Salvar cena' : 'Criar cena'}
        </button>
        {cena && (
          <button
            formAction={apagarCena.bind(null, figureSlug, cena.sceneId)}
            className="rounded-lg bg-surface-2 px-4 py-2 text-sm text-danger hover:bg-border"
          >
            Apagar
          </button>
        )}
      </div>
    </form>
  );
}

/**
 * Formulário PRÓPRIO, separado do de "Produto e preço".
 *
 * Formulário com `enctype=multipart` só envia arquivo no submit dele. Juntar o
 * upload ao formulário de texto faria "Salvar" tentar mandar a imagem inteira a
 * cada gravação de copy, e um envio falho perderia as alterações de texto junto.
 */
function FormHero({ figureSlug, atual }: { figureSlug: string; atual: string | null }) {
  const noBucket = Boolean(atual) && !atual!.startsWith('/');
  return (
    <form action={subirHero.bind(null, figureSlug)} className="flex flex-wrap items-center gap-2">
      {/* É a imagem pela qual o cliente decide comprar. Ver o que está publicado
          agora, sem sair da tela, é o que evita descobrir depois que a landing
          está no ar sem foto. Rota pública porque é material de marketing. */}
      <span className="flex w-full items-center gap-3">
        {atual ? (
          // eslint-disable-next-line @next/next/no-img-element -- rota própria, sem otimizador
          <img
            src={noBucket ? `/api/hero/${figureSlug}` : atual!}
            alt="Foto de exemplo desta figura"
            className="h-24 w-20 shrink-0 rounded object-cover"
          />
        ) : (
          <span className="flex h-24 w-20 shrink-0 items-center justify-center rounded bg-warn/15 text-center text-[10px] leading-tight text-warn">
            sem
            <br />
            foto
          </span>
        )}
        <span className="text-xs text-muted">
          {atual
            ? 'Enviar outra substitui e apaga a anterior.'
            : 'A landing está sem foto de exemplo. Gere uma pelo próprio sistema (uma selfie sua, "Liberar sem cobrar" no painel) e envie aqui — imagem de banco ou montagem promete o que o produto não entrega.'}
        </span>
      </span>
      <input
        type="file"
        name="arquivo"
        accept="image/jpeg,image/png,image/webp"
        required
        className="text-sm"
      />
      <button className="rounded-lg bg-surface-2 px-4 py-2 text-sm font-semibold hover:bg-border">
        Enviar foto
      </button>
    </form>
  );
}

function Bloco({
  titulo,
  ajuda,
  children,
}: {
  titulo: string;
  ajuda?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <h2 className="font-bold">{titulo}</h2>
      {ajuda && <p className="mt-1 mb-3 text-xs text-muted">{ajuda}</p>}
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

function Campo({
  nome,
  rotulo,
  valor,
  ajuda,
  multilinha,
  obrigatorio = true,
  somenteLeitura = false,
}: {
  nome: string;
  rotulo: string;
  valor: string;
  ajuda?: string;
  multilinha?: boolean;
  obrigatorio?: boolean;
  somenteLeitura?: boolean;
}) {
  const classe =
    'w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent disabled:opacity-60';
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{rotulo}</span>
      {multilinha ? (
        <textarea
          name={nome}
          rows={2}
          required={obrigatorio}
          defaultValue={valor}
          className={classe}
        />
      ) : (
        <input
          name={nome}
          required={obrigatorio}
          defaultValue={valor}
          readOnly={somenteLeitura}
          className={classe}
        />
      )}
      {ajuda && <span className="mt-1 block text-xs text-muted">{ajuda}</span>}
    </label>
  );
}
