import type { Metadata } from 'next';
import { MetaPixel } from '@/components/MetaPixel';
import './globals.css';

export const metadata: Metadata = {
  title: 'Foto IA',
  description: 'Sua foto criada por inteligência artificial.',
  // Landing de tráfego pago não quer indexação: o que traz visita é o anúncio,
  // e página indexada só rende comparação de preço e cópia por concorrente.
  robots: { index: false, follow: false },
};

export const viewport = {
  themeColor: '#0b0d10',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    // Sem next/font: o público majoritário vem de 4G, e a fonte do sistema
    // pinta imediatamente em vez de custar um request no caminho crítico.
    <html lang="pt-BR" className="h-full">
      <body className="flex min-h-full flex-col">
        {children}
        <MetaPixel />
      </body>
    </html>
  );
}
