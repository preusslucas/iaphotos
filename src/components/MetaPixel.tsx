import Script from 'next/script';

/**
 * O ID vive em env para trocar de conta sem deploy; o literal é o fallback.
 *
 * Declarado AQUI, e não junto do `fbq.ts`: aquele arquivo é `'use client'`, e
 * uma constante exportada de um módulo cliente chega ao servidor como
 * referência, não como valor — o `init` saía com o corpo de uma função de erro
 * no lugar do número, e o pixel não registrava nada.
 */
const FB_PIXEL_ID = process.env.NEXT_PUBLIC_FB_PIXEL_ID || '2173827586776379';

/**
 * Carrega o `fbevents.js`, faz o `init` e conta o `PageView`.
 *
 * `afterInteractive` (o padrão do next/script) de propósito: o público vem de
 * 4G e nada de terceiro pode disputar o caminho crítico com a landing —
 * `beforeInteractive` colocaria o script da Meta na frente da própria página.
 *
 * O `PageView` sai daqui e só daqui. Os outros eventos do funil
 * (`InitiateCheckout`, `Purchase`) são disparados por `fbTrack` no passo
 * correspondente, sem recarregar nada.
 */
export function MetaPixel() {
  return (
    <>
      <Script id="meta-pixel" strategy="afterInteractive">
        {`!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${FB_PIXEL_ID}');
fbq('track', 'PageView');`}
      </Script>
      <noscript>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          height="1"
          width="1"
          style={{ display: 'none' }}
          alt=""
          src={`https://www.facebook.com/tr?id=${FB_PIXEL_ID}&ev=PageView&noscript=1`}
        />
      </noscript>
    </>
  );
}
