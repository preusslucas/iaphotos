import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '..');

export const paths = {
  selfies: path.join(ROOT, 'inputs', 'selfies'),
  references: path.join(ROOT, 'inputs', 'reference'),
  plates: path.join(ROOT, 'inputs', 'scenes'),
  out: path.join(ROOT, 'out'),
};

export const env = {
  bflKey: process.env.BFL_API_KEY ?? '',
  falKey: process.env.FAL_KEY ?? '',
  loraUrl: process.env.FIGURE_LORA_URL ?? '',
  loraTrigger: process.env.FIGURE_LORA_TRIGGER || 'TOK',
  loraScale: Number(process.env.FIGURE_LORA_SCALE ?? '1.0'),
};

/**
 * Custo por imagem, em USD. Confira em bfl.ai/pricing e fal.ai/pricing antes de
 * usar estes numeros para definir o preco de venda — tabelas de preco mudam.
 */
export const pricing = {
  // BFL direto — mais barato, mas exige deposito minimo.
  'flux-kontext-pro': 0.04,
  'flux-kontext-max': 0.08,
  // fal.ai — markup pela conveniencia, sem minimo. Confira em fal.ai/pricing.
  'fal-kontext-max-multi': 0.08,
  'fal-kontext-pro-multi': 0.04,
  'fal-flux-kontext-lora': 0.035,
  'fal-seedream-edit': 0.03,
  'fal-nano-banana-edit': 0.039,
  // ATENCAO: acima do gate.maxCostUsd (US$0.11). Confira em fal.ai/pricing —
  // a tabela do Pro varia com a resolucao (4K custa mais que 1K/2K).
  'fal-nano-banana-pro-edit': 0.139,
  // gpt-image-2 e cobrado por token, nao por imagem: o valor varia com a
  // qualidade E com quantas imagens de entrada voce manda. Estes numeros sao a
  // saida em 1024x1536 pela tabela da OpenAI, sem o markup do fal nem os tokens
  // das 4 imagens de entrada — trate como piso, nao como preco final.
  'fal-gpt-image-2-low': 0.005,
  'fal-gpt-image-2-medium': 0.041,
  'fal-gpt-image-2-high': 0.165,
} as const;

/**
 * Qualidade do gpt-image-2. E a variavel de custo mais violenta do spike:
 * `high` custa 33x o `low` e estoura o gate de US$0,11 sozinho.
 */
export const gptImageQuality = (process.env.GPT_IMAGE_QUALITY ?? 'high') as
  | 'low'
  | 'medium'
  | 'high';

/** Endpoints do fal usados pelas rotas. Verifique em fal.ai/models. */
export const falEndpoints = {
  kontextMaxMulti: 'fal-ai/flux-pro/kontext/max/multi',
  kontextProMulti: 'fal-ai/flux-pro/kontext/multi',
  kontextLora: 'fal-ai/flux-kontext-lora',
  seedreamEdit: 'fal-ai/bytedance/seedream/v4.5/edit',
  nanoBananaEdit: 'fal-ai/nano-banana/edit',
  nanoBananaProEdit: 'fal-ai/nano-banana-pro/edit',
  gptImage2Edit: 'fal-ai/gpt-image-2/edit',
} as const;

/**
 * Timeout duro por geracao. Acima disso o produto ja perdeu o usuario de
 * qualquer forma — mas durante o spike as vezes vale esperar mais para poder
 * OLHAR o resultado de uma rota lenta antes de descarta-la pela latencia.
 * O gpt-image-2 em `high` passa de 90s: GENERATION_TIMEOUT_MS=240000 para ver.
 */
export const GENERATION_TIMEOUT_MS = Number(process.env.GENERATION_TIMEOUT_MS ?? '90000');

/** Criterios de aprovacao da Fase 0 (ver plano). */
export const gate = {
  minSuccessRate: 0.7,
  maxP95Ms: 40_000,
  /** R$0,60 convertido a ~R$5,40/USD. Ajuste com o cambio do dia. */
  maxCostUsd: 0.11,
};
