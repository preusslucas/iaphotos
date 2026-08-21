/**
 * Gera imagens de exemplo PROVISORIAS para as cenas do catalogo, para que o
 * funil renderize antes de a Fase 0 produzir as reais.
 *
 * Substitua por saidas de verdade do spike antes de ligar qualquer trafego:
 * a foto de exemplo e o que vende, e um placeholder no ar e uma promessa que
 * o produto nao cumpre.
 *
 *   node scripts/make-placeholder-samples.mjs
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'public', 'samples', 'patriota');

// Deve espelhar as cenas de src/content/figures/patriota.ts.
const scenes = [
  { id: 'selfie-rua', label: 'Selfie na rua', w: 720, h: 960 },
  { id: 'comicio', label: 'Comício com bandeiras', w: 1280, h: 720 },
  { id: 'moto', label: 'Motociata', w: 1280, h: 720 },
  { id: 'estadio', label: 'No estádio', w: 1280, h: 720 },
  { id: 'feira', label: 'Na feira', w: 720, h: 960 },
];

await fs.mkdir(outDir, { recursive: true });

for (const scene of scenes) {
  const svg = `<svg width="${scene.w}" height="${scene.h}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="#1b212a"/>
    <text x="50%" y="46%" text-anchor="middle" font-family="sans-serif"
          font-size="${Math.round(scene.w / 18)}" fill="#98a2b3">${scene.label}</text>
    <text x="50%" y="56%" text-anchor="middle" font-family="sans-serif"
          font-size="${Math.round(scene.w / 30)}" fill="#5b6472">exemplo provisório</text>
  </svg>`;

  const file = path.join(outDir, `${scene.id}.webp`);
  await sharp(Buffer.from(svg)).webp({ quality: 80 }).toFile(file);
  console.log(`gerado ${path.relative(root, file)}`);
}
