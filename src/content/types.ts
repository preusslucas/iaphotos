/** Proporcao aceita pelo provedor de imagem. */
export type AspectRatio = '1:1' | '3:4' | '4:3' | '9:16' | '16:9';

export interface SceneConfig {
  id: string;
  label: string;
  /** Frase curta exibida no card de escolha. */
  hint: string;
  aspectRatio: AspectRatio;
  /**
   * Descricao APENAS do cenario. As instrucoes de identidade sao montadas em
   * src/lib/prompts.ts, porque dependem da rota de geracao escolhida na Fase 0
   * — a cena nao deve saber como o modelo recebe as imagens.
   */
  setting: string;
  /** Emoji do card de escolha. Cai num marcador neutro quando vazio. */
  icon?: string;
  /**
   * Imagem de exemplo da cena. Sem uso no funil desde que o card virou texto com
   * icone — preservada porque as cenas do patriota ja tem valor gravado.
   */
  sampleImage?: string;
}

export interface Testimonial {
  name: string;
  city: string;
  text: string;
  /**
   * Foto do rosto na landing. Indefinida = a landing desenha as iniciais.
   * Caminho em `public/` (servido direto) ou chave no bucket.
   */
  photo?: string;
}

export interface BonusConfig {
  label: string;
  description: string;
  objectKey: string;
}

/** Figura oferecida como adicional no checkout. So o que a tela precisa. */
export interface AddonConfig {
  slug: string;
  productName: string;
  figureLabel: string;
  /** Falso quando falta cena ou referencia — nao pode ser vendida ainda. */
  vendavel: boolean;
}

export interface FigureConfig {
  /** Slug da rota: /[slug]. */
  slug: string;
  /** Nome do produto exibido ao usuario. */
  productName: string;
  /**
   * Como a figura e referida na copy. Nunca use o nome civil de uma pessoa real
   * aqui sem checar o risco juridico — ver a secao de conformidade no README.
   */
  figureLabel: string;

  headline: string;
  subheadline: string;
  ctaLabel: string;

  /** Preco da foto sozinha. */
  priceCents: number;
  /** Preco "de", so para ancoragem. Deve ter existido de verdade em algum momento. */
  compareAtCents?: number;
  /**
   * Preco levando esta figura MAIS todos os adicionais vendaveis. Nulo quando
   * nao ha adicional — nesse caso a tela de pagamento nao mostra order bump.
   */
  bundlePriceCents?: number;

  /** Tem landing propria. Figura que so existe como adicional fica `false`. */
  isPrimary: boolean;
  /**
   * A unica foto de exemplo do produto, exibida no topo da landing.
   * Indefinida enquanto ninguem subiu — a landing esconde a secao.
   */
  heroImage?: string;
  enabled: boolean;
  /** Mensagem exibida na landing quando desligada. */
  notice?: string;

  scenes: SceneConfig[];
  testimonials: Testimonial[];
  bonuses: BonusConfig[];
  addons: AddonConfig[];

  /**
   * Referencias da figura usadas pelo gerador (chaves no bucket privado).
   * Os bytes ficam no MinIO, e nao no banco nem no repositorio, porque sao
   * material de terceiro.
   */
  referenceKeys: string[];
  /** LoRA treinada, quando a Fase 0 aprovar a rota B. */
  loraUrl?: string;
  loraTrigger?: string;
}
