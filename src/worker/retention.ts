import { env } from '@/lib/env';
import { prisma } from '@/lib/prisma';
import { removeObject } from '@/lib/storage';

/**
 * Apaga o que passou do prazo de retencao.
 *
 * A selfie e o dado mais sensivel que este produto toca — imagem de rosto, que
 * a LGPD trata com rigor. Guardar "por precaucao" e so aumentar o estrago de um
 * vazamento futuro, e o prazo que prometemos na tela de consentimento so vale
 * alguma coisa se algo de fato apagar.
 */
export async function runRetention(): Promise<{ removed: number; failed: number }> {
  const now = new Date();

  const expired = await prisma.asset.findMany({
    where: { expiresAt: { lt: now } },
    take: 500, // lotes: uma limpeza atrasada nao pode virar um pico de I/O
  });

  let removed = 0;
  let failed = 0;

  for (const asset of expired) {
    try {
      await removeObject(asset.objectKey);
    } catch (err) {
      // Objeto ausente no storage e o resultado desejado. Seguimos para apagar
      // a linha e nao ficar reprocessando o mesmo registro para sempre.
      console.warn(`[retention] ${asset.objectKey} não removido:`, err);
      failed++;
    }
    await prisma.asset.delete({ where: { id: asset.id } });
    removed++;
  }

  if (removed) {
    console.log(`[retention] ${removed} objetos expirados removidos (${failed} com aviso)`);
  }
  return { removed, failed };
}

/** Prazo de vida de cada tipo de arquivo, em dias. */
export function retentionDays() {
  const cfg = env();
  return { selfie: cfg.SELFIE_RETENTION_DAYS, result: cfg.RESULT_RETENTION_DAYS };
}

/**
 * Exclusao a pedido do titular (LGPD art. 18). Apaga TUDO do pedido — inclusive
 * o resultado — mantendo apenas a linha do pedido, necessaria para a
 * contabilidade da venda.
 */
export async function eraseOrderData(orderId: string): Promise<number> {
  const assets = await prisma.asset.findMany({ where: { orderId } });

  for (const asset of assets) {
    await removeObject(asset.objectKey).catch((err) =>
      console.warn(`[retention] ${asset.objectKey}:`, err),
    );
  }

  await prisma.asset.deleteMany({ where: { orderId } });
  return assets.length;
}
