import fs from 'node:fs/promises';
import path from 'node:path';
import { paths } from './config.js';
import { inspect, normalizeSelfie, validateSelfie } from './image.js';
import { mockRoute } from './mock.js';
import { PROMPT_VARIANTS, defaultVariantId, setPromptVariant } from './prompts.js';
import { routes } from './routes.js';
import { scenes } from './scenes.js';
import { summarize } from './summary.js';
import type { RouteDefinition, Scene, TrialRecord } from './types.js';

const IMAGE_EXT = /\.(jpe?g|png|webp)$/i;

interface Args {
  routes: string[];
  scenes: string[];
  limit: number;
  seed: number;
  concurrency: number;
  dryRun: boolean;
  prompt: string;
  repeat: number;
}

function parseArgs(argv: string[]): Args {
  const get = (name: string) =>
    argv.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');

  return {
    routes: get('routes')?.split(',').filter(Boolean) ?? [],
    scenes: get('scenes')?.split(',').filter(Boolean) ?? [],
    limit: Number(get('limit') ?? '0'),
    seed: Number(get('seed') ?? '42'),
    // Baixo de proposito: rate limit de provedor durante o spike custa mais
    // tempo (retry) do que a serializacao economiza.
    concurrency: Number(get('concurrency') ?? '2'),
    dryRun: argv.includes('--dry-run'),
    prompt: get('prompt') ?? defaultVariantId,
    // Repeticoes do mesmo job. Serve para medir o que uma amostra so nao mostra:
    // taxa de recusa e quanto a semelhanca oscila entre geracoes iguais.
    repeat: Math.max(1, Number(get('repeat') ?? '1')),
  };
}

async function listImages(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir);
    return entries.filter((f) => IMAGE_EXT.test(f)).sort();
  } catch {
    return [];
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (process.argv.includes('--list-prompts')) {
    console.log('\nVariantes de prompt disponiveis (edite src/prompts.ts):\n');
    for (const v of PROMPT_VARIANTS) {
      console.log(`  ${v.id.padEnd(14)} ${v.hypothesis}`);
    }
    console.log('');
    return;
  }

  const variant = setPromptVariant(args.prompt);

  const selected = routes.filter(
    (r) => !args.routes.length || args.routes.some((id) => r.id.startsWith(id)),
  );

  const activeRoutes = args.dryRun
    ? selected.map(mockRoute)
    : selected.filter((r) => {
        const missing = r.requiredEnv.filter((k) => !process.env[k]);
        if (missing.length) {
          console.log(`- rota ${r.id} pulada: faltam ${missing.join(', ')} no .env`);
          return false;
        }
        return true;
      });

  if (!activeRoutes.length) {
    console.error('\nNenhuma rota executavel. Copie .env.example para .env e preencha as chaves.');
    console.error('Para exercitar o harness sem gastar credito: pnpm run run -- --dry-run');
    process.exit(1);
  }

  if (args.dryRun) {
    console.log('\n*** DRY-RUN: nenhuma API sera chamada, nenhuma imagem real sera gerada ***');
  }

  const activeScenes = args.scenes.length
    ? scenes.filter((s) => args.scenes.includes(s.id))
    : scenes;

  let selfieFiles = await listImages(paths.selfies);
  if (!selfieFiles.length) {
    console.error(`\nNenhuma selfie em ${paths.selfies}. Veja o README: precisa de ~20 fotos reais.`);
    process.exit(1);
  }
  if (args.limit > 0) selfieFiles = selfieFiles.slice(0, args.limit);

  const referenceFiles = await listImages(paths.references);
  const references = await Promise.all(
    referenceFiles.map((f) => fs.readFile(path.join(paths.references, f))),
  );
  if (!references.length) {
    console.log('! inputs/reference vazio — a rota A vai gerar sem referencia da figura.');
  }

  // Carrega e valida as selfies antes de gastar um centavo de API.
  const selfies: { name: string; buf: Buffer }[] = [];
  for (const file of selfieFiles) {
    const raw = await fs.readFile(path.join(paths.selfies, file));
    const problem = validateSelfie(await inspect(raw), raw.byteLength);
    if (problem) {
      console.log(`! selfie rejeitada ${file}: ${problem}`);
      continue;
    }
    selfies.push({ name: file, buf: await normalizeSelfie(raw) });
  }

  if (!selfies.length) {
    console.error('\nTodas as selfies foram rejeitadas na validacao.');
    process.exit(1);
  }

  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = path.join(paths.out, runId);
  await fs.mkdir(outDir, { recursive: true });

  const jobs: {
    route: RouteDefinition;
    scene: Scene;
    selfie: { name: string; buf: Buffer };
    repeat: number;
  }[] = [];
  for (const route of activeRoutes) {
    for (const scene of activeScenes) {
      for (const selfie of selfies) {
        for (let r = 1; r <= args.repeat; r++) jobs.push({ route, scene, selfie, repeat: r });
      }
    }
  }

  console.log(
    `\n${jobs.length} gerações: ${activeRoutes.length} rota(s) x ${activeScenes.length} cena(s) ` +
      `x ${selfies.length} selfie(s)` +
      (args.repeat > 1 ? ` x ${args.repeat} repetições` : ''),
  );
  // Lista explicita das rotas: `--routes=a` casa por prefixo e pode incluir
  // mais de uma (a do fal e a da BFL, por exemplo). Ver o que vai rodar e o
  // custo somado ANTES de gastar evita a surpresa de uma conta dobrada.
  console.log('\nRotas selecionadas:');
  const estimate = activeScenes.length * selfies.length * args.repeat;
  let total = 0;
  for (const route of activeRoutes) {
    const unit = args.dryRun ? 0 : route.unitCostUsd;
    total += unit * estimate;
    console.log(
      `  - ${route.id.padEnd(24)} ${estimate} imagens x US$${unit.toFixed(3)} = US$${(unit * estimate).toFixed(2)}`,
    );
  }
  console.log(
    args.dryRun ? '\nCusto estimado: US$0.00 (dry-run)' : `\nCusto estimado: ~US$${total.toFixed(2)}`,
  );
  console.log(`Saída: ${outDir}\n`);

  const records: TrialRecord[] = [];
  let done = 0;

  // Pool simples: N workers puxando do mesmo indice compartilhado.
  let next = 0;
  const worker = async () => {
    for (;;) {
      const i = next++;
      const job = jobs[i];
      if (!job) return;

      const res = await job.route.generate({
        scene: job.scene,
        selfie: job.selfie.buf,
        references,
        seed: args.seed,
      });

      const suffix = args.repeat > 1 ? `__r${String(job.repeat).padStart(2, '0')}` : '';
      const stem = `${variant.id}__${job.scene.id}__${path.parse(job.selfie.name).name}${suffix}`;
      let outputFile = '';
      if (res.image) {
        const dir = path.join(outDir, job.route.id);
        await fs.mkdir(dir, { recursive: true });
        outputFile = path.join(job.route.id, `${stem}.png`);
        await fs.writeFile(path.join(outDir, outputFile), res.image);
      }

      records.push({
        route: job.route.id,
        prompt: variant.id,
        scene: job.scene.id,
        selfie: job.selfie.name,
        seed: args.seed,
        repeat: job.repeat,
        outcome: res.outcome,
        detail: res.detail ?? '',
        latencyMs: res.latencyMs,
        costUsd: res.costUsd,
        outputFile,
      });

      done++;
      const mark = res.outcome === 'ok' ? 'ok  ' : res.outcome.toUpperCase();
      console.log(
        `[${String(done).padStart(3)}/${jobs.length}] ${mark} ${job.route.id} ${stem} ` +
          `${(res.latencyMs / 1000).toFixed(1)}s ${res.detail ?? ''}`.trimEnd(),
      );
    }
  };

  await Promise.all(Array.from({ length: args.concurrency }, worker));

  await fs.writeFile(path.join(outDir, 'trials.json'), JSON.stringify(records, null, 2));
  await fs.writeFile(path.join(outDir, 'trials.csv'), toCsv(records));

  console.log(summarize(records));
  console.log(`\nArtefatos em ${outDir}`);
  console.log(`Agora rode: pnpm report   (gera review.html para julgar a semelhança)\n`);
}

function toCsv(records: TrialRecord[]): string {
  const cols: (keyof TrialRecord)[] = [
    'route', 'prompt', 'scene', 'selfie', 'seed', 'repeat', 'outcome', 'latencyMs', 'costUsd',
    'outputFile', 'detail',
  ];
  const escape = (v: unknown) => `"${String(v).replace(/"/g, '""')}"`;
  return [cols.join(','), ...records.map((r) => cols.map((c) => escape(r[c])).join(','))].join('\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
