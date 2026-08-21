import sharp from 'sharp';
import type { GenerateRequest, GenerationOutcome, ProviderResult } from './types';

const QUEUE = 'https://queue.fal.run';
const ENDPOINT = 'fal-ai/bytedance/seedream/v4.5/edit';

/** Custo por imagem em centavos de USD. Confira em fal.ai/pricing. */
export const SEEDREAM_COST_USD_CENTS = 3;

/**
 * NAO ESTA LIGADO. O worker usa `gpt-image-2.ts` desde 2026-08-12, que mediu
 * melhor semelhanca por 1/6 do custo. Este arquivo fica de proposito: quem
 * decide a politica de uso do gpt-image-2 e a OpenAI, e uma mudanca la corta o
 * acesso sem aviso. O Seedream e ByteDance, politica independente — trocar o
 * import em worker/generation.ts devolve o produto ao ar.
 *
 * Se for usar: o prompt em lib/prompts.ts foi calibrado no gpt-image-2, e o
 * Seedream reagiu diferente a ele na Fase 0. Meca antes de confiar.
 */

/**
 * Seedream 4.5 edit, servido pelo fal.ai. Provedor escolhido na Fase 0.
 *
 * Por que ele e nao o FLUX Kontext, que era o plano original: na rodada de
 * 2026-08-11 o Kontext tirou 0/3 na avaliacao humana (nota 1 nas tres) e o
 * Seedream 2/3, com resolucao de 3072x4096 contra ~880x1200 e coerencia de
 * cena muito superior. Para um produto que vende "baixe em alta resolucao", a
 * diferenca de resolucao sozinha ja decidia.
 *
 * Custo: ~US$0,03 contra US$0,08 do Kontext max.
 */
export async function generate(req: GenerateRequest): Promise<ProviderResult> {
  const key = process.env.FAL_KEY;
  if (!key) return { outcome: 'error', detail: 'FAL_KEY ausente' };

  const auth = { authorization: `Key ${key}` };

  const submit = await fetch(`${QUEUE}/${ENDPOINT}`, {
    method: 'POST',
    headers: { ...auth, 'content-type': 'application/json' },
    body: JSON.stringify({
      prompt: req.prompt,
      image_urls: await Promise.all(req.images.map(toDataUri)),
      image_size: aspectToSize(req.aspectRatio),
      num_images: 1,
      ...(req.seed !== undefined ? { seed: req.seed } : {}),
    }),
  });

  if (!submit.ok) {
    const text = await submit.text();
    return { outcome: classify(submit.status, text), detail: `submit ${submit.status}: ${cut(text)}` };
  }

  const { request_id, status_url, response_url } = (await submit.json()) as {
    request_id: string;
    status_url: string;
    response_url: string;
  };

  // 120s: o Seedream mediu 44-63s na Fase 0, bem acima dos 15-17s do Kontext.
  // Um teto apertado transformaria uma geracao boa e lenta em pedido perdido.
  const deadline = Date.now() + (req.timeoutMs ?? 120_000);

  while (Date.now() < deadline) {
    await sleep(2_000);

    const poll = await fetch(status_url, { headers: auth });
    if (!poll.ok) {
      return { outcome: 'error', providerJobId: request_id, detail: `poll ${poll.status}` };
    }

    const { status } = (await poll.json()) as { status: string };
    if (status === 'IN_QUEUE' || status === 'IN_PROGRESS') continue;

    const res = await fetch(response_url, { headers: auth });
    if (!res.ok) {
      const text = await res.text();
      return {
        outcome: classify(res.status, text),
        providerJobId: request_id,
        detail: `result ${res.status}: ${cut(text)}`,
      };
    }

    const data = (await res.json()) as {
      images?: { url: string }[];
      has_nsfw_concepts?: boolean[];
    };

    if (data.has_nsfw_concepts?.some(Boolean)) {
      return { outcome: 'moderated', providerJobId: request_id, detail: 'safety checker do fal' };
    }

    const url = data.images?.[0]?.url;
    if (!url) return { outcome: 'error', providerJobId: request_id, detail: 'resposta sem imagens' };

    const img = await fetch(url);
    if (!img.ok) {
      return { outcome: 'error', providerJobId: request_id, detail: `download ${img.status}` };
    }

    return { outcome: 'ok', providerJobId: request_id, image: Buffer.from(await img.arrayBuffer()) };
  }

  return { outcome: 'timeout', providerJobId: request_id, detail: 'estourou o tempo de espera' };
}

/**
 * JPEG e nao PNG: base64 infla 33%, e quatro PNGs de 1536px passariam de 10MB
 * num unico request. O fal recusaria por tamanho e a falha seria lida como
 * problema do modelo.
 */
async function toDataUri(buf: Buffer): Promise<string> {
  const jpeg = await sharp(buf).jpeg({ quality: 90 }).toBuffer();
  return `data:image/jpeg;base64,${jpeg.toString('base64')}`;
}

const MODERATION_HINTS = /moderat|safety|nsfw|content polic|prohibit|blocked|flagged/i;

/**
 * Credencial invalida NAO e moderacao. Confundir os dois faria uma chave
 * expirada reembolsar as vendas do dia inteiro em vez de alertar.
 */
function classify(status: number, body: string): GenerationOutcome {
  if (status === 401 || status === 403) return 'error';
  if ((status === 400 || status === 422) && MODERATION_HINTS.test(body)) return 'moderated';
  return 'error';
}

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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const cut = (s: string, n = 300) => (s.length > n ? `${s.slice(0, n)}...` : s);
