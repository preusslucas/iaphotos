/** Por que o job terminou. `moderated` e a metrica que mais importa na Fase 0: */
/** se a politica do provedor recusar a figura publica, a rota inteira morre.  */
export type Outcome = 'ok' | 'moderated' | 'error' | 'timeout';

export interface Scene {
  /** Slug estavel — vira o id da cena no catalogo do produto. */
  id: string;
  /** Nome exibido ao usuario. */
  label: string;
  /**
   * Descricao APENAS do cenario (ambiente, enquadramento, luz, roupa).
   * As instrucoes de identidade sao montadas por cada rota, porque cada uma
   * recebe as imagens numa ordem diferente.
   */
  setting: string;
  aspectRatio: '1:1' | '3:4' | '4:3' | '9:16' | '16:9';
  /**
   * Cena pre-renderizada com a figura publica, usada apenas pela rota C.
   * Caminho relativo a `inputs/scenes/`.
   */
  plateFile?: string;
}

export interface GenerateInput {
  scene: Scene;
  /** Selfie do usuario, ja normalizada. */
  selfie: Buffer;
  /** Fotos de referencia da figura publica (rotas A e C). */
  references: Buffer[];
  seed: number;
}

export interface GenerateResult {
  outcome: Outcome;
  /** PNG/JPEG gerado. Presente somente quando `outcome === 'ok'`. */
  image?: Buffer;
  /** Motivo legivel da falha — vai direto para o CSV. */
  detail?: string;
  latencyMs: number;
  costUsd: number;
}

export interface RouteDefinition {
  id:
    | 'a-kontext-multiref'
    | 'b-lora'
    | 'c-plate-faceswap'
    | 'd-seedream'
    | 'e-nano-banana'
    | 'f-nano-banana-pro'
    | 'g-gpt-image-2'
    | 'a-kontext-multiref-bfl';
  label: string;
  /** Env vars obrigatorias; a rota e pulada (nao falha) se faltar alguma. */
  requiredEnv: string[];
  /** Custo por imagem em USD, usado na estimativa impressa antes de gastar. */
  unitCostUsd: number;
  generate(input: GenerateInput): Promise<GenerateResult>;
}

export interface TrialRecord {
  route: string;
  /** Variante de prompt usada — permite comparar formulações lado a lado. */
  prompt: string;
  scene: string;
  selfie: string;
  seed: number;
  /**
   * Indice da repeticao (1..N do --repeat). Rotas sem `seed`, como a
   * g-gpt-image-2, so podem ser medidas por amostragem: e a variacao entre
   * repeticoes que revela taxa de recusa e instabilidade de semelhanca.
   */
  repeat: number;
  outcome: Outcome;
  detail: string;
  latencyMs: number;
  costUsd: number;
  outputFile: string;
}
