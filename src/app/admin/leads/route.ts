import { isAuthenticated } from '@/lib/admin-auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * Exporta os contatos em CSV.
 *
 * Sem isto os e-mails e telefones ficam presos no banco e a unica saida e
 * abrir o psql — o dado e coletado e nunca usado. Traz TODOS os pedidos, e nao
 * so os pagos: quem chegou ao checkout e desistiu e justamente o lead que vale
 * recuperar.
 *
 * Sao dados pessoais sob a LGPD. Baixou, virou sua responsabilidade: guarde em
 * lugar controlado, nao mande para planilha compartilhada com o time inteiro, e
 * apague a copia quando nao precisar mais.
 */
export async function GET() {
  if (!(await isAuthenticated())) {
    return new Response('não autorizado', { status: 401 });
  }

  const orders = await prisma.order.findMany({
    where: { OR: [{ email: { not: null } }, { phone: { not: null } }] },
    orderBy: { createdAt: 'desc' },
    select: {
      createdAt: true,
      email: true,
      phone: true,
      figureSlug: true,
      sceneId: true,
      status: true,
      amountCents: true,
      paidAt: true,
    },
  });

  const linhas = orders.map((o) =>
    [
      o.createdAt.toISOString(),
      o.email ?? '',
      o.phone ?? '',
      o.figureSlug,
      o.sceneId,
      o.status,
      (o.amountCents / 100).toFixed(2),
      o.paidAt ? 'sim' : 'nao',
    ]
      .map(csv)
      .join(','),
  );

  const conteudo = [
    'criado_em,email,telefone,figura,cena,status,valor_brl,pagou',
    ...linhas,
  ].join('\n');

  return new Response('﻿' + conteudo, {
    headers: {
      // O BOM no inicio e para o Excel em portugues abrir acentuacao correta —
      // sem ele "Comício" vira "ComÃ­cio" e a planilha chega ilegivel.
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="leads-${new Date().toISOString().slice(0, 10)}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}

/**
 * Escapa um campo de CSV.
 *
 * O apostrofo antes de `= + - @` nao e frescura: Excel e Google Sheets tratam
 * uma celula que comeca com esses caracteres como FORMULA. Um e-mail digitado
 * como `=cmd|...` viraria execucao ao abrir a planilha. Como o conteudo vem de
 * formulario publico, tem de ser neutralizado na saida.
 */
function csv(valor: string): string {
  const seguro = /^[=+\-@\t\r]/.test(valor) ? `'${valor}` : valor;
  return `"${seguro.replace(/"/g, '""')}"`;
}
