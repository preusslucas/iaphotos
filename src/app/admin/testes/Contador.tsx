'use client';

import { useEffect, useState } from 'react';

/** O que o provedor cobra por imagem. Espelha GPT_IMAGE_2_COST_USD_CENTS. */
const CUSTO_POR_IMAGEM_USD = 0.005;

/**
 * Conta as combinacoes marcadas e diz quanto vai custar, antes do clique.
 *
 * Existe porque a versao anterior so informava o total DEPOIS de recusar: a
 * pessoa marcava tudo, clicava, e levava um erro vermelho dizendo que 60 era
 * demais. O numero que ela precisava para decidir chegava tarde e como bronca.
 *
 * Le o formulario pelo DOM em vez de controlar cada checkbox por estado. Sao
 * caixas de selecao comuns num formulario que continua funcionando sem
 * JavaScript — transformar as tres listas em componentes controlados so para
 * exibir um numero trocaria um `useEffect` por trinta linhas de estado e
 * quebraria o envio sem JS.
 */
export function Contador() {
  const [total, setTotal] = useState(0);

  useEffect(() => {
    const form = document.getElementById('form-bancada') as HTMLFormElement | null;
    if (!form) return;

    const conta = () => {
      const marcadas = (nome: string) =>
        form.querySelectorAll<HTMLInputElement>(`input[name="${nome}"]:checked`).length;
      setTotal(marcadas('cena') * marcadas('enquadramento') * marcadas('clima'));
    };

    conta();
    form.addEventListener('change', conta);
    return () => form.removeEventListener('change', conta);
  }, []);

  const custo = total * CUSTO_POR_IMAGEM_USD;

  return (
    <div className="rounded-lg bg-surface-2 px-3 py-2.5 text-sm">
      {total === 0 ? (
        <span className="text-muted">
          Marque pelo menos uma cena, um enquadramento e um clima.
        </span>
      ) : (
        <span>
          <strong>{total}</strong> {total === 1 ? 'imagem' : 'imagens'} ·{' '}
          <strong>US${custo.toFixed(3)}</strong>
          <span className="text-muted"> (cenas × enquadramentos × climas)</span>
        </span>
      )}
    </div>
  );
}
