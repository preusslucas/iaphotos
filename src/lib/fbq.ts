'use client';

/**
 * Meta Pixel. Os três blocos que a Meta entrega no painel são o MESMO pixel
 * repetido com um evento diferente em cada um — copiar os três inteiros na
 * página carregaria o `fbevents.js` três vezes e dispararia `init` três vezes.
 * Aqui o carregamento fica num lugar só (`MetaPixel`) e cada evento é uma
 * chamada de `fbTrack` no ponto do funil em que ele de fato acontece.
 */

type Fbq = (...args: unknown[]) => void;

declare global {
  interface Window {
    fbq?: Fbq;
  }
}

/**
 * Dispara um evento. Nunca lança: bloqueador de anúncio, falha de rede ou
 * evento disparado antes do script terminar de carregar são o caso comum, e
 * nenhum deles pode derrubar a tela de quem está comprando.
 */
export function fbTrack(
  event: string,
  params?: Record<string, unknown>,
  /**
   * Chave de deduplicação com a Conversions API (`src/lib/meta.ts`), que manda
   * o `Purchase` do servidor com `event_id` igual ao id do pedido. Sem passar o
   * mesmo valor aqui, os dois eventos chegam e a Meta conta DUAS compras — o
   * ROAS do anúncio sairia pelo dobro.
   */
  eventId?: string,
): void {
  try {
    window.fbq?.('track', event, params, eventId ? { eventID: eventId } : undefined);
  } catch (err) {
    console.warn('[fbq] evento não enviado', event, err);
  }
}

/**
 * Igual a `fbTrack`, mas só dispara uma vez por chave, para sempre — a marca
 * fica no localStorage. Existe por causa do `Purchase`: a tela de resultado é
 * feita para ser reaberta (o rascunho sobrevive ao F5, é o único caminho até a
 * foto paga), e sem isto cada reabertura contaria uma venda nova para a Meta.
 */
export function fbTrackOnce(
  key: string,
  event: string,
  params?: Record<string, unknown>,
  eventId?: string,
): void {
  const storageKey = `ia-photos:fb:${key}`;
  try {
    if (localStorage.getItem(storageKey)) return;
    localStorage.setItem(storageKey, '1');
  } catch {
    // localStorage indisponível (aba anônima com storage bloqueado): melhor
    // arriscar contar duas vezes do que não contar a venda.
  }
  fbTrack(event, params, eventId);
}
