/**
 * Sobe as fotos de referencia da figura para o storage.
 *
 * Passo de setup que faltava numa maquina nova. Sem ele o worker gera assim
 * mesmo: `loadReferences` engole cada referencia ausente com um console.warn e
 * segue com a lista vazia, entao o pedido vira READY e e entregue com a figura
 * "de memoria" do modelo — roupa errada e rosto menos fiel, sem erro nenhum no
 * log de producao. Veja a nota em HANDOFF.md.
 *
 * O `--env-file` nao e opcional: este script nao importa o prisma, e era ele
 * que carregava o .env de carona nos outros.
 *
 *   pnpm exec tsx --env-file=.env scripts/sobe-referencias.ts patriota \
 *     bolsonaro-01.jpg bolsonaro-02l.jpg bolsonaro-03.webp
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { getFigure } from '../src/content';
import { ensureBucket, putObject } from '../src/lib/storage';

const ORIGEM = path.join(process.cwd(), 'spike', 'inputs', 'reference');

const MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

async function main() {
  const slug = process.argv[2] ?? 'patriota';
  const figure = await getFigure(slug);
  if (!figure) throw new Error(`figura desconhecida: ${slug}`);

  // Os arquivos locais nao tem o mesmo nome das chaves do storage: a origem e
  // o que veio da maquina antiga (bolsonaro-01.jpg...), o destino e o contrato
  // do catalogo (figures/<slug>/ref-NN.jpg). Casa por ordem alfabetica.
  const locais = process.argv.slice(3);
  if (locais.length === 0) {
    throw new Error(
      `informe os arquivos, em ordem, dentro de ${ORIGEM}\n` +
        `  ex.: pnpm tsx scripts/sobe-referencias.ts ${slug} bolsonaro-01.jpg bolsonaro-02l.jpg bolsonaro-03.webp`,
    );
  }
  if (locais.length !== figure.referenceKeys.length) {
    throw new Error(
      `a figura espera ${figure.referenceKeys.length} referencias, foram passados ${locais.length}`,
    );
  }

  await ensureBucket();

  for (const [i, chave] of figure.referenceKeys.entries()) {
    const arquivo = path.join(ORIGEM, locais[i]);
    const buf = readFileSync(arquivo);
    const mime = MIME[path.extname(arquivo).toLowerCase()] ?? 'application/octet-stream';
    await putObject(chave, buf, mime);
    console.log(`${locais[i]} -> ${chave}  (${buf.byteLength} bytes, ${mime})`);
  }

  console.log('\npronto. o worker agora acha as referencias.');
}

main().catch((e) => {
  console.error('ERRO:', e.message);
  process.exit(1);
});
