import { redirect } from 'next/navigation';
import { isAuthenticated } from '@/lib/admin-auth';

/**
 * Ferramentas compartilhadas pelas Server Actions do /admin.
 *
 * Fica FORA de um arquivo `'use server'` de proposito: um modulo marcado assim
 * so pode exportar funcao assincrona, e aqui ha uma classe e um `never`.
 */

/**
 * Toda acao verifica a sessao por conta propria.
 *
 * Server Actions sao endpoints HTTP de verdade — quem descobrir o id da acao
 * pode chama-la sem nunca carregar a pagina. Confiar na protecao do layout
 * deixaria o painel inteiro aberto para qualquer um.
 */
export async function requireAdmin() {
  if (!(await isAuthenticated())) throw new Error('não autorizado');
}

/** Erro de validacao, com mensagem escrita para quem opera o painel. */
export class ErroDeUso extends Error {}

export function erro(mensagem: string): never {
  throw new ErroDeUso(mensagem);
}

/**
 * Faz a mensagem de erro CHEGAR na tela.
 *
 * Server Action que lanca vira 500 opaco em producao: o Next troca a mensagem
 * por um `digest` e o unico jeito de saber o que houve e abrir o log do
 * servidor. Foi exatamente o que aconteceu com "Imagem pequena demais" — a
 * validacao funcionou, a mensagem existia, e mesmo assim a tela mostrou um erro
 * incompreensivel.
 *
 * Aqui a mensagem volta como query string e a pagina a renderiza. Funciona com
 * formulario puro, sem precisar transformar a pagina em Client Component.
 *
 * `redirect()` sinaliza por excecao, entao ela precisa passar batido — dai a
 * checagem do digest `NEXT_` antes de tratar qualquer coisa como falha.
 */
export async function comAviso<T>(destino: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    const digest = (e as { digest?: unknown } | null)?.digest;
    if (typeof digest === 'string' && digest.startsWith('NEXT_')) throw e;

    const mensagem =
      e instanceof ErroDeUso
        ? e.message
        : 'Não deu para concluir. Veja o log da aplicação para o motivo.';

    if (!(e instanceof ErroDeUso)) console.error('[admin] falha inesperada:', e);

    redirect(`${destino}?erro=${encodeURIComponent(mensagem)}`);
  }
}
