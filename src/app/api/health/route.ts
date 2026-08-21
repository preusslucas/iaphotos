import { pingDatabase } from '@/lib/prisma';
import { pingRedis } from '@/lib/redis';
import { pingStorage } from '@/lib/storage';

/**
 * Healthcheck consumido pelo Coolify. Checa as tres dependencias de verdade:
 * um container que responde 200 sem conseguir falar com o Postgres so serve
 * para esconder um deploy quebrado atras de um semaforo verde.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  const checks = await Promise.all([
    check('database', pingDatabase),
    check('redis', pingRedis),
    check('storage', pingStorage),
  ]);

  const healthy = checks.every((c) => c.ok);

  return Response.json(
    { status: healthy ? 'ok' : 'degraded', checks },
    { status: healthy ? 200 : 503 },
  );
}

/**
 * Um healthcheck que trava é pior que um que falha: os clientes destas
 * dependências reconectam sozinhos e ficam enfileirando o comando em silêncio,
 * então a requisição nunca retorna e o orquestrador espera até o timeout DELE
 * para descobrir o óbvio. O teto de 3s transforma "pendurado" em "degradado".
 */
const CHECK_TIMEOUT_MS = 3_000;

async function check(name: string, fn: () => Promise<unknown>) {
  const started = Date.now();
  try {
    await Promise.race([fn(), rejectAfter(CHECK_TIMEOUT_MS)]);
    return { name, ok: true, ms: Date.now() - started };
  } catch (err) {
    return {
      name,
      ok: false,
      ms: Date.now() - started,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function rejectAfter(ms: number): Promise<never> {
  return new Promise((_, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout apos ${ms}ms`)), ms);
    // Não segura o processo vivo se for a última coisa pendente.
    timer.unref?.();
  });
}
