import type { ReactNode } from 'react';
import { AI_DISCLAIMER, LEGAL_FOOTER } from '@/content/terms';

/** Peças compartilhadas pelas telas do funil. */

export function Button({
  children,
  onClick,
  disabled,
  type = 'button',
  variant = 'primary',
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: 'button' | 'submit';
  /**
   * `cta` é o botão que fecha a venda — degradê e o leve levantar no hover,
   * vindos da LP. Não é o padrão de propósito: se todo botão da tela levanta,
   * nenhum se destaca, e o único que precisa se destacar é o que cobra.
   * `primary` continua sendo o verde chapado dos avanços de passo.
   */
  variant?: 'primary' | 'ghost' | 'cta';
}) {
  // `transition` e não `transition-colors`: a variante `cta` também se desloca.
  // Quem desligou animação no sistema não vê nada disso — a regra de
  // `prefers-reduced-motion` no globals.css zera a duração.
  const base =
    'w-full rounded-xl px-6 py-4 text-base font-bold transition disabled:opacity-50 ' +
    'disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2';
  const styles = {
    primary: 'bg-accent text-white hover:bg-accent-hover focus-visible:outline-accent',
    ghost: 'bg-surface-2 text-foreground hover:bg-border focus-visible:outline-border',
    // `disabled:hover:*` desfaz o levantar quando o botão está travado: um
    // botão desabilitado que reage ao mouse parece clicável e não é.
    cta:
      'cta-gradient text-white shadow-soft hover:-translate-y-0.5 hover:brightness-110 ' +
      'disabled:hover:translate-y-0 disabled:hover:brightness-100 focus-visible:outline-accent',
  }[variant];

  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`${base} ${styles}`}>
      {children}
    </button>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    // `shadow-card` para o cartão descolar do degradê que agora pinta o body —
    // sem ele, o branco do card sobre o verde claro do fundo fica sem borda
    // percebida e a tela vira uma mancha só.
    <div className={`rounded-2xl border border-border bg-surface p-5 shadow-card ${className}`}>
      {children}
    </div>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger"
    >
      {message}
    </div>
  );
}

/**
 * O aviso de imagem sintética acompanha TODA imagem exibida, não só a final.
 * É a promessa que a landing faz ao usuário e o que sustenta a defesa de que o
 * produto nunca se apresentou como registro de um encontro real.
 *
 * `label` existe para a mídia que NÃO é sintética — hoje, só o vídeo da hero,
 * que é gravação de tela real e usa o `DEMO_DISCLAIMER`. O padrão continua
 * sendo o aviso de IA, de propósito: quem esquecer de passar o rótulo acerta,
 * e só quem afirma explicitamente que a mídia é real muda o texto.
 */
export function AiBadge({
  className = '',
  label = AI_DISCLAIMER,
}: {
  className?: string;
  label?: string;
}) {
  return (
    <span
      className={`inline-block rounded-md bg-black/70 px-2 py-1 text-[11px] leading-tight text-white/90 ${className}`}
    >
      {label}
    </span>
  );
}

export function LegalFooter() {
  return (
    <footer className="mt-16 border-t border-border px-5 py-8 text-center text-xs leading-relaxed text-muted">
      {LEGAL_FOOTER}
    </footer>
  );
}

export function Spinner({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-4" role="status" aria-live="polite">
      {/* `spinner-espera` isenta este elemento — e só ele — da regra de
          `prefers-reduced-motion` em globals.css. Ver a justificativa lá. */}
      <div className="spinner-espera h-10 w-10 animate-spin rounded-full border-4 border-border border-t-accent" />
      <p className="text-sm text-muted">{label}</p>
    </div>
  );
}

/**
 * Progresso numerado, e não bolinhas.
 *
 * "PASSO 2 DE 5" responde a pergunta que faz a pessoa desistir — "quanto falta?"
 * — de um jeito que bolinha nenhuma responde. Num funil de tráfego pago, saber
 * que o fim está perto é o que segura quem já investiu três cliques.
 */
export function StepDots({
  current,
  total,
  onBack,
}: {
  current: number;
  total: number;
  onBack?: () => void;
}) {
  const pct = Math.round((current / total) * 100);
  return (
    <div className="space-y-2">
      {/* O chip aparece uma vez so — estava escrito duas, "Passo 3 de 5" a
          esquerda e "PASSO 3 DE 5" no chip a direita, a mesma informacao em dois
          formatos lado a lado. A vaga da esquerda agora e do "Voltar", que e o
          que costuma ficar ali e faltava.

          `justify-between` so quando ha voltar: sem ele o chip precisa ficar
          sozinho na direita, e `justify-end` e quem garante isso. */}
      <div className={`flex items-center ${onBack ? 'justify-between' : 'justify-end'}`}>
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            // Alvo de toque generoso: o publico e mais velho, e um "Voltar"
            // pequeno demais e o tipo de coisa que faz a pessoa desistir em vez
            // de corrigir a escolha.
            className="-ml-2 rounded-lg px-2 py-1.5 text-sm font-semibold text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            <span aria-hidden>←</span> Voltar
          </button>
        )}
        <span className="rounded-full bg-surface-2 px-2.5 py-1 text-[11px] font-semibold text-muted">
          PASSO {current} DE {total}
        </span>
      </div>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-border"
        role="progressbar"
        aria-valuenow={current}
        aria-valuemin={1}
        aria-valuemax={total}
        aria-label={`Passo ${current} de ${total}`}
      >
        {/* Verde para amarelo: é o único lugar do funil onde a bandeira aparece
            inteira sem virar enfeite. O amarelo não carrega texto em lugar
            nenhum — sobre ele só quase-preto é legível. */}
        <span
          className="block h-full rounded-full bg-linear-to-r from-accent to-brasil transition-[width] duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Depoimento exibido DENTRO de um passo do funil.
 *
 * Fica entre a escolha e o botão de continuar de propósito: é o momento em que
 * a pessoa hesita, e prova social lida ali reduz o abandono. Um depoimento por
 * passo, alternando — repetir o mesmo em todas as telas tem efeito contrário.
 */
export function Depoimento({
  name,
  city,
  text,
}: {
  name: string;
  city: string;
  text: string;
}) {
  return (
    <figure className="rounded-2xl bg-surface-2 p-4">
      <blockquote className="text-sm text-muted">“{text}”</blockquote>
      <figcaption className="mt-2 text-xs font-semibold">
        — {name} <span className="font-normal text-muted">· {city}</span>
      </figcaption>
    </figure>
  );
}
