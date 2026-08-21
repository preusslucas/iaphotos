import sharp from 'sharp';
import { env, GENERATION_TIMEOUT_MS } from '../config.js';
import type { Outcome } from '../types.js';

const QUEUE = 'https://queue.fal.run';

/**
 * Cliente generico da fila do fal.ai.
 *
 * O fal e revendedor oficial dos FLUX Kontext fechados da BFL, entao a politica
 * de conteudo que voce encontra aqui e, na pratica, a mesma da BFL — que e
 * exatamente o que a Fase 0 precisa medir. A vantagem e nao ter deposito
 * minimo: da para responder o "vai ou nao vai" com o credito que ja existe.
 */
export interface FalResult {
  outcome: Outcome;
  image?: Buffer;
  providerJobId?: string;
  detail?: string;
}

export async function runFal(
  endpoint: string,
  input: Record<string, unknown>,
): Promise<FalResult> {
  const auth = { authorization: `Key ${env.falKey}` };

  const submit = await fetch(`${QUEUE}/${endpoint}`, {
    method: 'POST',
    headers: { ...auth, 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!submit.ok) {
    const text = await submit.text();
    return {
      outcome: classifyFailure(submit.status, text),
      detail: `submit ${submit.status}: ${truncate(text)}`,
    };
  }

  const { request_id, status_url, response_url } = (await submit.json()) as {
    request_id: string;
    status_url: string;
    response_url: string;
  };

  const deadline = Date.now() + GENERATION_TIMEOUT_MS;

  while (Date.now() < deadline) {
    await sleep(1_500);

    const poll = await fetch(status_url, { headers: auth });
    if (!poll.ok) {
      return {
        outcome: 'error',
        providerJobId: request_id,
        detail: `poll ${poll.status}: ${truncate(await poll.text())}`,
      };
    }

    const { status } = (await poll.json()) as { status: string };
    if (status === 'IN_QUEUE' || status === 'IN_PROGRESS') continue;

    const res = await fetch(response_url, { headers: auth });
    if (!res.ok) {
      const text = await res.text();
      return {
        outcome: classifyFailure(res.status, text),
        providerJobId: request_id,
        detail: `result ${res.status}: ${truncate(text)}`,
      };
    }

    const data = (await res.json()) as {
      images?: { url: string }[];
      has_nsfw_concepts?: boolean[];
    };

    // O safety checker do fal devolve 200 com a imagem zerada em vez de erro.
    if (data.has_nsfw_concepts?.some(Boolean)) {
      return {
        outcome: 'moderated',
        providerJobId: request_id,
        detail: 'safety checker do fal marcou o conteudo',
      };
    }

    const url = data.images?.[0]?.url;
    if (!url) {
      return { outcome: 'error', providerJobId: request_id, detail: 'resposta sem imagens' };
    }

    const img = await fetch(url);
    if (!img.ok) {
      return { outcome: 'error', providerJobId: request_id, detail: `download ${img.status}` };
    }

    return { outcome: 'ok', providerJobId: request_id, image: Buffer.from(await img.arrayBuffer()) };
  }

  return { outcome: 'timeout', detail: `sem resposta em ${GENERATION_TIMEOUT_MS}ms` };
}

/**
 * Converte o buffer em data URI JPEG para mandar no corpo do request.
 *
 * JPEG e nao PNG de proposito: base64 infla 33%, e quatro PNGs de 1536px
 * passariam de 10MB num unico request — o suficiente para o fal recusar por
 * tamanho e a falha ser lida como problema do modelo. Em qualidade 90 a perda e
 * irrelevante para julgar semelhanca.
 */
export async function toDataUri(buf: Buffer): Promise<string> {
  const jpeg = await sharp(buf).jpeg({ quality: 90 }).toBuffer();
  return `data:image/jpeg;base64,${jpeg.toString('base64')}`;
}

/**
 * Mesma logica da BFL: contar problema de credencial ou payload como moderacao
 * faria o spike condenar uma rota que na verdade funciona. Na duvida, `error`.
 */
const MODERATION_HINTS = /moderat|safety|nsfw|content polic|prohibit|blocked|flagged/i;

function classifyFailure(status: number, body: string): Outcome {
  if (status === 401 || status === 403) return 'error';
  if ((status === 422 || status === 400) && MODERATION_HINTS.test(body)) return 'moderated';
  return 'error';
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const truncate = (s: string, n = 300) => (s.length > n ? `${s.slice(0, n)}...` : s);
