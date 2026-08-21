import fs from 'node:fs/promises';
import path from 'node:path';
import { env, falEndpoints, gptImageQuality, paths, pricing } from './config.js';
import * as bfl from './providers/bfl.js';
import { runFal, toDataUri } from './providers/fal.js';
import { activeVariant } from './prompts.js';
import type { GenerateInput, GenerateResult, RouteDefinition } from './types.js';

/**
 * Sufixo comum a todas as rotas. Vale mais que qualquer adjetivo de qualidade:
 * o jeito de este produto falhar nao e gerar uma foto feia, e gerar uma foto
 * bonita de OUTRA pessoa. O cliente paga pelo proprio rosto.
 */
const IDENTITY_GUARD =
  'Preserve the exact facial identity, skin tone, hairline, facial hair and body type of ' +
  'each person; do not beautify, slim or age them. Photorealistic, natural skin texture, ' +
  'consistent lighting and perspective across both subjects.';

/** Delega para a variante selecionada em prompts.ts (flag --prompt). */
const sceneWithBoth = (setting: string, refCount: number) =>
  activeVariant().build({ setting, refCount });

const FACE_INSERT_PROMPT =
  'Replace the face and hair of the person on the left in image 1 with the face and hair ' +
  'of the person in image 2, keeping image 1 otherwise completely unchanged: same pose, ' +
  'same clothing, same background, same lighting and same camera angle. ' +
  IDENTITY_GUARD;

/**
 * Rota A — Kontext multi-referencia via fal.
 * Selfie + 2-3 fotos da figura no mesmo request. Zero setup, e a rota com maior
 * chance de ser recusada por politica — que e justamente o que queremos medir.
 */
const routeA: RouteDefinition = {
  id: 'a-kontext-multiref',
  label: 'Kontext multi-referência (fal)',
  requiredEnv: ['FAL_KEY'],
  unitCostUsd: pricing['fal-kontext-max-multi'],
  async generate(input) {
    const started = Date.now();
    const refs = input.references.slice(0, 3);

    const res = await runFal(falEndpoints.kontextMaxMulti, {
      prompt: sceneWithBoth(input.scene.setting, refs.length),
      image_urls: await Promise.all([input.selfie, ...refs].map(toDataUri)),
      aspect_ratio: input.scene.aspectRatio,
      seed: input.seed,
      num_images: 1,
      output_format: 'png',
      safety_tolerance: 2,
    });

    return done(res, started, pricing['fal-kontext-max-multi']);
  },
};

/**
 * Rota B — LoRA da figura treinada previamente.
 * Custo fixo de treino, mas a identidade da figura fica muito mais estavel e o
 * prompt para de depender de o modelo "conhecer" a pessoa.
 */
const routeB: RouteDefinition = {
  id: 'b-lora',
  label: 'LoRA da figura (fal)',
  requiredEnv: ['FAL_KEY', 'FIGURE_LORA_URL'],
  unitCostUsd: pricing['fal-flux-kontext-lora'],
  async generate(input) {
    const started = Date.now();

    const res = await runFal(falEndpoints.kontextLora, {
      prompt:
        `Create ${input.scene.setting}. ` +
        `The person on the left is the person from the input image. ` +
        `The person on the right is ${env.loraTrigger}. ` +
        IDENTITY_GUARD,
      image_url: await toDataUri(input.selfie),
      loras: [{ path: env.loraUrl, scale: env.loraScale }],
      aspect_ratio: input.scene.aspectRatio,
      seed: input.seed,
      num_images: 1,
      output_format: 'png',
      enable_safety_checker: true,
    });

    return done(res, started, pricing['fal-flux-kontext-lora']);
  },
};

/**
 * Rota C — placa pre-renderizada + insercao do rosto.
 * A cena com a figura ja existe como arquivo; o modelo so troca o rosto do
 * acompanhante. Mais previsivel e mais barata, ao custo de variedade.
 */
const routeC: RouteDefinition = {
  id: 'c-plate-faceswap',
  label: 'Cena pré-renderizada + inserção (fal)',
  requiredEnv: ['FAL_KEY'],
  unitCostUsd: pricing['fal-kontext-pro-multi'],
  async generate(input) {
    const started = Date.now();

    const plate = await loadPlate(input);
    if (!plate) return skipped(`placa ausente para a cena ${input.scene.id}`, started);

    const res = await runFal(falEndpoints.kontextProMulti, {
      prompt: FACE_INSERT_PROMPT,
      image_urls: await Promise.all([plate, input.selfie].map(toDataUri)),
      aspect_ratio: input.scene.aspectRatio,
      seed: input.seed,
      num_images: 1,
      output_format: 'png',
      safety_tolerance: 2,
    });

    return done(res, started, pricing['fal-kontext-pro-multi']);
  },
};

/**
 * Rota D — Seedream (ByteDance) via fal.
 * Mais barato e com reputacao melhor em preservacao de identidade. Politica de
 * conteudo diferente da BFL: pode aceitar o que a BFL recusa, ou o contrario.
 * E exatamente por isso que vale medir em vez de escolher no achismo.
 */
const routeD: RouteDefinition = {
  id: 'd-seedream',
  label: 'Seedream edit (fal)',
  requiredEnv: ['FAL_KEY'],
  unitCostUsd: pricing['fal-seedream-edit'],
  async generate(input) {
    const started = Date.now();
    const refs = input.references.slice(0, 3);

    const res = await runFal(falEndpoints.seedreamEdit, {
      prompt: sceneWithBoth(input.scene.setting, refs.length),
      image_urls: await Promise.all([input.selfie, ...refs].map(toDataUri)),
      image_size: aspectToSize(input.scene.aspectRatio),
      seed: input.seed,
      num_images: 1,
    });

    return done(res, started, pricing['fal-seedream-edit']);
  },
};

/**
 * Rota E — Nano Banana (Gemini 2.5 Flash Image) via fal.
 * Mesma forma da rota D: selfie + referencias da figura num unico edit. Aceita
 * ate 3:4/16:9 nativamente, entao nao precisa do mapa de presets do Seedream.
 *
 * Duas ressalvas ao ler o resultado:
 *  - a politica do Google e a mais restritiva das tres (BFL, ByteDance, Google)
 *    para pessoa publica real; e essa a hipotese que esta rota mede;
 *  - quando o Gemini recusa, o fal costuma devolver 200 com `images` vazio, que
 *    o runFal classifica como `error: resposta sem imagens`. Na leitura do
 *    relatorio, trate esse detalhe especifico como recusa, nao como falha tecnica.
 */
const routeE: RouteDefinition = {
  id: 'e-nano-banana',
  label: 'Nano Banana edit (fal)',
  requiredEnv: ['FAL_KEY'],
  unitCostUsd: pricing['fal-nano-banana-edit'],
  async generate(input) {
    const started = Date.now();
    const refs = input.references.slice(0, 3);

    const res = await runFal(falEndpoints.nanoBananaEdit, {
      prompt: sceneWithBoth(input.scene.setting, refs.length),
      image_urls: await Promise.all([input.selfie, ...refs].map(toDataUri)),
      aspect_ratio: input.scene.aspectRatio,
      seed: input.seed,
      num_images: 1,
      output_format: 'png',
      // String, nao numero — o schema do endpoint recusa inteiro aqui.
      safety_tolerance: '4',
    });

    return done(res, started, pricing['fal-nano-banana-edit']);
  },
};

/**
 * Rota F — Nano Banana Pro, so para medir o teto de resolucao.
 *
 * O Nano Banana comum devolve ~1MP fixo (864x1184 no 3:4). Com o rosto do
 * cliente ocupando ~150px de altura, nao ha pixel suficiente para carregar
 * identidade — e por isso que ele perdeu para o Seedream, que sai em 3072x4096.
 * O Pro aceita resolution=2K/4K e responde se o problema era so esse.
 *
 * NAO e candidata a producao como esta: US$0,139/imagem estoura o gate de
 * US$0,11. Se ganhar por muito, a conversa vira preco de venda; se ganhar por
 * pouco, a resposta e ficar no Seedream.
 */
const routeF: RouteDefinition = {
  id: 'f-nano-banana-pro',
  label: 'Nano Banana Pro edit 2K (fal)',
  requiredEnv: ['FAL_KEY'],
  unitCostUsd: pricing['fal-nano-banana-pro-edit'],
  async generate(input) {
    const started = Date.now();
    const refs = input.references.slice(0, 3);

    const res = await runFal(falEndpoints.nanoBananaProEdit, {
      prompt: sceneWithBoth(input.scene.setting, refs.length),
      image_urls: await Promise.all([input.selfie, ...refs].map(toDataUri)),
      aspect_ratio: input.scene.aspectRatio,
      seed: input.seed,
      num_images: 1,
      output_format: 'png',
      safety_tolerance: '4',
      // 2K e o ponto de equilibrio: ~4x o pixel do basico pelo mesmo preco do 1K.
      resolution: '2K',
    });

    return done(res, started, pricing['fal-nano-banana-pro-edit']);
  },
};

/**
 * Rota G — gpt-image-2 (OpenAI) servido pelo fal.
 *
 * Nao e BYOK: o fal fatura na FAL_KEY, entao nao precisa de conta OpenAI. Mas a
 * POLITICA continua sendo da OpenAI, que e a mais restritiva das quatro para
 * pessoa publica real. A hipotese que esta rota mede e binaria: passa ou recusa.
 * Se recusar, nao ha prompt que resolva — e limite de politica, nao de modelo.
 *
 * Duas particularidades contra o resto do harness:
 *  - nao aceita `seed`. As comparacoes com as outras rotas deixam de ser
 *    pareadas; para julgar esta rota, olhe mais de uma amostra.
 *  - cobra por token, com `quality` mexendo ~33x no custo. Ver GPT_IMAGE_QUALITY.
 */
const routeG: RouteDefinition = {
  id: 'g-gpt-image-2',
  label: `gpt-image-2 edit ${gptImageQuality} (fal)`,
  requiredEnv: ['FAL_KEY'],
  unitCostUsd: pricing[`fal-gpt-image-2-${gptImageQuality}`],
  async generate(input) {
    const started = Date.now();
    const refs = input.references.slice(0, 3);

    const res = await runFal(falEndpoints.gptImage2Edit, {
      prompt: sceneWithBoth(input.scene.setting, refs.length),
      image_urls: await Promise.all([input.selfie, ...refs].map(toDataUri)),
      image_size: aspectToSize(input.scene.aspectRatio),
      quality: gptImageQuality,
      num_images: 1,
      output_format: 'png',
    });

    return done(res, started, pricing[`fal-gpt-image-2-${gptImageQuality}`]);
  },
};

/**
 * Rota A rodando na BFL direta, para comparacao.
 * Fica desligada enquanto nao houver BFL_API_KEY. Serve para confirmar que o
 * resultado do fal representa o que voce teria indo direto — e a BFL e ~37%
 * mais barata por imagem quando valer a pena migrar.
 */
const routeAbfl: RouteDefinition = {
  id: 'a-kontext-multiref-bfl',
  label: 'Kontext multi-referência (BFL direto)',
  requiredEnv: ['BFL_API_KEY'],
  unitCostUsd: pricing['flux-kontext-max'],
  async generate(input) {
    const started = Date.now();
    const refs = input.references.slice(0, 3);

    const res = await bfl.generate({
      model: 'flux-kontext-max',
      prompt: sceneWithBoth(input.scene.setting, refs.length),
      images: [input.selfie, ...refs],
      aspectRatio: input.scene.aspectRatio,
      seed: input.seed,
    });

    return {
      outcome: res.outcome,
      image: res.image,
      detail: res.detail ?? '',
      latencyMs: Date.now() - started,
      costUsd: pricing['flux-kontext-max'],
    };
  },
};

function done(
  res: { outcome: GenerateResult['outcome']; image?: Buffer; detail?: string },
  started: number,
  costUsd: number,
): GenerateResult {
  return {
    outcome: res.outcome,
    image: res.image,
    detail: res.detail ?? '',
    latencyMs: Date.now() - started,
    costUsd,
  };
}

async function loadPlate(input: GenerateInput): Promise<Buffer | null> {
  if (!input.scene.plateFile) return null;
  try {
    return await fs.readFile(path.join(paths.plates, input.scene.plateFile));
  } catch {
    return null;
  }
}

/** Falta de insumo local nao e falha do modelo — nao pode contaminar a metrica. */
const skipped = (detail: string, started: number): GenerateResult => ({
  outcome: 'error',
  detail: `SKIP: ${detail}`,
  latencyMs: Date.now() - started,
  costUsd: 0,
});

/** O Seedream usa preset de tamanho em vez de proporcao. */
function aspectToSize(aspect: string): string {
  const map: Record<string, string> = {
    '1:1': 'square_hd',
    '3:4': 'portrait_4_3',
    '9:16': 'portrait_16_9',
    '4:3': 'landscape_4_3',
    '16:9': 'landscape_16_9',
  };
  return map[aspect] ?? 'square_hd';
}

export const routes: RouteDefinition[] = [routeA, routeB, routeC, routeD, routeE, routeF, routeG, routeAbfl];
