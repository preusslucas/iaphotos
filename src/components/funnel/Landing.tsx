import { useSearchParams } from 'next/navigation';
import Image from 'next/image';
import type { ReactNode } from 'react';
import type { PublicFigure, PublicScene } from '@/content';
import { AiBadge } from '@/components/ui';
import { SAMPLE_AI_BADGE } from '@/content/terms';
import { HeroVturb, temVturb } from './HeroVturb';

/**
 * Tela de venda. Um único CTA, repetido — sem menu, sem link que leve para
 * fora: cada saída possível numa landing de tráfego pago é dinheiro de anúncio
 * jogado fora.
 *
 * O desenho veio da LP feita no Lovable (TanStack Start + Vite). O que mudou na
 * portagem, e por quê:
 *
 * - `<Link to="/oferta">` virou `onStart()`. Lá a landing era uma ROTA e o CTA
 *   navegava; aqui ela é o primeiro passo do funil e o CTA só avança o estado.
 *   Trocar de rota custaria um carregamento inteiro no meio da decisão de
 *   compra, e passaria por cima do rascunho em localStorage que segura o pedido.
 * - Os ícones do `lucide-react` viraram SVG inline (são seis). A dependência
 *   inteira para seis desenhos entra no bundle de uma página que precisa abrir
 *   em 4G.
 * - Nenhum componente do shadcn/Radix veio junto: a LP original não usava
 *   nenhum de fato, só `div` e `button`.
 * - Os tamanhos absolutos (`text-[9px]`, `text-[10px]`) viraram a escala em rem
 *   do projeto. `px` ignora o `font-size: 17px` do `globals.css`, que existe
 *   justamente porque o público é mais velho — 9px cravado é o oposto disso.
 *
 * Segunda passada, trazendo o ACABAMENTO que tinha ficado de fora:
 *
 * - O degradê de fundo (`page-gradient`, agora no `body`) e as sombras
 *   (`shadow-card` na coluna, `shadow-soft` nos elementos soltos). São o que faz
 *   a coluna de 430px parecer uma tela de aplicativo em vez de texto solto.
 * - O CTA voltou a ser degradê (`cta-gradient`) com o leve levantar no hover.
 * - Os números da LP ("+12.487 fotos criadas") NÃO foram copiados. Aquilo é uma
 *   afirmação sobre o mundo, e a nossa é contada do banco — `fotosEntregues` é
 *   `Order` em READY. Se ainda não houver volume, a linha simplesmente não
 *   aparece, que é melhor do que um número inventado numa página que também
 *   promete transparência três seções abaixo.
 * - O selo "Garantia de satisfação" da LP virou "Reembolso automático se
 *   falhar", que é literalmente o que `src/worker/refund.ts` faz. O original
 *   prometia algo que ninguém no código cumpre.
 */

/** A largura da coluna do desenho original: um cartão de telefone, centralizado. */
const COLUNA = 'mx-auto w-full max-w-[430px]';

export function Landing({ figure, onStart }: { figure: PublicFigure; onStart: () => void }) {
  const exemplos = figure.scenes.filter((s) => s.sampleImage).slice(0, 3);

  return (
    // `-mx-5` cancela o padding do <main> do funil para a faixa da bandeira e o
    // fundo chegarem à borda da tela. Só a landing faz isso: os passos seguintes
    // são formulário e querem a margem.
    <div className="-mx-5">
      {/* `shadow-card` sobre o degradê do `body`: é o que recorta a coluna do
          fundo. Em celular ela ocupa a largura toda e a sombra quase não
          aparece — o efeito é de tablet para cima. */}
      <div className={`${COLUNA} bg-surface pb-10 shadow-card`}>
        <FaixaBandeira />

        {/* HERO */}
        <section className="px-6 pt-8">
          {/* Sem `text-balance`, de propósito.
              Ele iguala o comprimento das linhas, e num título de duas linhas
              isso encurta a primeira e deixa um vão à direita — foi o que
              aconteceu com "Mostre de que | lado você está". Sem ele, a quebra é
              gulosa: a primeira linha enche até onde cabe. É o comportamento do
              desenho original, que também não usa balanceamento. */}
          <h1 className="text-[1.65rem] leading-[1.15] font-extrabold tracking-tight">
            {figure.headline}
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-pretty text-muted">
            {figure.subheadline}
          </p>

          <Hero figure={figure} />

          <div className="mt-7">
            <CtaPrincipal onClick={onStart} label={figure.ctaLabel} />
          </div>

          <p className="mt-3 text-center text-xs text-muted">
            Processo simples • Imagem personalizada • Pronta para compartilhar
          </p>

          <div className="mt-4 flex flex-wrap justify-center gap-2 text-xs text-muted">
            <Selo icon={<IconEscudoCheck />}>Dados protegidos</Selo>
            {/* Texto definido pelo cliente. Registrando o que ele afirma: hoje o
                sistema não tem garantia de satisfação — o que existe é estorno
                automático quando a GERAÇÃO falha em definitivo
                (`src/worker/refund.ts`). Nenhum caminho do código devolve
                dinheiro a quem recebeu a foto e não gostou. Honrar isso é
                decisão comercial, não de código. */}
            <Selo icon={<IconSeloCheck />}>Garantia de satisfação</Selo>
          </div>

          {/*
            Número definido pelo cliente, exibido como ele pediu.

            Registrando o que ele é: uma afirmação de fato sobre o negócio que
            não sai de lugar nenhum do sistema. O contador real existe e
            funciona — `contaFotosEntregues` em `src/content/index.ts`, pedidos
            em READY —, e é para lá que esta linha deve voltar quando o volume
            justificar. Enquanto isso o valor fica em `PROVA_SOCIAL`, visível e
            num lugar só, em vez de espalhado pelo JSX.

            Vale saber, e a decisão é comercial: número de vendas não praticado
            é publicidade enganosa (CDC art. 37, §1º) e a landing o exibe três
            seções acima do bloco "Segurança e transparência".
          */}
          <p className="mt-4 text-center text-xs text-muted">
            <IconEstrela className="mr-1 inline h-3 w-3" />
            <strong className="text-foreground">{PROVA_SOCIAL}</strong> fotos patriotas já criadas
          </p>

          {/* Texto definido pelo cliente, igual ao desenho.

              Registrando a divergência: o vídeo do topo é uma GRAVAÇÃO DE TELA
              do produto em uso — uma pessoa real e a interface real —, então
              chamá-lo de fictício e gerado por IA não é verdade. O
              `DEMO_DISCLAIMER` em `content/terms.ts` existe para este caso e
              continua lá, pronto, se um dia a frase voltar a descrever a mídia
              que está em cima dela. */}
          <p className="mt-4 text-center text-xs text-muted">
            Vídeo fictício gerado por inteligência artificial.
          </p>
        </section>

        {/* EXEMPLOS — escondidos enquanto nenhuma cena tiver amostra no /admin.
            Carrossel com imagem quebrada converte pior que carrossel nenhum. */}
        {exemplos.length > 0 && (
          <section className="mt-10 bg-surface-2/60 px-6 py-8">
            <h2 className="text-lg font-bold">Exemplos de resultado</h2>
            <p className="mt-2 text-xs leading-relaxed text-muted">
              Imagens de exemplo servem apenas para mostrar estilos possíveis. Elas não são
              clientes reais.
            </p>
            <div className="-mx-6 mt-5 flex snap-x gap-3 overflow-x-auto px-6 pb-2">
              {exemplos.map((cena) => (
                <Exemplo key={cena.id} figura={figure.slug} cena={cena} />
              ))}
            </div>
          </section>
        )}

        {/* COMO FUNCIONA — numerado porque a ordem é real: a pessoa percorre os
            três na sequência, e o número diz onde ela está. */}
        <section className="px-6 py-8">
          <h2 className="text-lg font-bold">Como funciona</h2>
          <p className="mt-2 text-xs leading-relaxed text-muted">
            O processo é curto, direto e feito para quem quer uma imagem patriota pronta para
            postar.
          </p>
          <ol className="mt-5 space-y-3">
            {PASSOS.map((passo, i) => (
              <li
                key={passo}
                className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-4"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-sm font-bold text-accent">
                  {i + 1}
                </span>
                <span className="text-sm font-medium">{passo}</span>
              </li>
            ))}
          </ol>
        </section>

        {/* DEPOIMENTOS — vindos do /admin, como o resto da copy. */}
        {figure.testimonials.length > 0 && (
          <section className="px-6 pb-8">
            <h2 className="text-lg font-bold">Quem já usou aprova</h2>
            <p className="mt-2 text-xs leading-relaxed text-muted">
              Mensagens de patriotas que criaram e compartilharam a própria foto. Fotos
              ilustrativas.
            </p>
            <div className="mt-5 space-y-3">
              {figure.testimonials.map((d) => (
                <article
                  key={d.name}
                  className="rounded-xl border border-border bg-surface p-4 shadow-soft"
                >
                  <header className="flex items-center gap-3">
                    <FotoDoDepoimento nome={d.name} foto={d.photo} />
                    <p className="min-w-0 flex-1 text-xs font-bold">
                      {d.name} <span className="text-[0.6rem] font-normal text-muted">{d.city}</span>
                    </p>
                    <Estrelas />
                  </header>
                  <p className="mt-3 text-xs leading-relaxed">&ldquo;{d.text}&rdquo;</p>
                </article>
              ))}
            </div>
          </section>
        )}

        {/* SEGURANÇA */}
        <section className="px-6 pb-8">
          <div className="rounded-xl border border-border bg-surface-2/50 p-5">
            <h2 className="flex items-center gap-2 text-sm font-bold">
              <IconEscudo /> Segurança e transparência
            </h2>
            <ul className="mt-4 space-y-2.5">
              {SEGURANCA.map((item) => (
                <li key={item} className="flex gap-2 text-xs">
                  <span className="mt-0.5 shrink-0 text-accent">
                    <IconCheck />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* CTA FINAL */}
        <section className="px-6">
          <div className="rounded-2xl bg-green-deep px-6 py-8 text-center">
            <h2 className="text-xl leading-snug font-extrabold text-white">
              Pronto para criar sua imagem com nosso capitão?
            </h2>
            <div className="mt-6">
              <CtaPrincipal onClick={onStart} label={figure.ctaLabel} variante="ouro" />
            </div>
            <p className="mt-4 text-xs text-white/75">
              Imagem fictícia gerada por inteligência artificial.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

const PASSOS = ['Escolha o clima', 'Envie uma foto nítida', 'Libere sua imagem'];

/**
 * Prova social exibida no topo. Valor definido pelo cliente.
 *
 * Constante e não literal no meio do JSX para que exista UM lugar a mudar — e
 * para que quem abrir este arquivo veja que é um número escrito à mão, e não
 * algo que o sistema contou. O contador real é `contaFotosEntregues`.
 */
const PROVA_SOCIAL = '+12.487';

/** Caixa alta e miúdo, como no desenho: o selo identifica sem roubar a imagem. */
const ESTILO_SELO = 'font-bold tracking-wide uppercase text-[0.62rem]';

const SEGURANCA = [
  'Imagem gerada por IA',
  'Pagamento único, sem assinatura',
  'Sua foto é usada apenas para gerar o resultado',
  'Seus dados ficam protegidos do início ao fim',
  'Não é propaganda oficial nem apoio de figura pública',
];

/**
 * Mídia do topo: player do VTurb quando configurado, senão a `heroImage` do
 * /admin.
 *
 * O `<video>` com arquivo em `public/` saiu daqui. Ele existia para tocar o
 * `NEXT_PUBLIC_HERO_VIDEO`, e o vídeo passou a ser hospedado no VTurb — ver
 * `HeroVturb.tsx` para o que a troca ganha e o que ela custa.
 *
 * As envs do VTurb são lidas no BUILD e inlinadas no bundle, como toda
 * `NEXT_PUBLIC_*` aqui. No Coolify elas precisam ser build arg no
 * `Dockerfile.web`, e não env de runtime (ver README) — esquecer isso não
 * quebra o build, só faz o player nunca aparecer em produção.
 */
function Hero({ figure }: { figure: PublicFigure }) {
  /**
   * `?vturb=off` desliga o player e cai na `heroImage`.
   *
   * Existe para separar, em um clique, "a página não hidrata" de "o player está
   * atrapalhando a página". Sem isso a única forma de testar é editar o `.env` e
   * reiniciar o servidor, e a resposta demora uma rodada inteira.
   *
   * `useSearchParams` e não `window.location`: precisa dar o MESMO resultado no
   * servidor e no cliente, senão o próprio interruptor vira uma divergência de
   * hidratação e passa a causar o problema que veio investigar.
   */
  const semPlayer = useSearchParams().get('vturb') === 'off';
  const usarVturb = temVturb && !semPlayer;

  if (!usarVturb && !figure.heroImage) return null;

  return (
    <div className="relative mx-auto mt-7 w-[72%]">
      <span
        aria-hidden
        className="absolute -top-4 -right-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-green-deep shadow-soft"
      >
        <IconEstrela className="h-5 w-5" />
      </span>

      {usarVturb ? (
        <HeroVturb />
      ) : (
        <div className="overflow-hidden rounded-2xl border-4 border-brasil shadow-card">
          <Image
            src={figure.heroImage!}
            alt={`Exemplo fictício de foto com ${figure.figureLabel}`}
            width={480}
            height={640}
            priority
            className="aspect-[3/4] w-full object-cover"
          />
        </div>
      )}
      {/*
        Selo sobre as duas mídias, como no desenho do cliente.

        `pointer-events-none` não é detalhe: o "clique para ouvir" do VTurb
        (`smartAutoPlay` com `autoUnmute`) usa a superfície inteira do vídeo
        como alvo, e um selo opaco por cima comeria justamente o clique que liga
        o som. Sem eventos de ponteiro ele aparece e deixa o clique passar.

        `z-10` para empatar com a estrela: o container do player tem `isolate`,
        então tudo o que é interno dele fica confinado abaixo destes dois.
      */}
      <AiBadge
        className={`pointer-events-none absolute bottom-2 left-2 z-10 ${ESTILO_SELO}`}
        label={SAMPLE_AI_BADGE}
      />

    </div>
  );
}

/**
 * Rosto do depoimento: foto quando houver, iniciais quando não.
 *
 * A LP trazia quatro `.jpeg` importados direto. Aqui a foto é um dado da figura
 * (`Testimonial.photo`), como o resto da copy — a landing não conhece arquivo
 * nenhum pelo nome, e uma figura nova pode ter as suas próprias sem tocar neste
 * componente.
 *
 * Só caminho servível é aceito. `Testimonial.photo` pode guardar uma CHAVE de
 * bucket (o campo é o mesmo tipo que `heroImage`), e chave crua no `src` de uma
 * `<img>` renderiza um retângulo quebrado. Sem barra ou `http`, cai nas
 * iniciais — que é a degradação certa, e não um erro na tela.
 */
function FotoDoDepoimento({ nome, foto }: { nome: string; foto?: string }) {
  const servivel = foto && (foto.startsWith('/') || foto.startsWith('http'));

  if (!servivel) {
    return (
      <span
        aria-hidden
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-xs font-bold text-accent"
      >
        {iniciais(nome)}
      </span>
    );
  }

  return (
    <Image
      src={foto}
      // Vazio de propósito: a foto é ilustrativa e o nome já está escrito ao
      // lado. Descrevê-la de novo só faz o leitor de tela repetir o nome.
      alt=""
      width={36}
      height={36}
      loading="lazy"
      className="h-9 w-9 shrink-0 rounded-full object-cover"
    />
  );
}

function Exemplo({ figura, cena }: { figura: string; cena: PublicScene }) {
  // Caminho em `public/` o Next já serve; chave de bucket precisa da rota que
  // dá uma URL ESTÁVEL — assinada mudaria a cada render e o next/image
  // re-otimizaria a mesma foto toda vez. Mesma distinção que `urlDaHero`.
  const amostra = cena.sampleImage!;
  const src = amostra.startsWith('/') ? amostra : `/api/samples/${figura}/${cena.id}`;

  return (
    <figure className="w-[62%] shrink-0 snap-start">
      <div className="relative overflow-hidden rounded-xl border border-border shadow-soft">
        <Image
          src={src}
          alt={`Exemplo fictício: ${cena.label}`}
          width={768}
          height={960}
          loading="lazy"
          className="aspect-[4/5] w-full object-cover"
        />
        <AiBadge
          className={`absolute top-2 left-2 ${ESTILO_SELO}`}
          label={SAMPLE_AI_BADGE}
        />
      </div>
      <figcaption className="mt-2">
        {/* `sampleCaption` e não `label`: a legenda da vitrine é escrita para
            quem ainda não comprou ("Exemplo 1: Selfie patriota"), e o `label` é
            o nome que aparece no seletor de cenário para quem já está
            escolhendo ("Selfie na rua"). Sem o campo próprio, mexer numa
            estragava a outra. */}
        <p className="text-xs font-semibold">{cena.sampleCaption ?? cena.label}</p>
        <p className="text-xs text-muted">Imagem fictícia para demonstrar o estilo.</p>
      </figcaption>
    </figure>
  );
}

function CtaPrincipal({
  onClick,
  label,
  variante = 'verde',
}: {
  onClick: () => void;
  label: string;
  variante?: 'verde' | 'ouro';
}) {
  // `transition` (e não `transition-colors`): o botão agora também se desloca
  // no hover, como na LP. Quem desligou animação no sistema não vê nada disso —
  // a regra de `prefers-reduced-motion` no globals.css zera a duração.
  const base =
    'inline-flex w-full items-center justify-center gap-2 rounded-xl px-6 py-4 text-base ' +
    'font-bold shadow-soft transition hover:-translate-y-0.5 ' +
    'focus-visible:outline-2 focus-visible:outline-offset-2';
  const estilo =
    variante === 'verde'
      ? 'cta-gradient text-white hover:brightness-110 focus-visible:outline-accent'
      : 'bg-brasil text-brasil-escuro hover:brightness-95 focus-visible:outline-white';

  return (
    <button type="button" onClick={onClick} className={`${base} ${estilo}`}>
      {label}
      <IconSeta />
    </button>
  );
}

function Selo({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5">
      <span className="text-accent">{icon}</span>
      {children}
    </span>
  );
}

function FaixaBandeira() {
  return (
    <div aria-hidden className="flex h-1.5">
      <div className="flex-1 bg-green-deep" />
      <div className="flex-1 bg-brasil" />
      <div className="flex-1 bg-green-deep" />
    </div>
  );
}

function Estrelas() {
  return (
    <span aria-hidden className="flex shrink-0 gap-0.5">
      {Array.from({ length: 5 }, (_, i) => (
        <IconEstrela key={i} className="h-3 w-3" />
      ))}
    </span>
  );
}

function iniciais(nome: string) {
  return nome
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}

/* Ícones ------------------------------------------------------------------
   Os seis do `lucide-react` usados pela LP, inline. `currentColor` para
   herdarem a cor de quem os contém, como no original. */

const traco = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

function IconSeta() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4" {...traco}>
      <path d="M5 12h14M12 5l7 7-7 7" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-3.5 w-3.5" {...traco}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function IconEscudo() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4 text-accent" {...traco}>
      <path d="M20 13c0 5-3.5 7.5-8 9-4.5-1.5-8-4-8-9V6l8-3 8 3Z" />
    </svg>
  );
}

function IconEscudoCheck() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-3.5 w-3.5" {...traco}>
      <path d="M20 13c0 5-3.5 7.5-8 9-4.5-1.5-8-4-8-9V6l8-3 8 3Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function IconSeloCheck() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-3.5 w-3.5" {...traco}>
      <path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function IconEstrela({ className = '' }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={`fill-brasil text-brasil ${className}`}>
      <path
        d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}
