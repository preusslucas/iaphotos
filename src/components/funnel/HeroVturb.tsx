'use client';

import { useEffect, useRef } from 'react';

/**
 * Vídeo do topo hospedado no VTurb (ConverteAI), em vez de um arquivo em
 * `public/`.
 *
 * O que a troca ganha e o que ela custa:
 *
 * - **O arquivo sai do repositório e da imagem Docker.** Os 3,46 MB do
 *   `patriota.mp4` viajavam em todo build e eram servidos pelo mesmo processo
 *   Next que precisa responder o checkout. Agora vêm do CDN deles, em HLS — o
 *   player baixa por pedaços e escolhe a qualidade pela banda, que é o certo
 *   para um público em 4G.
 * - **O player cuida do som sozinho**, com o "clique para ouvir" que o nosso
 *   `HeroVideo` fazia à mão. Por isso o nosso botão saiu: dois controles de som
 *   sobre o mesmo vídeo brigam.
 * - **Ele passa a medir retenção**, que é o motivo de existir de um player de
 *   VSL. Vem com o custo de um terceiro recebendo dado de quem visita a landing
 *   — igual ao Meta Pixel, e igualmente precisa estar na política de
 *   privacidade.
 *
 * Dos dois embeds do painel, este é o de JAVASCRIPT e não o de IFRAME. O de
 * iframe depende de um `onload=""` inline que reatribui `this.onload` e
 * `this.src`; em JSX isso não existe, e reimplementá-lo seria assumir cola de
 * terceiro que quebra em silêncio quando eles mudarem o `embed.html`.
 */

const CONTA = process.env.NEXT_PUBLIC_VTURB_ACCOUNT_ID;
const PLAYER = process.env.NEXT_PUBLIC_VTURB_PLAYER_ID;

/** Configurado o bastante para desenhar o player. */
export const temVturb = Boolean(CONTA && PLAYER);

const SRC_PLAYER = `https://scripts.converteai.net/${CONTA}/players/${PLAYER}/v4/player.js`;
/** Id da nossa tag de script, para conseguirmos removê-la e reexecutá-la. */
const ID_SCRIPT = 'vturb-player-js';

/**
 * O placeholder do embed. O `padding: 177.777%` é o truque antigo de proporção
 * — altura de padding percentual é calculada sobre a LARGURA — e reserva um
 * bloco 9:16 antes de o player existir. Sem ele a página salta quando o vídeo
 * entra, no topo da única página que recebe tráfego pago.
 */
const PLACEHOLDER =
  '<div class="vturb-player-placeholder" style="position:relative;width:100%;' +
  'padding:177.77777777777777% 0 0;z-index:0;background-color:black;"></div>';

/**
 * Ligado por `?vturb=debug` na URL, e não por `NODE_ENV`.
 *
 * A diferença importa: o sintoma pode aparecer só em produção, e um diagnóstico
 * que só existe em desenvolvimento não serve para o caso que a gente não
 * consegue reproduzir. Fora da URL com a flag, nada disto roda.
 */
const DEPURAR =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('vturb') === 'debug';

/**
 * Escreve na tela o que o player conseguiu ou não fazer.
 *
 * Na tela, e não no console, porque o console deste projeto passa pelo Console
 * Ninja, cujo suporte a Turbopack é parcial — já perdemos uma rodada inteira
 * atrás de um `console.log` que rodava e não aparecia.
 */
function diagnostico(alvo: HTMLElement) {
  const linhas: string[] = [];
  const painel = document.createElement('pre');
  painel.style.cssText =
    'margin:8px 0;padding:10px;background:#111;color:#eee;font:11px/1.5 monospace;' +
    'white-space:pre-wrap;word-break:break-word;border-radius:8px;max-height:50vh;overflow:auto';
  alvo.after(painel);

  const anota = (t: string) => {
    linhas.push(t);
    painel.textContent = linhas.join('\n');
  };

  for (const nivel of ['error', 'warn'] as const) {
    const original = console[nivel];
    console[nivel] = (...args: unknown[]) => {
      anota(nivel.toUpperCase() + ': ' + args.map(String).join(' '));
      original(...args);
    };
  }
  window.addEventListener('error', (e) =>
    anota(`JS ERROR: ${e.message} @ ${e.filename || '?'}:${e.lineno}`),
  );

  setTimeout(() => {
    const el = document.getElementById(`vid-${PLAYER}`);
    anota('--- depois de 8s ---');
    anota('elemento no documento: ' + !!(el && el.isConnected));
    anota('custom element registrado: ' + !!customElements.get('vturb-smartplayer'));
    anota('smartplayer.js injetado: ' + !!document.getElementById('vturb-smartplayer-js'));
    anota('tags player.js na pagina: ' + document.querySelectorAll(`script[src="${SRC_PLAYER}"]`).length);
    anota('elementos vturb na pagina: ' + document.querySelectorAll('vturb-smartplayer').length);
    anota('tem <video> dentro: ' + !!el?.querySelector('video'));
    anota('altura renderizada: ' + (el ? Math.round(el.getBoundingClientRect().height) : '-'));
  }, 8000);
}

/**
 * O bloco EXATO do embed do painel: o elemento, o placeholder dentro dele e o
 * script logo em seguida.
 *
 * Serializado como HTML e não montado em JSX ou por `createElement` — as duas
 * abordagens anteriores, e as duas falharam. O que a página estática tem e
 * nenhuma delas tinha é o script rodando DURANTE O PARSE do documento, na mesma
 * passada em que o elemento nasce. Injetado depois (por `next/script` ou por um
 * efeito), o `player.js` corre numa ordem que ele não espera.
 *
 * Como isto sai no HTML da resposta do servidor, o parser do navegador executa o
 * script sozinho, exatamente como no arquivo que funciona.
 */
const EMBED =
  `<vturb-smartplayer id="vid-${PLAYER}" ` +
  // `border-radius` e `overflow` são acréscimos nossos ao estilo do embed, e os
  // únicos: arredondam o VÍDEO para ele acompanhar a moldura amarela em vez de
  // aparecer com os cantos quadrados por baixo dela. O container já recorta,
  // mas repetir aqui garante o arredondado mesmo se o player criar um contexto
  // de empilhamento próprio lá dentro.
  //
  // 0.75rem contra o `rounded-2xl` (1rem) do container: a diferença é a
  // espessura da borda (4px), que é o que faz os dois raios ficarem
  // concêntricos em vez de a moldura parecer mais grossa nos cantos.
  `style="display:block;margin:0 auto;width:100%;max-width:400px;` +
  `border-radius:0.75rem;overflow:hidden;">` +
  PLACEHOLDER +
  `</vturb-smartplayer>` +
  `<script>var s=document.createElement("script");` +
  `s.src="${SRC_PLAYER}",s.async=!0,document.head.appendChild(s);</script>`;

export function HeroVturb() {
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const alvo = caixa.current;
    if (!temVturb || !alvo) return;

    /**
     * Rede de segurança para a NAVEGAÇÃO DE CLIENTE.
     *
     * `innerHTML` não executa `<script>`. Na primeira visita isso não importa —
     * o bloco acima veio no HTML do servidor e o parser rodou o script. Mas o
     * "Fazer outra foto" volta para cá com `router.push`, sem recarregar o
     * documento, e aí o React monta o mesmo HTML sem que nada o execute.
     *
     * Só age quando o script REALMENTE não está na página, para não duplicar o
     * `player.js` no caminho normal.
     */
    if (document.getElementById(ID_SCRIPT)) return;

    const script = document.createElement('script');
    script.id = ID_SCRIPT;
    script.src = SRC_PLAYER;
    script.async = true;
    document.head.appendChild(script);

    if (DEPURAR) diagnostico(alvo);
  }, []);

  if (!temVturb) return null;

  return (
    <>
      {/* Sem `preload` aqui. Eles adiantam o DOWNLOAD do `player.js` e do
          `smartplayer.js` de forma independente, e o `player.js` chama
          `start()` no elemento logo depois de pedir o `smartplayer.js` — se a
          ordem de chegada inverter, ele chama um método que ainda não existe.
          A página estática que funciona não tem preload nenhum, e enquanto o
          player não estiver estável não vale otimizar o caminho.

          `preconnect` e `dns-prefetch` ficam: eles só abrem conexão, não
          buscam bytes, então não têm como reordenar nada. */}
      <link rel="preconnect" href="https://scripts.converteai.net" />
      <link rel="preconnect" href="https://cdn.converteai.net" />
      <link rel="dns-prefetch" href="https://images.converteai.net" />
      <link rel="dns-prefetch" href="https://license.vturb.com" />

      {/*
        `isolate` cria um contexto de empilhamento no container.

        Sem ele, os `z-index` internos do player competem no MESMO contexto que
        a estrela do canto (que é irmã deste bloco, com `z-10`) — e o player,
        que usa valores altos nas suas camadas de UI, passava por cima dela.
        Com o contexto isolado, tudo o que é do player fica confinado abaixo, e
        a estrela volta a ficar na frente sem precisar de uma corrida de
        `z-index`.

        `isolation` é seguro aqui, ao contrário de `transform`: ele não vira
        bloco contentor para `position:fixed`, então a tela cheia do player
        continua funcionando.

        SEM `aspect-9/16`: o placeholder do embed já reserva a altura 9:16 no
        HTML do servidor. Fixar a altura aqui também criava duas reservas
        disputando, e a sobra entre elas era onde aparecia o fundo roxo do
        player. Deixando só o placeholder mandar, o container encosta exatamente
        no vídeo.

        `overflow-hidden` recorta no raio INTERNO da moldura — o navegador
        desconta a espessura da borda sozinho, então o corte sai concêntrico com
        o amarelo.
      */}
      <div
        ref={caixa}
        className="isolate overflow-hidden rounded-2xl border-4 border-brasil bg-black shadow-card"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: EMBED }}
      />
    </>
  );
}
