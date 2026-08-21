import type { PublicFigure, PublicScene } from '@/content';
import { Button } from '@/components/ui';

/**
 * Escolha do cenario: lista vertical de cards com icone, nome e frase.
 *
 * Era um grid de duas colunas com uma miniatura por cena. Cada miniatura era uma
 * imagem que so podia ser produzida GERANDO de verdade — cinco por figura, e a
 * figura nao podia entrar no ar sem elas. Virou o gargalo do lancamento.
 *
 * Lista vertical e nao grid porque o texto agora e o que informa: em duas
 * colunas no celular a frase de apoio quebra em quatro linhas e fica ilegivel.
 */
export function SceneStep({
  figure,
  selected,
  onSelect,
  onNext,
}: {
  figure: PublicFigure;
  selected: PublicScene | null;
  onSelect: (scene: PublicScene) => void;
  onNext: () => void;
}) {
  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">Primeiro, escolha o cenário da sua foto</h1>
        <p className="text-sm text-muted">
          Quanto mais claro o objetivo, melhor a IA ajusta pose, luz e formato da imagem.
        </p>
      </header>

      <div className="space-y-3">
        {figure.scenes.map((scene) => {
          const isSelected = selected?.id === scene.id;
          return (
            <button
              key={scene.id}
              type="button"
              onClick={() => onSelect(scene)}
              aria-pressed={isSelected}
              className={`flex w-full items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left transition-colors ${
                isSelected ? 'border-accent bg-accent/5' : 'border-border hover:border-muted'
              }`}
            >
              <span
                aria-hidden
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface-2 text-xl"
              >
                {/* Cena sem icone cadastrado nao deixa um buraco no card. */}
                {scene.icon ?? '📷'}
              </span>

              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{scene.label}</span>
                <span className="block text-sm text-muted">{scene.hint}</span>
              </span>

              {/* Circulo de radio desenhado a mao: o card inteiro e o alvo de
                  toque, e um <input> real aqui roubaria o clique da metade da
                  area no iOS. O `aria-pressed` do botao ja diz o estado. */}
              <span
                aria-hidden
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${
                  isSelected ? 'border-accent bg-accent' : 'border-border'
                }`}
              >
                {isSelected && (
                  <svg viewBox="0 0 24 24" className="h-4 w-4 text-white" fill="none" strokeWidth={3}>
                    <path d="M5 13l4 4L19 7" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </span>
            </button>
          );
        })}
      </div>

      <Button onClick={onNext} disabled={!selected}>
        {selected ? 'Continuar' : 'Escolha um cenário'}
      </Button>
    </div>
  );
}
