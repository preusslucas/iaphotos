import { Redis } from 'ioredis';
import { env } from './env';

const globalForRedis = globalThis as unknown as { redis?: Redis };

/**
 * Conexao compartilhada para rate limit e para o BullMQ.
 *
 * `maxRetriesPerRequest: null` nao e opcional: o BullMQ usa comandos
 * bloqueantes (BRPOPLPUSH) que o ioredis mataria por timeout com o padrao,
 * derrubando o worker em toda fila ociosa.
 *
 * O memo no `globalThis` vale em TODOS os ambientes, e isso e o ponto.
 *
 * Ate 2026-08-22 a gravacao era `if (process.env.NODE_ENV !== 'production')`,
 * copiada do `prisma.ts`. La a guarda e inofensiva porque o cliente e uma
 * CONSTANTE de modulo — avaliada uma vez, e o global so existe para sobreviver
 * ao hot reload do desenvolvimento. Aqui o cliente e criado por uma FUNCAO, e o
 * global era o unico memo: sem ele, cada chamada de `redis()` abria uma conexao
 * nova e nunca fechada.
 *
 * O vazamento nao aparece em desenvolvimento, justamente onde a guarda deixava
 * o memo ligado. Em producao ele derrubou o deploy: o healthcheck do Coolify
 * chama `pingRedis()` a cada 10s e o rate limit chama a cada requisicao, ate o
 * Redis responder "ERR max number of clients reached" — e a partir dai o
 * /api/health devolve 503 e o orquestrador faz rollback de uma imagem que
 * estava perfeita.
 */
export function redis(): Redis {
  if (globalForRedis.redis) return globalForRedis.redis;

  const client = new Redis(env().REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });

  client.on('error', (err) => console.error('[redis]', err.message));

  globalForRedis.redis = client;
  return client;
}

export async function pingRedis(): Promise<void> {
  const pong = await redis().ping();
  if (pong !== 'PONG') throw new Error(`resposta inesperada do redis: ${pong}`);
}
