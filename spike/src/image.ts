import sharp from 'sharp';

/**
 * Normaliza a selfie antes de mandar para a API. Isto nao e cosmetico: EXIF de
 * orientacao faz o modelo gerar a pessoa deitada, e arquivos de 12MP so gastam
 * banda e tempo sem melhorar o resultado.
 *
 * `.rotate()` sem argumento aplica a orientacao do EXIF e depois a descarta,
 * que e exatamente o que queremos — inclusive para nao vazar GPS do usuario.
 */
export async function normalizeSelfie(buf: Buffer, maxSide = 1536): Promise<Buffer> {
  return sharp(buf)
    .rotate()
    .resize({ width: maxSide, height: maxSide, fit: 'inside', withoutEnlargement: true })
    .toColorspace('srgb')
    .png()
    .toBuffer();
}

export interface ImageFacts {
  width: number;
  height: number;
  format: string;
}

export async function inspect(buf: Buffer): Promise<ImageFacts> {
  const m = await sharp(buf).metadata();
  return { width: m.width ?? 0, height: m.height ?? 0, format: m.format ?? 'unknown' };
}

/** Mesma regra que o produto vai aplicar no upload — validada aqui primeiro. */
export function validateSelfie(facts: ImageFacts, bytes: number): string | null {
  if (!['jpeg', 'jpg', 'png', 'webp'].includes(facts.format)) {
    return `formato nao suportado: ${facts.format}`;
  }
  if (Math.min(facts.width, facts.height) < 512) {
    return `resolucao baixa: ${facts.width}x${facts.height} (minimo 512 no menor lado)`;
  }
  if (bytes > 10 * 1024 * 1024) {
    return `arquivo grande demais: ${(bytes / 1024 / 1024).toFixed(1)}MB`;
  }
  return null;
}
