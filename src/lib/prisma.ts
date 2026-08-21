import { PrismaClient } from '@prisma/client';
import { env } from './env';

/**
 * Em dev o hot reload recria o modulo a cada edicao; sem o cache no globalThis
 * o Postgres acumula conexoes ate recusar novas.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

/** Usado pelo /api/health — uma query barata que prova que o banco responde. */
export async function pingDatabase(): Promise<void> {
  env(); // falha cedo e com mensagem clara se DATABASE_URL estiver ausente
  await prisma.$queryRaw`SELECT 1`;
}
