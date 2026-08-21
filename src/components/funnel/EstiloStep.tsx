'use client';

import { Button, Depoimento } from '@/components/ui';

/**
 * Passos de ENQUADRAMENTO e CLIMA.
 *
 * As opções não são decorativas: cada uma troca um bloco do prompt final, e
 * todas passaram por medição em 2026-08-14 antes de chegarem aqui (spike,
 * variantes `enq-*` e `clima-*`). Se você acrescentar uma opção nova, meça
 * antes — o bloco de enquadramento é o mesmo que, mal escrito, derrubou a
 * semelhança para nota 1 de 5 numa rodada anterior.
 *
 * Um passo por escolha, e não os dois na mesma tela, de propósito: escolha
 * curta é escolha feita, e cada avanço é um compromisso a mais de quem está
 * comprando.
 */

export type FramingId = 'CHEST_UP' | 'HALF_BODY' | 'CLOSE_SELFIE';
export type MoodId = 'NONE' | 'DISCREET' | 'FLAGS' | 'CROWD';

const ENQUADRAMENTOS: { id: FramingId; label: string; hint: string }[] = [
  {
    id: 'CHEST_UP',
    label: 'Peito para cima',
    hint: 'O clássico: os dois bem próximos, rostos grandes.',
  },
  {
    id: 'HALF_BODY',
    label: 'Meio corpo',
    hint: 'Mostra mais do cenário em volta de vocês.',
  },
  {
    id: 'CLOSE_SELFIE',
    label: 'Selfie próxima',
    hint: 'Bem de pertinho, rosto a rosto.',
  },
];

const CLIMAS: { id: MoodId; label: string; hint: string }[] = [
  {
    id: 'NONE',
    // "foto de exemplo" ficou orfao: o texto nasceu quando cada cena tinha
    // miniatura na tela de escolha, e mandava o cliente comparar com uma imagem
    // que ele nao ve mais. O que esta opcao faz e nao sobrescrever a cena.
    label: 'Como no cenário escolhido',
    hint: 'Não muda nada — vale o clima da cena que você marcou.',
  },
  {
    id: 'DISCREET',
    label: 'Patriota discreta',
    hint: 'Mais sóbrio, sem multidão e quase sem bandeiras.',
  },
  { id: 'FLAGS', label: 'Evento com bandeiras', hint: 'Clima de ato, bandeiras por todo lado.' },
  { id: 'CROWD', label: 'Encontro popular', hint: 'Gente em volta, clima de encontro caloroso.' },
];

function Escolha<T extends string>({
  titulo,
  ajuda,
  opcoes,
  valor,
  onChange,
  onNext,
  depoimento,
}: {
  titulo: string;
  ajuda: string;
  opcoes: { id: T; label: string; hint: string }[];
  valor: T;
  onChange: (id: T) => void;
  onNext: () => void;
  depoimento?: { name: string; city: string; text: string } | null;
}) {
  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">{titulo}</h1>
        <p className="text-sm text-muted">{ajuda}</p>
      </header>

      <div className="space-y-3">
        {opcoes.map((o) => {
          const marcado = valor === o.id;
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => onChange(o.id)}
              aria-pressed={marcado}
              className={`flex w-full items-start justify-between gap-3 rounded-2xl border-2 p-4 text-left transition-colors ${
                marcado ? 'border-accent bg-accent/5' : 'border-border hover:border-muted'
              }`}
            >
              <span className="min-w-0">
                <span className="block font-semibold">{o.label}</span>
                <span className="mt-0.5 block text-sm text-muted">{o.hint}</span>
              </span>
              <span
                aria-hidden
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 text-xs ${
                  marcado ? 'border-accent bg-accent text-white' : 'border-border'
                }`}
              >
                {marcado && '✓'}
              </span>
            </button>
          );
        })}
      </div>

      {depoimento && <Depoimento {...depoimento} />}

      <Button onClick={onNext}>Continuar →</Button>
    </div>
  );
}

export function EnquadramentoStep(props: {
  valor: FramingId;
  onChange: (id: FramingId) => void;
  onNext: () => void;
  depoimento?: { name: string; city: string; text: string } | null;
}) {
  return (
    <Escolha
      titulo="Defina o enquadramento"
      ajuda="Quanto mais claro o objetivo, melhor a IA ajusta pose, luz e formato da imagem."
      opcoes={ENQUADRAMENTOS}
      {...props}
    />
  );
}

export function ClimaStep(props: {
  valor: MoodId;
  onChange: (id: MoodId) => void;
  onNext: () => void;
  depoimento?: { name: string; city: string; text: string } | null;
}) {
  return (
    <Escolha
      titulo="Escolha o clima da imagem"
      ajuda="Isso muda o ambiente em volta de vocês — o rosto continua o seu."
      opcoes={CLIMAS}
      {...props}
    />
  );
}
