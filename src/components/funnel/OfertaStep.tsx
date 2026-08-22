'use client';

import { useState } from 'react';
import type { PublicFigure } from '@/content';
import { formatBRL } from '@/lib/format';

/**
 * Tela de oferta — o `/oferta` da LP do Lovable, portado.
 *
 * Por que ela existe SEPARADA do formulário de pagamento, e não como um bloco a
 * mais dentro dele: são duas perguntas diferentes. Aqui a pessoa decide QUANTO
 * vai gastar; na tela seguinte ela digita e-mail e telefone. Misturadas — que é
 * como estavam — o order bump aparecia entre dois campos de formulário, no
 * momento em que a pessoa está no modo "preencher" e não no modo "escolher", e
 * a oferta era lida como mais um campo a resolver.
 *
 * Ela também é a tela em que o PREÇO aparece pela primeira vez no funil. Antes
 * dela ninguém viu valor nenhum — a selfie já subiu, o pedido já existe, e o
 * único passo que falta é este. É o desenho da LP e é deliberado.
 *
 * O que mudou na portagem:
 *
 * - Nenhum número está escrito à mão. A LP cravava "R$ 19,90", "R$ 39,80" e
 *   "-75%" no JSX; aqui tudo sai de `priceCents` / `bundlePriceCents`, que vêm
 *   do /admin. Mudar o preço lá muda o desconto anunciado aqui, e não sobra um
 *   "-75%" fixo contradizendo a própria conta ao lado.
 * - A caixa de bônus e a chamada "APOIE A NOSSA LUTA" do rodapé do card não
 *   existem: o cliente pediu as duas fora.
 * - A copy de CAMPANHA vem do banco (`priceNote`, `comboTitle`, `comboPitch`),
 *   e não cravada aqui. "Em apoio ao nosso Capitão" e "enquanto a esquerda
 *   treme" são frases de uma figura específica; no componente, reapareceriam em
 *   toda figura futura. Sem elas preenchidas, a tela monta frases neutras a
 *   partir dos preços e dos nomes dos adicionais.
 * - O selo do combo diz "MAIS ESCOLHIDO" por decisão do cliente. Registrando:
 *   é uma afirmação sobre o que outros compradores escolheram, e ninguém mediu
 *   isso. "MELHOR OFERTA", que estava aqui antes, era verificável na própria
 *   tela — a conta fica logo abaixo do selo.
 */
export function OfertaStep({
  figure,
  onContinuar,
}: {
  figure: PublicFigure;
  /** Avança para os dados de pagamento com a escolha do combo já feita. */
  onContinuar: (combo: boolean) => void;
}) {
  const [combo, setCombo] = useState(false);

  const addons = figure.addons.filter((a) => a.vendavel).map((a) => a.productName);
  // Mesma regra do servidor: sem adicional vendável não existe combo. Oferecer
  // um "leve as três" que o gerador não consegue produzir é vender o que não dá
  // para entregar.
  const bundle = figure.bundlePriceCents;
  const temBump = bundle != null && addons.length > 0;

  const total = temBump && combo ? bundle : figure.priceCents;
  const totalFotos = 1 + addons.length;
  /** Quanto a mais sobre o que ela já ia pagar. Converte melhor que o total. */
  const incremento = (bundle ?? figure.priceCents) - figure.priceCents;
  /** O que os adicionais custariam comprados um a um, ao preço cheio. */
  const avulso = addons.length * figure.priceCents;
  const descontoPct = avulso > incremento ? Math.round((1 - incremento / avulso) * 100) : 0;

  return (
    // O card branco sobre o degradê do body, com sombra — a moldura da LP.
    <div className="rounded-2xl border border-border bg-surface p-5 shadow-card">
      <h1 className="text-xl font-extrabold tracking-tight">
        Para liberar a sua foto com {figure.figureLabel}
      </h1>

      {/* OFERTA PRINCIPAL — o bloco de borda dourada da LP.
          O amarelo aparece como BORDA e como fundo a 10%, nunca como fundo cheio
          de texto: sobre o amarelo da bandeira só quase-preto é legível, e o
          `globals.css` diz isso com todas as letras. */}
      <div className="mt-5 rounded-xl border-2 border-brasil bg-brasil/10 p-4">
        <p className="text-sm leading-relaxed font-bold">
          Para liberar a sua foto e já usar no WhatsApp, no Instagram e no Facebook:
        </p>

        <p className="mt-3 text-3xl font-extrabold text-green-deep">
          {formatBRL(figure.priceCents)}{' '}
          <span className="text-sm font-semibold text-foreground">no Pix</span>
        </p>

        {/* Sem ancoragem de preço aqui: o desenho do cliente não a tem. O campo
            `compareAtCents` continua no catálogo para quem quiser usá-lo. */}
        <p className="mt-2 text-xs leading-relaxed text-muted">
          {figure.priceNote ?? 'Pagamento único, sem assinatura. A foto fica sua para sempre.'}
        </p>
      </div>

      {/* COMBO — o order bump. Clique no bloco inteiro, não numa caixinha de
          16px: no celular, acertar o alvo pequeno é a diferença entre a oferta
          converter e irritar. */}
      {temBump && (
        <button
          type="button"
          onClick={() => setCombo((v) => !v)}
          aria-pressed={combo}
          className={`relative mt-4 w-full rounded-xl border-2 p-4 pt-5 text-left transition-colors ${
            combo ? 'border-accent bg-surface-2/60' : 'border-border bg-surface hover:border-accent'
          }`}
        >
          <span className="absolute -top-3 right-3 inline-flex items-center gap-1 rounded-md bg-brasil px-2 py-1 text-[0.68rem] font-extrabold tracking-wide text-brasil-escuro uppercase shadow-soft">
            <IconEstrela /> Mais escolhido
          </span>

          <span className="flex gap-3">
            <span
              aria-hidden
              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                combo ? 'border-accent bg-accent' : 'border-border'
              }`}
            >
              {combo && <span className="h-2 w-2 rounded-full bg-white" />}
            </span>

            <span className="min-w-0">
              <span className="block text-sm font-bold">
                {figure.comboTitle ??
                  (totalFotos === 2 ? 'Leve as 2 fotos' : `Leve as ${totalFotos} fotos`)}
              </span>

              <span className="mt-1.5 inline-block rounded-md bg-accent px-2 py-1 text-xs font-bold tracking-wide text-white uppercase">
                Sua foto vira {totalFotos} — por só + {formatBRL(incremento)}
              </span>

              <span className="mt-2 block text-xs leading-relaxed text-muted">
                {figure.comboPitch ?? (
                  <>
                    A <strong className="text-foreground">mesma selfie</strong> também com{' '}
                    {addons.join(' e ')}. Mesma cena, mesmo estilo, prontas junto com a primeira.
                  </>
                )}
              </span>

              {/* Só quando o combo é MESMO mais barato. Se alguém configurar um
                  preço em que não seja, o bloco some em vez de anunciar um
                  desconto que não existe. */}
              {descontoPct > 0 && (
                <span className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-danger px-2 py-1 text-[0.68rem] font-extrabold text-white uppercase">
                    −{descontoPct}% só agora
                  </span>
                  <span className="text-xs text-muted line-through">{formatBRL(avulso)}</span>
                  <span className="text-sm font-extrabold">+ {formatBRL(incremento)}</span>
                </span>
              )}
            </span>
          </span>
        </button>
      )}

      <button
        type="button"
        onClick={() => onContinuar(temBump && combo)}
        // `bg-green-deep` e não o `cta-gradient` da landing: é o verde escuro do
        // desenho. Aqui ele funciona porque o botão é o único elemento forte da
        // tela; na landing o mesmo tom competia com o bloco do CTA final.
        className="mt-6 w-full rounded-xl bg-green-deep px-6 py-4 text-base font-bold text-white shadow-soft transition hover:-translate-y-0.5 hover:brightness-110 focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
      >
        Pagar {formatBRL(total)} no Pix e baixar minha foto
      </button>

      {/* Diz o que vem A SEGUIR. Sem isto o botão parece que já cobra, e quem
          não quer ser cobrado no clique não clica. */}
      <p className="mt-3 text-center text-xs leading-relaxed text-muted">
        Na próxima tela você vê o QR Code — sua foto libera assim que o pagamento confirmar.
      </p>
    </div>
  );
}

/* Ícone inline pelo mesmo motivo da Landing: o `lucide-react` inteiro no bundle
   por um desenho não se paga numa página que abre em 4G. */

function IconEstrela() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-3 w-3 fill-current">
      <path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2Z" />
    </svg>
  );
}
