import { prisma } from '@/lib/prisma';
import type { AspectRatio, FigureConfig, SceneConfig } from './types';

/**
 * Catalogo de figuras e cenas.
 *
 * Morava em `src/content/figures/*.ts` ate 2026-08-13; agora vem do banco, para
 * lancar um lider novo pelo /admin sem deploy. As funcoes viraram `async` por
 * causa disso — o formato de retorno continua o mesmo, entao quem consome
 * mudou pouco.
 *
 * As consultas NAO sao cacheadas de proposito. Sao poucas linhas indexadas por
 * chave primaria, e o /admin precisa que desligar uma figura tenha efeito
 * imediato: e o kill switch para risco juridico. Cache aqui trocaria segundos
 * de latencia por minutos de exposicao.
 */

/** Uma figura so pode ser vendida com pelo menos uma cena e uma referencia. */
function vendavel(f: { scenes: unknown[]; references: unknown[]; enabled: boolean }): boolean {
  return f.enabled && f.scenes.length > 0 && f.references.length > 0;
}

const incluiTudo = {
  scenes: { where: { enabled: true }, orderBy: { sortOrder: 'asc' } },
  references: { orderBy: { sortOrder: 'asc' } },
  bonuses: { orderBy: { sortOrder: 'asc' } },
  testimonials: { orderBy: { sortOrder: 'asc' } },
  addonsOffered: {
    orderBy: { sortOrder: 'asc' },
    include: {
      adicional: {
        include: {
          scenes: { where: { enabled: true }, select: { id: true } },
          references: { select: { id: true } },
        },
      },
    },
  },
} as const;

type FiguraComTudo = NonNullable<Awaited<ReturnType<typeof buscaFigura>>>;

function buscaFigura(slug: string) {
  return prisma.figure.findUnique({ where: { slug }, include: incluiTudo });
}

function montaFigura(row: FiguraComTudo): FigureConfig {
  const addons = row.addonsOffered.map((a) => ({
    slug: a.adicional.slug,
    productName: a.adicional.productName,
    figureLabel: a.adicional.figureLabel,
    vendavel: vendavel(a.adicional),
  }));

  // Sem adicional vendavel nao existe combo: mostrar um "leve as tres" que o
  // sistema nao consegue gerar seria vender o que nao da para entregar.
  const temAddon = addons.some((a) => a.vendavel);

  return {
    slug: row.slug,
    productName: row.productName,
    figureLabel: row.figureLabel,
    headline: row.headline,
    subheadline: row.subheadline,
    ctaLabel: row.ctaLabel,
    priceCents: row.priceCents,
    compareAtCents: row.compareAtCents ?? undefined,
    bundlePriceCents: temAddon ? (row.bundlePriceCents ?? undefined) : undefined,
    priceNote: row.priceNote ?? undefined,
    comboTitle: row.comboTitle ?? undefined,
    comboPitch: row.comboPitch ?? undefined,
    isPrimary: row.isPrimary,
    enabled: row.enabled,
    notice: row.notice ?? undefined,
    heroImage: row.heroImage ?? undefined,
    scenes: row.scenes.map((s) => ({
      id: s.sceneId,
      label: s.label,
      hint: s.hint,
      aspectRatio: s.aspectRatio as AspectRatio,
      setting: s.setting,
      icon: s.icon ?? undefined,
      sampleImage: s.sampleImage ?? undefined,
      sampleCaption: s.sampleCaption ?? undefined,
    })),
    testimonials: row.testimonials.map((t) => ({
      name: t.name,
      city: t.city,
      text: t.text,
      photo: t.photo ?? undefined,
    })),
    bonuses: row.bonuses.map((b) => ({
      label: b.label,
      description: b.description,
      objectKey: b.objectKey,
    })),
    addons,
    referenceKeys: row.references.map((r) => r.objectKey),
    loraUrl: row.loraUrl ?? undefined,
    loraTrigger: row.loraTrigger ?? undefined,
  };
}

export async function getFigure(slug: string): Promise<FigureConfig | null> {
  const row = await buscaFigura(slug);
  return row ? montaFigura(row) : null;
}

/**
 * Resolve a cena SEMPRE a partir do catalogo, nunca do que o browser mandou.
 * O sceneId chega do cliente; se ele virasse prompt direto, qualquer um
 * escreveria o proprio prompt e usaria a sua conta do fal.ai de graca.
 */
export async function getScene(figureSlug: string, sceneId: string): Promise<SceneConfig | null> {
  const s = await prisma.scene.findUnique({
    where: { figureSlug_sceneId: { figureSlug, sceneId } },
  });
  if (!s || !s.enabled) return null;

  return {
    id: s.sceneId,
    label: s.label,
    hint: s.hint,
    aspectRatio: s.aspectRatio as AspectRatio,
    setting: s.setting,
    icon: s.icon ?? undefined,
    sampleImage: s.sampleImage ?? undefined,
  };
}

/**
 * Cena de uma figura ADICIONAL, dado o que a pessoa escolheu na principal.
 *
 * Tenta o mesmo `sceneId` — se ela pediu "comício", queremos comício com todos
 * os líderes. Quando o adicional nao tem aquela cena cadastrada, cai na
 * primeira ativa dele: e melhor entregar a foto num cenario proximo do que
 * derrubar o item e reter o pedido inteiro por causa de um cadastro faltando.
 */
export async function resolveSceneParaAddon(
  figureSlug: string,
  sceneIdDesejado: string,
): Promise<SceneConfig | null> {
  return (
    (await getScene(figureSlug, sceneIdDesejado)) ??
    (await (async () => {
      const s = await prisma.scene.findFirst({
        where: { figureSlug, enabled: true },
        orderBy: { sortOrder: 'asc' },
      });
      return s
        ? {
            id: s.sceneId,
            label: s.label,
            hint: s.hint,
            aspectRatio: s.aspectRatio as AspectRatio,
            setting: s.setting,
            icon: s.icon ?? undefined,
            sampleImage: s.sampleImage ?? undefined,
          }
        : null;
    })())
  );
}

/**
 * Quantas fotos desta figura ja foram entregues.
 *
 * Alimenta a prova social da landing. A LP do Lovable trazia "+12.487 fotos
 * patriotas ja criadas" cravado no JSX; este numero e contado, e por isso pode
 * ser dito numa pagina que promete transparencia tres secoes abaixo.
 *
 * READY e nao PAID: o que a frase promete e foto ENTREGUE. Pedido pago cuja
 * geracao falhou nao vira prova de nada — e ainda por cima foi estornado.
 *
 * `isTest: false` porque a bancada do /admin passa pelo mesmo caminho de
 * geracao e produz pedidos READY de verdade. Sem este filtro, uma bateria de
 * testes inflaria o numero exibido ao cliente, que e a definicao do problema
 * que a marca `isTest` existe para evitar.
 *
 * Sem cache, como o resto deste arquivo: e um COUNT indexado por figureSlug, e
 * a pagina ja e `force-dynamic` por causa do kill switch.
 *
 * SEM USO hoje: a landing exibe um numero fixo, definido pelo cliente
 * (`PROVA_SOCIAL` em `components/funnel/Landing.tsx`). Esta funcao fica porque
 * e para ca que aquela linha deve voltar quando o volume real justificar — e
 * enquanto ela existe, a diferenca entre "contado" e "afirmado" fica visivel
 * para quem for mexer.
 */
export function contaFotosEntregues(figureSlug: string): Promise<number> {
  return prisma.order.count({
    where: { figureSlug, status: 'READY', isTest: false },
  });
}

/** Figuras com landing propria e prontas para vender. Alimenta as rotas. */
export async function listPrimarySlugs(): Promise<string[]> {
  const rows = await prisma.figure.findMany({
    where: { isPrimary: true, enabled: true },
    select: { slug: true },
    orderBy: { slug: 'asc' },
  });
  return rows.map((r) => r.slug);
}

/** Todas as figuras, para o /admin. Inclui desligadas e nao vendaveis. */
export async function listFigures(): Promise<FigureConfig[]> {
  const rows = await prisma.figure.findMany({
    include: incluiTudo,
    orderBy: [{ isPrimary: 'desc' }, { slug: 'asc' }],
  });
  return rows.map(montaFigura);
}

export type PublicScene = Omit<SceneConfig, 'setting'>;
export type PublicFigure = Omit<
  FigureConfig,
  'scenes' | 'referenceKeys' | 'loraUrl' | 'loraTrigger' | 'bonuses'
> & { scenes: PublicScene[]; bonuses: { label: string; description: string }[] };

/**
 * Versao segura para mandar ao browser.
 *
 * Tudo que um Server Component passa para um Client Component viaja no payload
 * da pagina e fica visivel no "ver codigo-fonte". Os prompts (`setting`) sao o
 * resultado da Fase 0 — o ativo mais caro do produto — e `referenceKeys` e o
 * `objectKey` dos bonus expoem caminhos internos do bucket. Nada disso e
 * necessario para desenhar a tela.
 *
 * O servidor sempre resolve o prompt pelo catalogo a partir do `sceneId`, entao
 * o cliente nunca precisou dessas informacoes para funcionar.
 */
export function toPublicFigure(figure: FigureConfig): PublicFigure {
  const {
    referenceKeys: _r,
    loraUrl: _l,
    loraTrigger: _t,
    scenes,
    bonuses,
    ...rest
  } = figure;

  return {
    ...rest,
    heroImage: urlDaHero(figure.slug, figure.heroImage),
    scenes: scenes.map(({ setting: _s, ...scene }) => scene),
    bonuses: bonuses.map(({ objectKey: _o, ...b }) => b),
  };
}

/**
 * Resolve a hero da figura para uma URL que o navegador consegue abrir.
 *
 * Mesma logica que a amostra usava: o que esta gravado e uma CHAVE de bucket, e
 * o bucket e privado. A rota /api/hero/[figura] serve os bytes numa URL ESTAVEL
 * — assinada mudaria a cada render e o `next/image` trataria a mesma foto como
 * imagem nova toda vez, re-otimizando na pagina que mais precisa ser rapida.
 *
 * A distincao e o primeiro caractere: chave de bucket nunca comeca com barra.
 */
function urlDaHero(figureSlug: string, valor?: string): string | undefined {
  if (!valor) return undefined;
  if (valor.startsWith('/') || valor.startsWith('http')) return valor;
  return `/api/hero/${figureSlug}`;
}

// `urlDaAmostra` saiu junto com a amostra por cena: nenhuma tela le mais
// `sampleImage`, e a rota /api/samples continua de pe apenas para nao quebrar
// link que alguem tenha guardado.

// `formatBRL` mudou para src/lib/format.ts: componentes de CLIENTE a importam,
// e este modulo fala com prisma e MinIO — o bundle do navegador nao pode
// carregar nenhum dos dois.
export { formatBRL } from '@/lib/format';

export type {
  AddonConfig,
  AspectRatio,
  BonusConfig,
  FigureConfig,
  SceneConfig,
  Testimonial,
} from './types';
