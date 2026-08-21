import { redirect } from 'next/navigation';
import { listPrimarySlugs } from '@/content';

/**
 * A raiz não é um produto — cada figura vive na própria rota, que é para onde
 * o anúncio aponta. Mandamos para a primeira publicada para que um acesso
 * direto ao domínio não caia numa página vazia.
 */
export const dynamic = 'force-dynamic';

export default async function Home() {
  const slugs = await listPrimarySlugs();
  redirect(`/${slugs[0] ?? 'patriota'}`);
}
