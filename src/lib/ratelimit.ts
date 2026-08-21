import { redis } from './redis';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * Janela fixa por chave, no Redis.
 *
 * Existe para proteger o caixa, nao o servidor: cada upload aceito vira espaco
 * em disco e cada checkout vira uma chamada ao Mercado Pago. Um bot rodando a
 * noite inteira sem isto custa dinheiro de verdade.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const client = redis();
  const bucket = `rl:${key}:${Math.floor(Date.now() / 1000 / windowSeconds)}`;

  // INCR + EXPIRE num pipeline: duas viagens viram uma, e o TTL so e definido
  // na primeira ocorrencia da janela.
  const [[, count]] = (await client
    .multi()
    .incr(bucket)
    .expire(bucket, windowSeconds, 'NX')
    .exec()) as [[Error | null, number], unknown];

  return {
    allowed: count <= limit,
    remaining: Math.max(0, limit - count),
    retryAfterSeconds: windowSeconds,
  };
}

/**
 * IP do cliente atras do proxy.
 *
 * Pegamos o ULTIMO valor de x-forwarded-for, nao o primeiro. O proxy (Traefik,
 * no Coolify) APENDA o IP de quem conectou nele; tudo que vem antes foi
 * enviado pelo proprio cliente e e livremente forjavel.
 *
 * Usar o primeiro valor — o instinto natural, porque "o cliente e a origem da
 * cadeia" — deixaria qualquer bot furar o rate limit so mandando um
 * `x-forwarded-for` diferente a cada requisicao, que e exatamente o abuso que
 * este limite existe para impedir.
 *
 * Se um dia houver mais de um proxy na frente, este numero precisa mudar junto.
 */
const TRUSTED_PROXY_HOPS = 1;

export function clientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const chain = forwarded.split(',').map((s) => s.trim()).filter(Boolean);
    const ip = chain[chain.length - TRUSTED_PROXY_HOPS];
    if (ip) return ip;
  }
  // x-real-ip e escrito pelo proxy e sobrescreve o que o cliente mandou.
  return req.headers.get('x-real-ip') ?? 'desconhecido';
}

export function tooManyRequests(result: RateLimitResult): Response {
  return Response.json(
    { error: 'Muitas tentativas. Aguarde um instante e tente de novo.' },
    { status: 429, headers: { 'Retry-After': String(result.retryAfterSeconds) } },
  );
}
