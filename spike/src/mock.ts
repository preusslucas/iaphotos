import sharp from 'sharp';
import type { GenerateInput, RouteDefinition } from './types.js';

/**
 * Envolve uma rota real num dublê que nao chama API nenhuma. Serve para validar
 * o harness (validacao de selfie, pool, CSV, review.html) antes de gastar
 * credito — e para reproduzir bugs de relatorio sem pagar por isso.
 *
 * Simula moderacao e erro numa fracao dos casos justamente para que os caminhos
 * de falha do relatorio sejam exercitados.
 */
export function mockRoute(route: RouteDefinition): RouteDefinition {
  let seq = 0;

  return {
    ...route,
    requiredEnv: [],
    unitCostUsd: 0,
    async generate(input: GenerateInput) {
      const started = Date.now();
      const n = seq++;
      await sleep(120 + (n % 5) * 60);

      if (n % 11 === 3) {
        return {
          outcome: 'moderated' as const,
          detail: 'DRY-RUN: moderacao simulada',
          latencyMs: Date.now() - started,
          costUsd: 0,
        };
      }
      if (n % 17 === 5) {
        return {
          outcome: 'error' as const,
          detail: 'DRY-RUN: erro simulado',
          latencyMs: Date.now() - started,
          costUsd: 0,
        };
      }

      const [w, h] = dims(input.scene.aspectRatio);
      const image = await sharp({
        create: { width: w, height: h, channels: 3, background: { r: 32, g: 36, b: 46 } },
      })
        .composite([
          {
            input: await sharp(input.selfie)
              .resize({ width: Math.round(w / 2), height: h, fit: 'cover' })
              .toBuffer(),
            left: 0,
            top: 0,
          },
        ])
        .png()
        .toBuffer();

      return {
        outcome: 'ok' as const,
        image,
        detail: 'DRY-RUN',
        latencyMs: Date.now() - started,
        costUsd: 0,
      };
    },
  };
}

function dims(aspect: string): [number, number] {
  const [a, b] = aspect.split(':').map(Number);
  const base = 768;
  return a! >= b!
    ? [base, Math.round((base * b!) / a!)]
    : [Math.round((base * a!) / b!), base];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
