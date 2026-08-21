import { env, GENERATION_TIMEOUT_MS } from '../config.js';
import type { Outcome } from '../types.js';

const BASE = 'https://api.bfl.ai/v1';

export type KontextModel = 'flux-kontext-pro' | 'flux-kontext-max';

export interface KontextRequest {
  model: KontextModel;
  prompt: string;
  /** Imagem principal de edicao. As demais entram como input_image_2..4. */
  images: Buffer[];
  aspectRatio: string;
  seed: number;
}

export interface KontextResponse {
  outcome: Outcome;
  image?: Buffer;
  detail?: string;
}

/** Status terminais da BFL que significam "a politica recusou este conteudo". */
const MODERATED = new Set(['Request Moderated', 'Content Moderated']);

export async function generate(req: KontextRequest): Promise<KontextResponse> {
  if (req.images.length === 0) {
    return { outcome: 'error', detail: 'nenhuma imagem de entrada' };
  }
  if (req.images.length > 4) {
    return { outcome: 'error', detail: 'FLUX Kontext aceita no maximo 4 imagens' };
  }

  const body: Record<string, unknown> = {
    prompt: req.prompt,
    input_image: req.images[0]!.toString('base64'),
    aspect_ratio: req.aspectRatio,
    seed: req.seed,
    output_format: 'png',
    // 0 = mais restritivo, 6 = mais permissivo. 2 é o teto quando há imagem de
    // entrada; pedir mais que isso faz a API rejeitar o request inteiro.
    safety_tolerance: 2,
    prompt_upsampling: false,
  };
  req.images.slice(1).forEach((img, i) => {
    body[`input_image_${i + 2}`] = img.toString('base64');
  });

  const submit = await fetch(`${BASE}/${req.model}`, {
    method: 'POST',
    headers: { 'x-key': env.bflKey, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!submit.ok) {
    const text = await submit.text();
    return {
      outcome: classifySubmitFailure(submit.status, text),
      detail: `submit ${submit.status}: ${truncate(text)}`,
    };
  }

  const { id, polling_url } = (await submit.json()) as { id: string; polling_url?: string };
  const pollUrl = polling_url ?? `${BASE}/get_result?id=${id}`;

  const deadline = Date.now() + GENERATION_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(1500);

    const poll = await fetch(pollUrl, { headers: { 'x-key': env.bflKey } });
    if (!poll.ok) {
      return { outcome: 'error', detail: `poll ${poll.status}: ${truncate(await poll.text())}` };
    }

    const data = (await poll.json()) as {
      status: string;
      result?: { sample?: string };
      details?: unknown;
    };

    if (data.status === 'Pending' || data.status === 'Processing') continue;

    if (MODERATED.has(data.status)) {
      return { outcome: 'moderated', detail: data.status };
    }
    if (data.status !== 'Ready') {
      return { outcome: 'error', detail: `${data.status}: ${truncate(JSON.stringify(data.details))}` };
    }

    const sample = data.result?.sample;
    if (!sample) return { outcome: 'error', detail: 'Ready sem result.sample' };

    const img = await fetch(sample);
    if (!img.ok) return { outcome: 'error', detail: `download ${img.status}` };
    return { outcome: 'ok', image: Buffer.from(await img.arrayBuffer()) };
  }

  return { outcome: 'timeout', detail: `sem resposta em ${GENERATION_TIMEOUT_MS}ms` };
}

/** Sinais de que o 422 foi o filtro de conteudo, e nao a requisicao malformada. */
const MODERATION_HINTS = /moderat|safety|nsfw|content polic|prohibit|blocked/i;

/**
 * A taxa de moderacao e A metrica desta fase — e a que decide se o produto
 * existe. Contar "chave invalida" ou "body malformado" como moderacao faria o
 * spike condenar uma rota que na verdade funciona. Na duvida, `error`.
 */
function classifySubmitFailure(status: number, body: string): Outcome {
  if (status === 401 || status === 403) return 'error';
  if (status === 422 && MODERATION_HINTS.test(body)) return 'moderated';
  return 'error';
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const truncate = (s: string, n = 300) => (s.length > n ? `${s.slice(0, n)}...` : s);
