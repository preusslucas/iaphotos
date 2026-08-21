import { gate } from './config.js';
import type { TrialRecord } from './types.js';

export interface RouteStats {
  route: string;
  total: number;
  ok: number;
  moderated: number;
  errors: number;
  timeouts: number;
  successRate: number;
  p50Ms: number;
  p95Ms: number;
  costUsd: number;
  costPerOkUsd: number;
  passes: boolean;
}

/** Falta de insumo local foi marcada com SKIP em routes.ts e nao entra na conta. */
const counted = (r: TrialRecord) => !r.detail.startsWith('SKIP:');

export function statsByRoute(records: TrialRecord[]): RouteStats[] {
  const byRoute = new Map<string, TrialRecord[]>();
  for (const r of records.filter(counted)) {
    const list = byRoute.get(r.route) ?? [];
    list.push(r);
    byRoute.set(r.route, list);
  }

  return [...byRoute.entries()].map(([route, list]) => {
    const ok = list.filter((r) => r.outcome === 'ok');
    const successRate = list.length ? ok.length / list.length : 0;
    const costUsd = list.reduce((sum, r) => sum + r.costUsd, 0);
    const p95Ms = percentile(ok.map((r) => r.latencyMs), 95);
    const costPerOkUsd = ok.length ? costUsd / ok.length : Infinity;

    return {
      route,
      total: list.length,
      ok: ok.length,
      moderated: list.filter((r) => r.outcome === 'moderated').length,
      errors: list.filter((r) => r.outcome === 'error').length,
      timeouts: list.filter((r) => r.outcome === 'timeout').length,
      successRate,
      p50Ms: percentile(ok.map((r) => r.latencyMs), 50),
      p95Ms,
      costUsd,
      costPerOkUsd,
      passes:
        successRate >= gate.minSuccessRate &&
        p95Ms <= gate.maxP95Ms &&
        costPerOkUsd <= gate.maxCostUsd,
    };
  });
}

export function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)]!;
}

/** Aproveitamento por variante de prompt — a comparacao que guia a iteracao. */
export function statsByPrompt(records: TrialRecord[]) {
  const byPrompt = new Map<string, TrialRecord[]>();
  for (const r of records.filter(counted)) {
    const list = byPrompt.get(r.prompt) ?? [];
    list.push(r);
    byPrompt.set(r.prompt, list);
  }
  return [...byPrompt.entries()].map(([prompt, list]) => ({
    prompt,
    total: list.length,
    ok: list.filter((r) => r.outcome === 'ok').length,
    p95Ms: percentile(list.filter((r) => r.outcome === 'ok').map((r) => r.latencyMs), 95),
  }));
}

export function summarize(records: TrialRecord[]): string {
  const stats = statsByRoute(records);
  if (!stats.length) return '\nNenhum resultado computavel.';

  const lines = [
    '',
    '='.repeat(78),
    'RESULTADO DA FASE 0 — criterio automatico',
    `(sucesso >= ${(gate.minSuccessRate * 100).toFixed(0)}% | p95 <= ${gate.maxP95Ms / 1000}s | custo/ok <= US$${gate.maxCostUsd})`,
    '='.repeat(78),
  ];

  for (const s of stats) {
    lines.push(
      '',
      `${s.passes ? 'PASSOU' : 'REPROVOU'}  ${s.route}`,
      `  sucesso      ${s.ok}/${s.total} (${(s.successRate * 100).toFixed(0)}%)`,
      `  moderado     ${s.moderated}   erro ${s.errors}   timeout ${s.timeouts}`,
      `  latencia     p50 ${(s.p50Ms / 1000).toFixed(1)}s   p95 ${(s.p95Ms / 1000).toFixed(1)}s`,
      `  custo        US$${s.costUsd.toFixed(2)} total   US$${s.costPerOkUsd.toFixed(3)}/imagem aproveitada`,
    );
  }

  const prompts = statsByPrompt(records);
  if (prompts.length > 1) {
    lines.push('', 'POR VARIANTE DE PROMPT');
    for (const p of prompts) {
      lines.push(`  ${p.prompt.padEnd(14)} ${p.ok}/${p.total} tecnicamente ok`);
    }
  }

  lines.push(
    '',
    '-'.repeat(78),
    'Este criterio e apenas o piso mecanico. A semelhanca percebida e humana:',
    'abra o review.html, pontue de 1 a 5 e so considere aprovada a rota que',
    'tambem tiver >=70% das imagens com nota >= 4.',
    '-'.repeat(78),
  );

  return lines.join('\n');
}
