import { notFound } from 'next/navigation';
import { Funnel } from '@/components/funnel/Funnel';
import { getFigure, toPublicFigure } from '@/content';

/**
 * Segunda metade do funil: preço, pagamento e entrega.
 *
 * Existe como rota, e não como mais um passo em memória de `/[figura]`, porque
 * é assim que a LP do Lovable era desenhada — a oferta lá era `/oferta`, uma
 * página com endereço próprio. O que uma URL dá que um passo não dá:
 *
 * - O "voltar" do navegador funciona. Num funil de passo em memória ele sai do
 *   site inteiro, que é a forma mais cara possível de perder uma venda.
 * - O pedido em andamento tem um lugar para onde ser mandado de volta. Quem
 *   fecha a aba para abrir o app do banco e reabre o site cai direto na tela do
 *   Pix, em vez de na landing com o pedido escondido atrás de três cliques.
 * - Dá para medir. `/[figura]` e `/[figura]/oferta` são dois eventos de página
 *   distintos no pixel, e a queda entre elas é justamente o número que decide
 *   se a oferta está cara ou a tela está confusa.
 *
 * A rota NÃO valida se existe pedido: quem faz isso é o `Funnel`, no cliente,
 * lendo o rascunho do localStorage — que é onde o pedido vive. Chegar aqui sem
 * rascunho devolve a pessoa para a landing. O servidor não tem como saber, e
 * fingir que sabe custaria um cookie de sessão que o funil não usa.
 *
 * `force-dynamic` pelo mesmo motivo de `/[figura]`: o kill switch e os preços
 * precisam valer no request, não no build.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata(props: PageProps<'/[figura]/oferta'>) {
  const { figura } = await props.params;
  const figure = await getFigure(figura);
  if (!figure) return {};

  return {
    title: `Liberar a sua foto | ${figure.productName}`,
    description: figure.subheadline,
    robots: { index: false, follow: false },
  };
}

export default async function OfertaPage(props: PageProps<'/[figura]/oferta'>) {
  const { figura } = await props.params;

  const figure = await getFigure(figura);
  if (!figure || !figure.isPrimary) notFound();

  // Kill switch: vale aqui também. Uma figura desligada não pode continuar
  // vendendo por quem já estava com a oferta aberta — que é exatamente o caso
  // em que desligar importa. Sem CTA e sem preço: a landing explica o resto.
  if (!figure.enabled) notFound();

  return <Funnel figure={toPublicFigure(figure)} inicio="oferta" />;
}
