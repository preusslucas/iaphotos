/**
 * Gera selfies sinteticas em inputs/selfies para exercitar o harness com
 * --dry-run. Nao servem para avaliar semelhanca — sao retangulos coloridos.
 * A ultima e pequena de proposito, para verificar que a validacao rejeita.
 *
 *   node scripts/make-fake-selfies.mjs
 */
import sharp from 'sharp';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'inputs', 'selfies');

for (let i = 1; i <= 4; i++) {
  await sharp({
    create: { width: 800, height: 1000, channels: 3, background: { r: (40 * i) % 255, g: 90, b: 160 } },
  })
    .jpeg()
    .toFile(path.join(dir, `fake-${i}.jpg`));
}

await sharp({ create: { width: 200, height: 200, channels: 3, background: { r: 10, g: 10, b: 10 } } })
  .jpeg()
  .toFile(path.join(dir, 'fake-small.jpg'));

console.log(`5 selfies sinteticas em ${dir} (1 devera ser rejeitada na validacao)`);
