'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { comAviso, erro, requireAdmin } from '@/lib/admin-actions';
import { inspect } from '@/lib/image';
import { prisma } from '@/lib/prisma';
import { putObject, removeObject } from '@/lib/storage';

// requireAdmin, erro e comAviso moram em src/lib/admin-actions.ts: a bancada
// de teste usa exatamente os mesmos, e duas copias dessa logica divergiriam.

const SLUG = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;
const ASPECTOS = ['1:1', '3:4', '4:3', '9:16', '16:9'] as const;

/** Centavos vindos de um campo em reais ("19,90" ou "19.90"). */
function centavos(valor: FormDataEntryValue | null, obrigatorio = true): number | null {
  const texto = String(valor ?? '').trim().replace(',', '.');
  if (!texto) {
    if (obrigatorio) erro('Preço é obrigatório.');
    return null;
  }
  const n = Number(texto);
  if (!Number.isFinite(n) || n < 0) erro(`Preço inválido: "${texto}".`);
  return Math.round(n * 100);
}

const figuraSchema = z.object({
  productName: z.string().trim().min(1, 'Nome do produto é obrigatório.'),
  figureLabel: z.string().trim().min(1, 'Como a figura é chamada é obrigatório.'),
  headline: z.string().trim().min(1, 'Headline é obrigatória.'),
  subheadline: z.string().trim().min(1, 'Subheadline é obrigatória.'),
  ctaLabel: z.string().trim().min(1, 'Texto do botão é obrigatório.'),
  notice: z.string().trim().optional(),
});

function leFigura(fd: FormData) {
  const parsed = figuraSchema.safeParse({
    productName: fd.get('productName'),
    figureLabel: fd.get('figureLabel'),
    headline: fd.get('headline'),
    subheadline: fd.get('subheadline'),
    ctaLabel: fd.get('ctaLabel'),
    notice: fd.get('notice') ?? undefined,
  });
  if (!parsed.success) erro(parsed.error.issues[0]?.message ?? 'Dados inválidos.');

  return {
    ...parsed.data,
    notice: parsed.data.notice || null,
    priceCents: centavos(fd.get('priceCents'))!,
    compareAtCents: centavos(fd.get('compareAtCents'), false),
    bundlePriceCents: centavos(fd.get('bundlePriceCents'), false),
    isPrimary: fd.get('isPrimary') === 'on',
  };
}

export async function criarFigura(fd: FormData) {
  await requireAdmin();
  return comAviso('/admin/figuras/nova', async () => {
    const slug = String(fd.get('slug') ?? '').trim().toLowerCase();
    if (!SLUG.test(slug)) {
      erro('Slug inválido. Use letras minúsculas, números e hífen (ex.: trump).');
    }
    if (await prisma.figure.findUnique({ where: { slug } })) {
      erro(`Já existe uma figura com o slug "${slug}".`);
    }

    // Nasce DESLIGADA sempre. Sem cena e sem referencia ela nao consegue gerar,
    // e ligar antes de cadastrar so encheria a fila de pedidos retidos.
    await prisma.figure.create({ data: { slug, ...leFigura(fd), enabled: false } });

    revalidatePath('/admin');
    redirect(`/admin/figuras/${slug}`);
  });
}

export async function salvarFigura(slug: string, fd: FormData) {
  await requireAdmin();
  return comAviso(`/admin/figuras/${slug}`, async () => {    await prisma.figure.update({ where: { slug }, data: leFigura(fd) });

    revalidatePath('/admin');
    revalidatePath(`/admin/figuras/${slug}`);
    revalidatePath(`/${slug}`);
  });
}

/**
 * Apaga uma figura.
 *
 * Recusa se ela ja foi vendida: `OrderItem` aponta para `Figure` sem cascade,
 * de proposito. Pedido vendido tem de continuar legivel — inclusive para
 * suporte e contabilidade — muito depois de o produto sair do ar. Para tirar
 * do ar, DESLIGUE.
 */
export async function apagarFigura(slug: string) {
  await requireAdmin();
  return comAviso(`/admin/figuras/${slug}`, async () => {
    const vendida = await prisma.orderItem.count({ where: { figureSlug: slug } });
    if (vendida > 0) {
      erro(
        `Esta figura já foi vendida em ${vendida} pedido(s) e não pode ser apagada. ` +
          'Desligue-a para tirar do ar.',
      );
    }

    await prisma.figure.delete({ where: { slug } });
    revalidatePath('/admin');
    redirect('/admin');
  });
}

// ---------------------------------------------------------------- cenas

const cenaSchema = z.object({
  sceneId: z.string().trim().regex(SLUG, 'Id da cena inválido. Use letras minúsculas e hífen.'),
  label: z.string().trim().min(1, 'Nome da cena é obrigatório.'),
  hint: z.string().trim().min(1, 'Frase curta é obrigatória.'),
  aspectRatio: z.enum(ASPECTOS, { message: 'Proporção inválida.' }),
  setting: z.string().trim().min(20, 'A descrição do cenário está curta demais para gerar algo.'),
  // Emoji do card. Opcional — cena sem icone cai num marcador neutro na tela, e
  // exigir um so atrapalharia quem esta cadastrando cena as pressas. O teto de 8
  // e generoso de proposito: emoji composto (bandeira, profissao com modificador
  // de tom de pele) chega facil a 7 unidades de UTF-16.
  icon: z.string().trim().max(8, 'Use um emoji só.').optional(),
});

/**
 * Cria ou atualiza uma cena.
 *
 * `setting` vai DIRETO ao gerador e e o resultado mais caro da Fase 0. Aqui nao
 * ha revisao de codigo no caminho, entao a validacao e o que sobra: tamanho
 * minimo, e cena NOVA nasce desligada. Ligar e um segundo ato deliberado, com a
 * cena ja salva e relida — nao um efeito colateral de salvar.
 */
export async function salvarCena(figureSlug: string, fd: FormData) {
  await requireAdmin();
  return comAviso(`/admin/figuras/${figureSlug}`, async () => {
    const parsed = cenaSchema.safeParse({
      sceneId: fd.get('sceneId'),
      label: fd.get('label'),
      hint: fd.get('hint'),
      aspectRatio: fd.get('aspectRatio'),
      setting: fd.get('setting'),
      // `|| undefined` e nao `??`: campo de texto vazio chega como '', que o
      // `.optional()` do zod aceitaria e gravaria como string vazia.
      icon: fd.get('icon') || undefined,
    });
    if (!parsed.success) erro(parsed.error.issues[0]?.message ?? 'Dados inválidos.');

    const dados = parsed.data;
    const sortOrder = Number(fd.get('sortOrder') ?? 0) || 0;
    const enabled = fd.get('enabled') === 'on';

    await prisma.scene.upsert({
      where: { figureSlug_sceneId: { figureSlug, sceneId: dados.sceneId } },
      create: { figureSlug, ...dados, sortOrder, enabled: false },
      update: { ...dados, sortOrder, enabled },
    });

    revalidatePath(`/admin/figuras/${figureSlug}`);
    revalidatePath(`/${figureSlug}`);
  });
}

export async function apagarCena(figureSlug: string, sceneId: string) {
  await requireAdmin();
  return comAviso(`/admin/figuras/${figureSlug}`, async () => {
    // Mesma regra da figura: cena vendida nao some, porque o pedido guarda o
    // `sceneId` e o suporte precisa saber o que foi entregue.
    const vendida = await prisma.orderItem.count({ where: { figureSlug, sceneId } });
    if (vendida > 0) {
      erro(
        `Esta cena já foi vendida em ${vendida} pedido(s) e não pode ser apagada. ` +
          'Desmarque "ativa" para tirá-la da tela de escolha.',
      );
    }

    await prisma.scene.delete({ where: { figureSlug_sceneId: { figureSlug, sceneId } } });
    revalidatePath(`/admin/figuras/${figureSlug}`);
    revalidatePath(`/${figureSlug}`);
  });
}

// ---------------------------------------------------- referencias

const TIPOS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/**
 * Sobe uma foto de referencia da figura.
 *
 * O arquivo passa PELO servidor, ao contrario da selfie do cliente, que vai
 * direto ao MinIO por URL pre-assinada. E de proposito: sao poucas fotos, uma
 * vez por figura, feitas por voce — nao vale expor o bucket nem construir
 * fluxo assinado para isso. E resolve o passo manual do console do MinIO que o
 * DEPLOY.md descrevia.
 */
export async function subirReferencia(figureSlug: string, fd: FormData) {
  await requireAdmin();
  return comAviso(`/admin/figuras/${figureSlug}`, async () => {
    const file = fd.get('arquivo');
    if (!(file instanceof File) || file.size === 0) erro('Escolha um arquivo.');

    const ext = TIPOS[file.type];
    if (!ext) erro('Formato não suportado. Use JPG, PNG ou WEBP.');
    if (file.size > 10 * 1024 * 1024) erro('Arquivo grande demais. O limite é 10MB.');

    const buf = Buffer.from(await file.arrayBuffer());

    // Mesma regra da selfie do cliente: rosto pequeno demais em pixels degrada a
    // semelhanca, e a referencia e a entrada que MAIS pesa no resultado.
    let facts;
    try {
      facts = await inspect(buf);
    } catch {
      erro('Não conseguimos ler essa imagem.');
    }
    // 400, e nao os 512 que o upload do CLIENTE exige.
    //
    // As tres referencias que geraram toda a Fase 0 — 57/57 imagens aprovadas —
    // medem 576x768, 500x750 e 820x568. Uma delas tem 500 no menor lado, entao um
    // piso de 512 barraria material que esta PROVADO que funciona. O 512 foi
    // copiado da selfie sem pensar, e a selfie e outro caso: ali o rosto e o
    // assunto e chega de camera de celular, aqui a foto e escolhida a dedo.
    //
    // 400 e chute conservador; a unica evidencia dura e que 500 funciona.
    if (Math.min(facts.width, facts.height) < 400) {
      erro(`Imagem pequena demais (${facts.width}x${facts.height}). Use pelo menos 400 pixels.`);
    }

    const quantas = await prisma.figureReference.count({ where: { figureSlug } });
    // O gerador recebe no maximo 4 imagens (1 selfie + 3 referencias). Aceitar a
    // quarta seria aceitar um arquivo que nunca chega ao modelo.
    if (quantas >= 3) {
      erro('Já são 3 referências, o máximo que cabe no request do gerador. Apague uma antes.');
    }

    // Sufixo aleatorio, e NAO a contagem. Numerar por contagem parece organizado
    // e quebra na primeira vez que alguem apaga do meio: com ref-01 e ref-03 no
    // banco, a contagem 2 gera "ref-03" de novo, colide com o `@unique` do
    // objectKey e derruba a acao com 500. A ordem de exibicao ja vem do
    // `sortOrder`; o nome do arquivo so precisa ser unico.
    const sufixo = randomUUID().slice(0, 8);
    const objectKey = `figures/${figureSlug}/ref-${sufixo}.${ext}`;
    await putObject(objectKey, buf, file.type);

    await prisma.figureReference.create({
      data: { figureSlug, objectKey, mimeType: file.type, bytes: buf.byteLength, sortOrder: quantas },
    });

    revalidatePath(`/admin/figuras/${figureSlug}`);
  });
}

/**
 * Sobe a UNICA foto de exemplo da figura, a que aparece no topo da landing.
 *
 * Era uma amostra por cena, tres delas num grid. Isso exigia cinco imagens por
 * figura antes de conseguir vender, e cada uma so podia sair gerando de verdade
 * pelo proprio sistema — o gargalo do lancamento. Agora e uma por figura.
 *
 * Grava no bucket e guarda a CHAVE em `heroImage`; quem resolve a chave para uma
 * URL que o navegador abre e `urlDaHero`, em src/content.
 *
 * A imagem tem que ser uma geracao REAL do proprio produto. Foto de banco de
 * imagens ou montagem a mao promete uma coisa e entrega outra, e isso volta como
 * reclamacao e chargeback.
 */
export async function subirHero(figureSlug: string, fd: FormData) {
  await requireAdmin();

  return comAviso(`/admin/figuras/${figureSlug}`, async () => {
    const file = fd.get('arquivo');
    if (!(file instanceof File) || file.size === 0) erro('Escolha um arquivo.');

    const ext = TIPOS[file.type];
    if (!ext) erro('Formato não suportado. Use JPG, PNG ou WEBP.');
    if (file.size > 10 * 1024 * 1024) erro('Arquivo grande demais. O limite é 10MB.');

    const buf = Buffer.from(await file.arrayBuffer());
    try {
      await inspect(buf);
    } catch {
      erro('Não conseguimos ler essa imagem.');
    }

    // Sufixo aleatorio para o navegador nao servir a imagem antiga do cache
    // depois de voce trocar a foto — chave fixa daria exatamente isso, e voce
    // trocaria a imagem sem ver diferenca nenhuma.
    const objectKey = `figures/${figureSlug}/hero-${randomUUID().slice(0, 8)}.${ext}`;
    await putObject(objectKey, buf, file.type);

    const anterior = await prisma.figure.findUnique({
      where: { slug: figureSlug },
      select: { heroImage: true },
    });

    await prisma.figure.update({
      where: { slug: figureSlug },
      data: { heroImage: objectKey },
    });

    // Limpa a anterior, se era do bucket. Caminho de `public/` fica: ele vem do
    // repositorio e nao e nosso para apagar.
    if (anterior?.heroImage && !anterior.heroImage.startsWith('/')) {
      await removeObject(anterior.heroImage).catch(() => {});
    }

    revalidatePath(`/admin/figuras/${figureSlug}`);
    revalidatePath(`/${figureSlug}`);
  });
}

export async function apagarReferencia(figureSlug: string, id: string) {
  await requireAdmin();
  return comAviso(`/admin/figuras/${figureSlug}`, async () => {
    const ref = await prisma.figureReference.findUnique({ where: { id } });
    if (!ref) return;

    await prisma.figureReference.delete({ where: { id } });
    // Depois do banco: se o storage falhar sobra um objeto orfao, que custa
    // centavos. Na ordem inversa, um erro deixaria a linha apontando para um
    // arquivo que nao existe mais — e ai todo pedido da figura fica retido.
    await removeObject(ref.objectKey).catch((e) =>
      console.error('[admin] objeto órfão em', ref.objectKey, e),
    );

    revalidatePath(`/admin/figuras/${figureSlug}`);
  });
}

// ------------------------------------------------------- adicionais

/** Define quais figuras entram como order bump desta. */
export async function salvarAdicionais(figureSlug: string, fd: FormData) {
  await requireAdmin();
  return comAviso(`/admin/figuras/${figureSlug}`, async () => {
    const escolhidos = fd
      .getAll('adicional')
      .map(String)
      .filter((s) => s !== figureSlug); // uma figura nao e adicional de si mesma

    await prisma.$transaction([
      prisma.figureAddon.deleteMany({ where: { principalSlug: figureSlug } }),
      prisma.figureAddon.createMany({
        data: escolhidos.map((adicionalSlug, i) => ({
          principalSlug: figureSlug,
          adicionalSlug,
          sortOrder: i,
        })),
      }),
    ]);

    revalidatePath(`/admin/figuras/${figureSlug}`);
    revalidatePath(`/${figureSlug}`);
  });
}
