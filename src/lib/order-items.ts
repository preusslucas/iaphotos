import type { FigureConfig } from '@/content';
import { resolveSceneParaAddon } from '@/content';
import { prisma } from './prisma';

/**
 * Monta o que o pedido entrega e por quanto.
 *
 * O preco NUNCA vem do browser. A tela manda apenas "quero o combo, sim ou
 * nao"; o valor sai daqui, lido do banco. Sem isso, um POST forjado compraria
 * tres fotos por um centavo.
 *
 * Regra de 2026-08-13: a foto sozinha custa `priceCents` (R$19,90) e o combo
 * com todos os adicionais custa `bundlePriceCents` (R$29,90) — nao e soma, e
 * preco fechado. Levar so UM adicional nao existe como opcao, de proposito:
 * duas escolhas convertem melhor que cinco.
 */
export function precoDoPedido(figure: FigureConfig, combo: boolean): number {
  if (!combo) return figure.priceCents;

  // Sem combo cadastrado, cobrar o combo seria cobrar por foto que nao vamos
  // gerar. Cai no preco base — o caminho seguro para o cliente.
  return figure.bundlePriceCents ?? figure.priceCents;
}

/** Adicionais que realmente podem ser gerados hoje (tem cena e referencia). */
export function addonsVendaveis(figure: FigureConfig): string[] {
  return figure.addons.filter((a) => a.vendavel).map((a) => a.slug);
}

/**
 * (Re)cria os itens do pedido a partir da escolha do combo.
 *
 * Roda no checkout, antes de cobrar, e e idempotente: apaga os itens e refaz.
 * Pode ser chamada de novo se a pessoa voltar e trocar a opcao — o que so vale
 * enquanto o pedido esta PENDING, porque depois de pago o que foi cobrado tem
 * de continuar batendo com o que foi entregue.
 */
export async function sincronizaItens(
  orderId: string,
  figure: FigureConfig,
  sceneId: string,
  combo: boolean,
): Promise<{ itens: number; amountCents: number }> {
  const amountCents = precoDoPedido(figure, combo);
  const adicionais = combo ? addonsVendaveis(figure) : [];

  // Cada adicional usa a MESMA cena escolhida, quando ele a tem cadastrada.
  // `resolveSceneParaAddon` cuida do caso em que nao tem.
  const itensAdicionais = await Promise.all(
    adicionais.map(async (slug, i) => {
      const cena = await resolveSceneParaAddon(slug, sceneId);
      return cena ? { figureSlug: slug, sceneId: cena.id, sortOrder: i + 1 } : null;
    }),
  );

  const itens = [
    // O principal e sempre o primeiro e carrega o preco cheio do pedido. Os
    // adicionais entram a zero porque o combo e um preco so — dividir R$29,90
    // por tres daria numero quebrado e nao corresponderia a nada que o cliente
    // viu na tela.
    { figureSlug: figure.slug, sceneId, sortOrder: 0, priceCents: amountCents },
    ...itensAdicionais
      .filter((i): i is NonNullable<typeof i> => i !== null)
      .map((i) => ({ ...i, priceCents: 0 })),
  ];

  await prisma.$transaction([
    prisma.orderItem.deleteMany({ where: { orderId } }),
    prisma.orderItem.createMany({ data: itens.map((i) => ({ orderId, ...i })) }),
    prisma.order.update({ where: { id: orderId }, data: { amountCents } }),
  ]);

  return { itens: itens.length, amountCents };
}
