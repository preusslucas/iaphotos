import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isAuthenticated } from '@/lib/admin-auth';
import { criarFigura } from '../actions';

export const dynamic = 'force-dynamic';

const campo =
  'w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent';

export default async function NovaFigura() {
  if (!(await isAuthenticated())) notFound();

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-5 py-8">
      <header>
        <Link href="/admin" className="text-sm text-muted hover:underline">
          ← Painel
        </Link>
        <h1 className="mt-2 text-xl font-bold">Nova figura</h1>
        <p className="mt-1 text-sm text-muted">
          Ela nasce <strong>desligada</strong>. Depois de criar, cadastre as cenas e envie as fotos
          de referência — só então ligue. Sem esses dois, todo pedido dela ficaria retido sem
          gerar.
        </p>
      </header>

      <form action={criarFigura} className="space-y-4 rounded-xl border border-border bg-surface p-4">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Slug</span>
          <input name="slug" required placeholder="trump" className={campo} />
          <span className="mt-1 block text-xs text-muted">
            Letras minúsculas, números e hífen. Vira a URL e é gravado nos pedidos — não muda
            depois.
          </span>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium">Nome do produto</span>
          <input name="productName" required placeholder="Foto com o Trump" className={campo} />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium">Como a figura é chamada na copy</span>
          <input name="figureLabel" required placeholder="o Trump" className={campo} />
          <span className="mt-1 block text-xs text-muted">
            Nunca use o nome civil de uma pessoa real sem checar o risco jurídico.
          </span>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium">Headline</span>
          <input name="headline" required className={campo} />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium">Subheadline</span>
          <textarea name="subheadline" required rows={2} className={campo} />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium">Texto do botão</span>
          <input name="ctaLabel" required defaultValue="Quero a minha foto" className={campo} />
        </label>

        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Preço (R$)</span>
            <input name="priceCents" required defaultValue="19.90" className={campo} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Preço &quot;de&quot; (R$)</span>
            <input name="compareAtCents" className={campo} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Combo (R$)</span>
            <input name="bundlePriceCents" className={campo} />
          </label>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="isPrimary" />
          Tem landing própria
          <span className="text-muted">
            (deixe desmarcado para ela existir só como adicional no checkout)
          </span>
        </label>

        <button className="rounded-xl bg-accent px-5 py-2.5 text-sm font-bold text-white hover:bg-accent-hover">
          Criar figura
        </button>
      </form>
    </main>
  );
}
