import sharp from 'sharp';
import type { GenerateRequest, GenerationOutcome, ProviderResult } from './types';

const QUEUE = 'https://queue.fal.run';
const ENDPOINT = 'fal-ai/gpt-image-2/edit';

/**
 * Qualidade fixa em `low`. Nao e economia cega: na Fase 0, `low` e `high`
 * sairam ambos em 768x1024 e a diferenca ficou na textura de pele, nao na
 * identidade — que e o que o cliente compra. `high` custa 33x e passa de 130s,
 * estourando o SLA de ~1 minuto prometido na landing.
 */
const QUALITY = 'low';

/**
 * Custo por imagem em centavos de USD.
 *
 * O custo real medido e ~US$0,005 (meio centavo). O campo no banco e Int em
 * centavos, entao arredondamos PARA CIMA: superestimar custo aperta a margem
 * exibida no /admin, subestimar a infla. Entre os dois erros, so um faz voce
 * descobrir tarde que o produto nao paga.
 */
export const GPT_IMAGE_2_COST_USD_CENTS = 1;

/**
 * gpt-image-2 (OpenAI) servido pelo fal.ai. Provedor escolhido na Fase 0,
 * rodada de 2026-08-12.
 *
 * Por que ele e nao o Seedream, que era o vencedor da rodada anterior: com o
 * mesmo prompt e a mesma selfie, o gpt-image-2 teve semelhanca melhor (12/15
 * notas >=4 contra 1/3 do Seedream na cena comum), custa 6x menos e responde
 * 4,5x mais rapido. Sai em 768x1024 contra 3072x4096 do Seedream — resolucao de
 * saida nao explica semelhanca; fidelidade da imagem de ENTRADA sim, e a OpenAI
 * processa toda entrada em alta fidelidade sem parametro para desligar.
 *
 * Duas diferencas que o worker precisa respeitar:
 *  - NAO aceita `seed`. Duas geracoes iguais dao imagens diferentes, entao nao
 *    da para reproduzir um caso especifico no suporte — so o providerJobId
 *    identifica uma geracao.
 *  - a politica de uso quem define e a OpenAI, nao o fal. O fal e revendedor;
 *    uma mudanca de politica la aparece aqui sem aviso.
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
      quality: QUALITY,
      num_images: 1,
      output_format: 'png',
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

  // 90s: a Fase 0 mediu p50 30s e maximo 43s em `low`. O dobro do pior caso
  // absorve fila do provedor sem segurar um worker por dois minutos.
  const deadline = Date.now() + (req.timeoutMs ?? 90_000);

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

    const data = (await res.json()) as { images?: { url: string }[] };

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

const MODERATION_HINTS =
  /moderat|safety|nsfw|content polic|prohibit|blocked|flagged|rejected by/i;

/**
 * Credencial invalida NAO e moderacao. Confundir os dois faria uma chave
 * expirada reembolsar as vendas do dia inteiro em vez de alertar.
 */
function classify(status: number, body: string): GenerationOutcome {
  if (status === 401 || status === 403) return 'error';
  if ((status === 400 || status === 422) && MODERATION_HINTS.test(body)) return 'moderated';
  return 'error';
}

/** O endpoint usa preset de tamanho, nao proporcao livre. */
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
