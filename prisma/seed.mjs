/**
 * Popula o catalogo no banco. BOOTSTRAP, nao sincronizacao.
 *
 * Roda no boot do container web (docker/entrypoint-web.sh) e SAI SEM FAZER NADA
 * se o catalogo ja existir. E a diferenca que importa em producao: o catalogo
 * passou a ser editavel pelo /admin, entao um seed que sobrescreve apagaria, a
 * cada deploy, o preco e a copy que voce ajustou no painel. Ninguem liga um
 * deploy esperando perder o que mudou de manha.
 *
 * Para forcar mesmo assim (util so em desenvolvimento):
 *   SEED_FORCE=1 node prisma/seed.mjs
 *
 * `.mjs` e nao `.ts` porque ele roda DENTRO da imagem de producao, que nao tem
 * tsx nem o TypeScript — so node e o @prisma/client.
 *
 * A figura `patriota` vem do que estava em `src/content/figures/patriota.ts`
 * antes de 2026-08-13, quando o catalogo era codigo. As duas figuras
 * adicionais (Trump e Flavio) nascem SEM cena e SEM referencia de proposito:
 * cena e prompt, referencia e foto de terceiro, e nenhuma das duas deve ser
 * inventada por um seed. Cadastre pelo /admin.
 *
 *   pnpm db:seed
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PrismaClient } from '@prisma/client';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Aceita o caminho da foto SO se o arquivo existir em `public/`.
 *
 * Sem esta conferencia, um seed rodado antes de as fotos serem colocadas no
 * repositorio gravaria caminhos mortos, e a landing renderizaria tres avatares
 * quebrados na secao de prova social — pior do que nao ter foto nenhuma, que e
 * um circulo com as iniciais e parece intencional.
 *
 * Rodar no seed, e nao na landing, e o que faz a conta ser paga uma vez: a
 * pagina e `force-dynamic` e checar disco a cada request custaria em toda
 * visita para responder algo que so muda em deploy.
 */
function fotoSeExistir(caminho) {
  if (!caminho) return undefined;
  return existsSync(path.join(RAIZ, 'public', caminho)) ? caminho : undefined;
}

const prisma = new PrismaClient();

const PATRIOTA_SCENES = [
  {
    sceneId: 'selfie-rua',
    icon: '🤳',
    label: 'Selfie na rua',
    hint: 'O clássico: os dois sorrindo, luz do dia',
    aspectRatio: '3:4',
    setting:
      'a casual smartphone selfie taken outdoors on a sunny Brazilian street, both people ' +
      'smiling at the camera, shoulders close together, slight wide-angle lens distortion, ' +
      'natural midday light, candid amateur photo look',
    sampleImage: '/samples/patriota/selfie-rua.webp',
  },
  {
    sceneId: 'comicio',
    icon: '🇧🇷',
    label: 'Comício com bandeiras',
    hint: 'Palco, multidão e verde-amarelo',
    aspectRatio: '16:9',
    setting:
      'two people standing side by side on an outdoor stage in front of a large cheering ' +
      'crowd waving green and yellow Brazilian flags, golden hour backlight, ' +
      'photojournalistic wide shot',
    sampleImage: '/samples/patriota/comicio.webp',
  },
  {
    sceneId: 'moto',
    icon: '🏍️',
    label: 'Motociata',
    hint: 'Na estrada, bandeiras nas motos',
    aspectRatio: '16:9',
    setting:
      'two people standing side by side next to motorcycles on a highway during a large ' +
      'motorcycle rally, helmets off, Brazilian flags on the bikes, other riders blurred ' +
      'in the background, bright overcast daylight',
    sampleImage: '/samples/patriota/moto.webp',
  },
  {
    sceneId: 'estadio',
    icon: '🏟️',
    label: 'No estádio',
    hint: 'Arquibancada cheia, dia de jogo',
    aspectRatio: '16:9',
    setting:
      'two people standing side by side in the stands of a packed football stadium on a ' +
      'sunny afternoon, crowd out of focus behind them, both looking at the camera, ' +
      'casual clothes, natural daylight, phone photo look',
    sampleImage: '/samples/patriota/estadio.webp',
  },
  {
    sceneId: 'feira',
    icon: '🧺',
    label: 'Na feira',
    hint: 'Rua movimentada, clima de povo',
    aspectRatio: '3:4',
    setting:
      'two people standing side by side in a busy Brazilian street market on a sunny ' +
      'morning, stalls and people out of focus behind them, both smiling at the camera, ' +
      'casual clothes, warm natural light, candid phone photo',
    sampleImage: '/samples/patriota/feira.webp',
  },
];

/**
 * `photo` aponta para `public/depoimentos/`. NÃO é obrigatório: sem o arquivo, a
 * landing desenha as iniciais num círculo, que é o que ela fazia antes de o
 * campo existir. Ver `public/depoimentos/README.md` para os nomes esperados.
 *
 * As fotos precisam ser ilustrativas, como o texto ao lado delas já é. Rosto de
 * pessoa real que não autorizou num depoimento que ela não escreveu é uso de
 * imagem sem consentimento — a landing inteira depende de não fazer isso.
 */
const PATRIOTA_TESTIMONIALS = [
  {
    name: 'Marcos A.',
    city: 'Londrina, PR',
    text: 'Ficou tão real que meu irmão perguntou onde foi o encontro. Expliquei que é IA e ele quis a dele.',
    photo: '/depoimentos/1.webp',
  },
  {
    name: 'Rosana M.',
    city: 'Goiânia, GO',
    text: 'Coloquei no meu perfil e todo mundo comentou. Melhores R$30 que gastei esse mês.',
    photo: '/depoimentos/2.webp',
  },
  {
    name: 'Jair P.',
    city: 'Sorocaba, SP',
    text: 'Achei que ia demorar, mas chegou antes de eu terminar o café.',
    photo: '/depoimentos/3.webp',
  },
];

async function main() {
  const jaTem = await prisma.figure.count();
  if (jaTem > 0 && process.env.SEED_FORCE !== '1') {
    console.log(`[seed] catálogo já tem ${jaTem} figura(s) — nada a fazer.`);
    return;
  }

  // ---------- figura principal ----------
  const patriota = {
    productName: 'Foto Patriota IA',
    figureLabel: 'o seu líder',
    headline: 'Mostre de que lado você está. 🇧🇷',
    subheadline:
      'Faça sua foto ao lado do Capitão e mostre, para todo mundo, o lado que você escolheu defender.',
    ctaLabel: 'Quero criar minha foto',
    // R$19,90 a foto sozinha; R$29,90 levando as tres. Decidido em 2026-08-13.
    priceCents: 1990,
    compareAtCents: 4990,
    bundlePriceCents: 2990,
    isPrimary: true,
  };

  await prisma.figure.upsert({
    where: { slug: 'patriota' },
    create: { slug: 'patriota', ...patriota },
    update: patriota,
  });

  for (const [i, scene] of PATRIOTA_SCENES.entries()) {
    await prisma.scene.upsert({
      where: { figureSlug_sceneId: { figureSlug: 'patriota', sceneId: scene.sceneId } },
      create: { figureSlug: 'patriota', sortOrder: i, ...scene },
      update: { sortOrder: i, ...scene },
    });
  }

  // As REFERENCIAS nao sao criadas aqui, de proposito.
  //
  // Uma linha de referencia e a promessa de que existe um arquivo no bucket.
  // Um seed nao tem como cumprir essa promessa: as fotos sao material de
  // terceiro e nao viajam no git. Criar as linhas mesmo assim faz o /admin
  // exibir "3 referências" com o bucket vazio, e todo pedido cair em
  // NEEDS_REVIEW sem que nada no painel indique o motivo.
  //
  // Suba pelo /admin, em Figuras → (a figura) → Fotos de referência. Enquanto
  // nao houver nenhuma, o painel marca a figura como "não pode vender ainda" e
  // o worker avisa no boot.

  // Os BONUS nao sao criados aqui, pelo mesmo motivo das referencias: uma linha
  // de bonus e a promessa de um arquivo no bucket, e o seed nao tem como
  // cumpri-la — os arquivos nao existem. Cadastrar mesmo assim fazia a tela de
  // resultado exibir tres botoes "Baixar" que nao baixavam nada, e cada clique
  // desses vira contato de suporte de alguem que acabou de pagar.
  //
  // Quando os arquivos existirem, suba-os para `bonuses/<slug>/` e crie as
  // linhas: a secao volta sozinha na tela de resultado.

  // Depoimento nao tem chave natural: limpa e recria, que e o que mantem o seed
  // idempotente sem inventar id.
  await prisma.testimonial.deleteMany({ where: { figureSlug: 'patriota' } });
  await prisma.testimonial.createMany({
    data: PATRIOTA_TESTIMONIALS.map((t, i) => ({
      figureSlug: 'patriota',
      sortOrder: i,
      ...t,
      photo: fotoSeExistir(t.photo) ?? null,
    })),
  });

  // ---------- adicionais ----------
  // `isPrimary: false`: nao tem landing propria, so aparecem no order bump.
  // `enabled: false`: sem referencia no bucket, a geracao delas ficaria retida
  // em NEEDS_REVIEW. Ligue no /admin DEPOIS de subir as fotos e cadastrar as
  // cenas — o proprio painel avisa o que falta.
  const adicionais = [
    {
      slug: 'trump',
      productName: 'Foto com o Trump',
      figureLabel: 'o Trump',
      headline: 'Você ao lado do Trump.',
      subheadline: 'Imagem criada por inteligência artificial.',
      ctaLabel: 'Quero a minha foto',
      priceCents: 1990,
      isPrimary: false,
      enabled: false,
    },
    {
      slug: 'flavio',
      productName: 'Foto com o Flávio',
      figureLabel: 'o Flávio',
      headline: 'Você ao lado do Flávio.',
      subheadline: 'Imagem criada por inteligência artificial.',
      ctaLabel: 'Quero a minha foto',
      priceCents: 1990,
      isPrimary: false,
      enabled: false,
    },
  ];

  for (const [i, fig] of adicionais.entries()) {
    const { slug, ...rest } = fig;
    await prisma.figure.upsert({
      where: { slug },
      create: { slug, ...rest },
      // Nao mexe em `enabled` no update: se voce ja ligou pelo /admin, um seed
      // novo nao pode desligar a venda pelas suas costas.
      update: { ...rest, enabled: undefined },
    });

    await prisma.figureAddon.upsert({
      where: { principalSlug_adicionalSlug: { principalSlug: 'patriota', adicionalSlug: slug } },
      create: { principalSlug: 'patriota', adicionalSlug: slug, sortOrder: i },
      update: { sortOrder: i },
    });
  }

  const figuras = await prisma.figure.findMany({
    include: { _count: { select: { scenes: true, references: true, addonsOffered: true } } },
    orderBy: { slug: 'asc' },
  });

  console.log('\ncatálogo no banco:');
  for (const f of figuras) {
    console.log(
      `  ${f.slug.padEnd(10)} ${f.enabled ? 'ligada  ' : 'DESLIGADA'} ` +
        `${f._count.scenes} cena(s)  ${f._count.references} referência(s)  ` +
        `${f._count.addonsOffered} adicional(is)`,
    );
  }
}

main()
  .catch((e) => {
    console.error('ERRO:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
