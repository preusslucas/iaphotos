import { Redis } from 'ioredis';
import { env } from './env';

const globalForRedis = globalThis as unknown as { redis?: Redis };

/**
 * Conexao compartilhada para rate limit e para o BullMQ.
 *
 * `maxRetriesPerRequest: null` nao e opcional: o BullMQ usa comandos
 * bloqueantes (BRPOPLPUSH) que o ioredis mataria por timeout com o padrao,
 * derrubando o worker em toda fila ociosa.
 */
export function redis(): Redis {
  if (globalForRedis.redis) return globalForRedis.redis;

  const client = new Redis(env().REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });

  client.on('error', (err) => console.error('[redis]', err.message));

  if (process.env.NODE_ENV !== 'production') globalForRedis.redis = client;
  return client;
}

export async function pingRedis(): Promise<void> {
  const pong = await redis().ping();
  if (pong !== 'PONG') throw new Error(`resposta inesperada do redis: ${pong}`);
}
