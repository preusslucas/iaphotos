import fs from 'node:fs/promises';
import path from 'node:path';
import { paths } from './config.js';
import { statsByRoute, summarize } from './summary.js';
import type { TrialRecord } from './types.js';

/**
 * Le a rodada mais recente (ou a passada em --run=<id>) e produz review.html:
 * uma grade selfie-original vs. resultado, com botoes de nota 1-5 que salvam em
 * localStorage e exportam scores.csv. A semelhanca percebida e a unica metrica
 * da Fase 0 que exige olho humano — o resto o summary ja calcula.
 */
async function latestRun(): Promise<string> {
  const entries = await fs.readdir(paths.out, { withFileTypes: true });
  const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
  const last = dirs.at(-1);
  if (!last) throw new Error(`nenhuma rodada em ${paths.out}. Rode "pnpm run run" primeiro.`);
  return last;
}

async function main() {
  const arg = process.argv.slice(2).find((a) => a.startsWith('--run='))?.split('=')[1];
  const runId = arg ?? (await latestRun());
  const runDir = path.join(paths.out, runId);

  const records = JSON.parse(
    await fs.readFile(path.join(runDir, 'trials.json'), 'utf8'),
  ) as TrialRecord[];

  console.log(summarize(records));

  const ok = records.filter((r) => r.outcome === 'ok' && r.outputFile);
  const html = renderReview(runId, ok, statsByRoute(records));
  const target = path.join(runDir, 'review.html');
  await fs.writeFile(target, html);

  console.log(`\nAbra para pontuar: ${target}`);
}

function renderReview(
  runId: string,
  records: TrialRecord[],
  stats: ReturnType<typeof statsByRoute>,
): string {
  // As selfies ficam fora de runDir; caminho relativo a partir do review.html.
  const selfieRel = path.relative(path.join(paths.out, runId), paths.selfies).replace(/\\/g, '/');

  const cards = records
    .map((r) => {
      const src = r.outputFile.replace(/\\/g, '/');
      // O repeat entra na chave: sem ele, duas repeticoes do mesmo job dividiriam
      // a mesma nota e a pontuacao viraria a da ultima imagem clicada.
      const key = `${r.route}|${r.prompt}|${r.scene}|${r.selfie}|${r.repeat}`;
      return `
      <figure class="card" data-key="${esc(key)}">
        <div class="pair">
          <img loading="lazy" src="${esc(selfieRel)}/${esc(r.selfie)}" alt="selfie original">
          <img loading="lazy" src="${esc(src)}" alt="resultado gerado">
        </div>
        <figcaption>
          <span class="tag">${esc(r.route)}</span>
          <span class="tag">${esc(r.prompt)}</span>
          <span class="tag">${esc(r.scene)}</span>
          <span class="muted">${(r.latencyMs / 1000).toFixed(1)}s</span>
        </figcaption>
        <div class="score" role="group" aria-label="nota de semelhança">
          ${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-score="${n}">${n}</button>`).join('')}
        </div>
      </figure>`;
    })
    .join('\n');

  const statRows = stats
    .map(
      (s) => `<tr>
        <td>${esc(s.route)}</td>
        <td>${s.ok}/${s.total}</td>
        <td>${(s.successRate * 100).toFixed(0)}%</td>
        <td>${s.moderated}</td>
        <td>${(s.p95Ms / 1000).toFixed(1)}s</td>
        <td>US$${s.costPerOkUsd.toFixed(3)}</td>
        <td class="${s.passes ? 'pass' : 'fail'}">${s.passes ? 'passou' : 'reprovou'}</td>
      </tr>`,
    )
    .join('\n');

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Fase 0 — revisão ${esc(runId)}</title>
<style>
  :root { color-scheme: light dark; --bg:#0f1115; --fg:#e8eaed; --muted:#9aa0a6; --card:#181b21; --line:#2a2f38; --pass:#34d399; --fail:#f87171; }
  body { margin:0; padding:24px; background:var(--bg); color:var(--fg); font:15px/1.5 ui-sans-serif,system-ui,sans-serif; }
  h1 { font-size:20px; margin:0 0 4px; }
  .muted { color:var(--muted); }
  table { border-collapse:collapse; margin:16px 0 28px; font-size:14px; }
  th,td { padding:6px 12px; border-bottom:1px solid var(--line); text-align:left; }
  .pass { color:var(--pass); } .fail { color:var(--fail); }
  .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(340px,1fr)); gap:16px; }
  .card { margin:0; background:var(--card); border:1px solid var(--line); border-radius:10px; padding:10px; }
  .card.scored { outline:1px solid var(--pass); }
  .pair { display:grid; grid-template-columns:80px 1fr; gap:8px; align-items:start; }
  .pair img { width:100%; border-radius:6px; display:block; background:#000; }
  figcaption { display:flex; gap:6px; align-items:center; flex-wrap:wrap; margin:8px 0 6px; font-size:12px; }
  .tag { background:#232833; border-radius:4px; padding:1px 6px; }
  .score { display:flex; gap:4px; }
  .score button { flex:1; padding:4px; background:#232833; color:var(--fg); border:1px solid var(--line); border-radius:5px; cursor:pointer; }
  .score button[aria-pressed="true"] { background:var(--pass); color:#0f1115; font-weight:600; }
  .bar { position:sticky; top:0; background:var(--bg); padding:8px 0 12px; z-index:1; display:flex; gap:12px; align-items:center; }
  .bar button { padding:6px 12px; border-radius:6px; border:1px solid var(--line); background:#232833; color:var(--fg); cursor:pointer; }
</style>
</head>
<body>
<h1>Fase 0 — revisão de semelhança</h1>
<p class="muted">Rodada <code>${esc(runId)}</code> · ${records.length} imagens aproveitadas.
Nota 1 = não parece a pessoa · 5 = passaria por foto real. Meta: ≥70% com nota ≥ 4.</p>

<table>
  <thead><tr><th>rota</th><th>ok</th><th>sucesso</th><th>moderado</th><th>p95</th><th>custo/ok</th><th>portão</th></tr></thead>
  <tbody>${statRows}</tbody>
</table>

<div class="bar">
  <strong id="progress">0 / ${records.length} pontuadas</strong>
  <span class="muted" id="verdict"></span>
  <button id="export">Exportar scores.csv</button>
</div>

<div class="grid">${cards}</div>

<script>
const STORE = 'fase0:${runId}';
const scores = JSON.parse(localStorage.getItem(STORE) || '{}');
const total = ${records.length};

function paint() {
  for (const card of document.querySelectorAll('.card')) {
    const value = scores[card.dataset.key];
    card.classList.toggle('scored', value != null);
    for (const b of card.querySelectorAll('.score button')) {
      b.setAttribute('aria-pressed', String(Number(b.dataset.score) === value));
    }
  }
  const values = Object.values(scores);
  const good = values.filter(v => v >= 4).length;
  document.getElementById('progress').textContent = values.length + ' / ' + total + ' pontuadas';
  document.getElementById('verdict').textContent = values.length
    ? good + ' com nota >= 4 (' + Math.round(good / values.length * 100) + '% das pontuadas)'
    : '';
}

document.addEventListener('click', (e) => {
  const btn = e.target.closest('.score button');
  if (!btn) return;
  const key = btn.closest('.card').dataset.key;
  const value = Number(btn.dataset.score);
  if (scores[key] === value) delete scores[key]; else scores[key] = value;
  localStorage.setItem(STORE, JSON.stringify(scores));
  paint();
});

document.getElementById('export').addEventListener('click', () => {
  const rows = [['route','prompt','scene','selfie','repeat','score']];
  for (const [key, value] of Object.entries(scores)) rows.push([...key.split('|'), value]);
  const csv = rows.map(r => r.map(c => '"' + String(c).replace(/"/g,'""') + '"').join(',')).join('\\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = 'scores.csv';
  a.click();
});

paint();
</script>
</body>
</html>`;
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
