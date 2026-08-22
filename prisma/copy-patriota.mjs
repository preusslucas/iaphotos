/**
 * Aplica a copy aprovada pelo cliente na figura `patriota`.
 *
 * Existe porque a copy mora no BANCO, nao no codigo — e cada ambiente tem o seu
 * banco. O que foi ajustado em desenvolvimento nao viaja no deploy junto com a
 * imagem, e o `seed.mjs` nao ajuda: ele e bootstrap, sai sem fazer nada se ja
 * houver figura cadastrada. Sem este script, producao sobe com o codigo novo e
 * o texto velho na tela.
 *
 * DIFERENTE DO SEED: este script SOBRESCREVE de proposito. E a sua unica razao
 * de existir. Por isso ele mexe numa figura so, nomeada aqui, e nunca varre o
 * catalogo — um script que sobrescreve tudo o que encontra e o tipo de coisa que
 * apaga o trabalho de alguem numa terca-feira.
 *
 * Rodar em producao:
 *   docker exec -it <container-do-web> node prisma/copy-patriota.mjs
 *
 * Conferir antes, sem gravar nada:
 *   docker exec -it <container-do-web> node prisma/copy-patriota.mjs --dry-run
 *
 * `.mjs` e nao `.ts` pelo mesmo motivo do seed: roda DENTRO da imagem de
 * producao, que nao tem tsx nem TypeScript — so node e o @prisma/client.
 */

import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SLUG = 'patriota';
const ENSAIO = process.argv.includes('--dry-run');

/** Campos da figura. `priceCents` fica de fora: nao mudou, e preco e do /admin. */
const FIGURA = {
  figureLabel: 'o Capitão',
  headline: 'Mostre de que lado você está. 🇧🇷',
  subheadline:
    'Faça sua foto ao lado do Capitão e mostre, para todo mundo, o lado que você escolheu defender.',
  ctaLabel: 'Quero criar minha foto',
  heroImage: '/hero/patriota.webp',

  // R$ 29,80 = R$ 19,90 + R$ 9,90. O incremento de R$ 9,90 e o que aparece no
  // desenho; com os R$ 29,90 que estavam no banco, a tela anunciava + R$ 10,00.
  bundlePriceCents: 2980,
  // O desenho nao tem preco riscado. O campo continua existindo para quem
  // quiser usa-lo depois.
  compareAtCents: null,

  priceNote:
    'Esse valor cobre só o nosso trabalho e fortalece o nosso lado, em apoio ao nosso Capitão 🇧🇷',
  comboTitle: 'Combo: Capitão, Trump e Flávio 🇧🇷',
  comboPitch:
    'A mesma selfie em três versões patriotas: ao lado do Capitão, do Trump e do Flávio. ' +
    'Enquanto a esquerda treme, você já mostra de que lado tá.',
};

/**
 * Cenas: ordem, amostra e legenda da vitrine.
 *
 * `sortOrder` importa porque o carrossel da landing mostra as TRES PRIMEIRAS
 * cenas que tiverem amostra. Por isso `moto` e `estadio` ficam com `sampleImage`
 * nulo: o que havia neles eram placeholders gerados, e um placeholder na frente
 * de um exemplo real e pior do que uma vitrine com tres itens.
 *
 * `sampleCaption` e separado de `label` porque os dois falam com pessoas em
 * momentos diferentes: a vitrine fala com quem ainda nao comprou, o seletor de
 * cenario fala com quem ja esta escolhendo.
 */
const CENAS = [
  {
    sceneId: 'selfie-rua',
    sortOrder: 0,
    sampleImage: '/samples/patriota/selfie-rua.webp',
    sampleCaption: 'Exemplo 1: Selfie patriota',
  },
  {
    sceneId: 'feira',
    sortOrder: 1,
    sampleImage: '/samples/patriota/feira.webp',
    sampleCaption: 'Exemplo 2: Encontro com o Capitão',
  },
  {
    sceneId: 'comicio',
    sortOrder: 2,
    sampleImage: '/samples/patriota/comicio.webp',
    sampleCaption: 'Exemplo 3: Evento com bandeiras',
  },
  { sceneId: 'moto', sortOrder: 3, sampleImage: null, sampleCaption: null },
  { sceneId: 'estadio', sortOrder: 4, sampleImage: null, sampleCaption: null },
];

/**
 * Depoimentos. As fotos sao retratos sinteticos, nao pessoas reais — o texto ao
 * lado tambem e ilustrativo, e rosto de gente de verdade num depoimento que ela
 * nao escreveu e uso de imagem sem consentimento.
 */
const DEPOIMENTOS = [
  {
    name: 'Valdeci Oliveira',
    city: 'BR',
    photo: '/depoimentos/1.webp',
    text:
      'Fiz todos meus amigos patriotas usarem foto de perfil com o Capitão. ' +
      'Ficou tão real que o pessoal do grupo nem acreditou!',
  },
  {
    name: 'Terezinha Souza',
    city: 'BR',
    photo: '/depoimentos/2.webp',
    text:
      'Botei minha foto com o Capitão no WhatsApp e o grupo da família inteiro ' +
      'quis fazer a sua também. Ficou muito real!',
  },
  {
    name: 'Sebastiao Ramos',
    city: 'BR',
    photo: '/depoimentos/4.webp',
    text:
      'Nunca tive a chance de tirar uma foto com o Capitão pessoalmente, mas essa ' +
      'aqui ficou de arrepiar. Já virou minha foto de perfil!',
  },
  {
    name: 'Geraldo Nunes',
    city: 'BR',
    photo: '/depoimentos/3.webp',
    text:
      'Paguei no PIX e recebi na hora. Compartilhei no grupo e todo mundo pediu o ' +
      'link. Simples até pra mim que não manjo de celular!',
  },
];

/**
 * Confere que o arquivo existe em `public/` antes de gravar o caminho.
 *
 * Caminho morto no banco vira imagem quebrada na landing — pior do que a
 * ausencia, que a propria tela sabe esconder. A checagem roda aqui e nao na
 * pagina porque a landing e `force-dynamic`: ler disco a cada visita custaria em
 * todo acesso para responder algo que so muda em deploy.
 */
const avisos = [];
function seExistir(caminho) {
  if (!caminho) return null;
  if (existsSync(path.join(RAIZ, 'public', caminho))) return caminho;
  avisos.push(caminho);
  return null;
}

async function main() {
  const figura = await prisma.figure.findUnique({ where: { slug: SLUG } });
  if (!figura) {
    console.error(`[copy] figura "${SLUG}" nao existe neste banco. Nada foi alterado.`);
    console.error('[copy] rode o seed antes, ou confira se o DATABASE_URL aponta para o lugar certo.');
    process.exitCode = 1;
    return;
  }

  if (ENSAIO) console.log('[copy] ENSAIO: nada sera gravado.\n');

  const dadosFigura = { ...FIGURA, heroImage: seExistir(FIGURA.heroImage) };
  if (!ENSAIO) await prisma.figure.update({ where: { slug: SLUG }, data: dadosFigura });
  console.log(`[copy] figura     : ${dadosFigura.headline}`);
  console.log(`[copy] cta        : ${dadosFigura.ctaLabel}`);
  console.log(`[copy] hero       : ${dadosFigura.heroImage ?? '(sem arquivo — mantida vazia)'}`);

  for (const cena of CENAS) {
    const alvo = await prisma.scene.findUnique({
      where: { figureSlug_sceneId: { figureSlug: SLUG, sceneId: cena.sceneId } },
    });
    if (!alvo) {
      console.log(`[copy] cena       : ${cena.sceneId} NAO existe — pulada`);
      continue;
    }
    const dados = {
      sortOrder: cena.sortOrder,
      sampleImage: seExistir(cena.sampleImage),
      sampleCaption: cena.sampleCaption,
    };
    if (!ENSAIO) {
      await prisma.scene.update({
        where: { figureSlug_sceneId: { figureSlug: SLUG, sceneId: cena.sceneId } },
        data: dados,
      });
    }
    console.log(
      `[copy] cena       : ${String(cena.sortOrder)} ${cena.sceneId.padEnd(11)} ${
        dados.sampleCaption ?? '(fora da vitrine)'
      }`,
    );
  }

  // Depoimento nao tem chave natural: apaga e recria, que e como o seed tambem
  // faz. Sem id estavel, um upsert precisaria inventar um.
  if (!ENSAIO) {
    await prisma.testimonial.deleteMany({ where: { figureSlug: SLUG } });
    await prisma.testimonial.createMany({
      data: DEPOIMENTOS.map((d, i) => ({
        figureSlug: SLUG,
        sortOrder: i,
        name: d.name,
        city: d.city,
        text: d.text,
        photo: seExistir(d.photo),
      })),
    });
  }
  for (const d of DEPOIMENTOS) console.log(`[copy] depoimento : ${d.name}`);

  if (avisos.length) {
    console.log('');
    console.log('[copy] AVISO: estes arquivos nao existem em public/ e foram gravados como vazios:');
    for (const a of avisos) console.log(`[copy]   ${a}`);
    console.log('[copy] a tela esconde o que falta, entao nada quebra — mas confira o deploy.');
  }

  console.log('');
  console.log(ENSAIO ? '[copy] ensaio concluido, nada gravado.' : '[copy] copy aplicada.');
}

main()
  .catch((e) => {
    console.error('[copy] falhou:', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
