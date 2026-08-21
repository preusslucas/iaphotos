'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CONSENT_TEXT } from '@/content/terms';
import { Button, Card, ErrorBanner } from '@/components/ui';
import { extOf } from '@/lib/client-api';

const MAX_BYTES = 10 * 1024 * 1024;
const MIN_SIDE = 512;

/**
 * Escolha da selfie + consentimento.
 *
 * A validação roda aqui ANTES de o arquivo subir: descobrir que a foto é
 * pequena demais depois de esperar o upload de 8MB no 4G é a hora mais cara
 * possível de dar a má notícia. O servidor valida de novo, porque validação de
 * cliente não é garantia de nada.
 */
export function UploadStep({
  onConfirm,
  busy,
}: {
  onConfirm: (file: File) => void;
  busy: boolean;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [temCamera, setTemCamera] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  /**
   * O aviso sobre afastar o braço só faz sentido em celular: é lá que existe a
   * opção de fotografar na hora. `navigator` não existe durante o SSR, então a
   * checagem roda depois da montagem.
   */
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTemCamera(
      typeof navigator !== 'undefined' &&
        (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
          // iPad moderno se identifica como Mac; a presença de toque desempata.
          (navigator.maxTouchPoints ?? 0) > 1),
    );
  }, []);

  // A URL é derivada do arquivo, não um estado próprio: guardá-la em useState
  // criaria um render extra e um caminho onde as duas coisas discordam.
  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);

  // createObjectURL reserva memória até ser revogado; sem isto, trocar de foto
  // várias vezes vaza a imagem anterior a cada troca.
  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  async function pick(chosen: File | undefined) {
    setError(null);
    if (!chosen) return;

    if (!extOf(chosen)) {
      // O caso real aqui é iPhone entregando HEIC. "Use JPG, PNG ou WEBP" é
      // verdade e não ajuda ninguém: quem tirou a foto no iPhone não sabe o que
      // é HEIC nem como converter. A saída que funciona é o print.
      const heic = /\.hei[cf]$/i.test(chosen.name);
      setError(
        heic
          ? 'Esse formato do iPhone (HEIC) não abre aqui. Abra a foto na galeria, tire um print e envie o print — ou desative "Alta eficiência" na câmera.'
          : 'Use uma foto JPG, PNG ou WEBP.',
      );
      return;
    }
    if (chosen.size > MAX_BYTES) {
      setError(`Essa foto tem ${(chosen.size / 1024 / 1024).toFixed(1)}MB. O limite é 10MB.`);
      return;
    }

    const size = await imageSize(chosen);
    if (!size) {
      setError('Não conseguimos ler essa imagem. Tente outra.');
      return;
    }
    if (Math.min(size.width, size.height) < MIN_SIDE) {
      setError(`Essa foto é pequena (${size.width}x${size.height}). Envie uma maior que 512 pixels.`);
      return;
    }

    setFile(chosen);
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2 text-center">
        <h1 className="text-2xl font-bold">Envie a sua foto</h1>
        {/*
          Esta instrução saiu dos dados da Fase 0, e é o oposto do que o
          instinto manda pedir. As fotos que funcionaram foram de meio corpo ao
          ar livre; os closes de rosto falharam TODOS. Faz sentido: o modelo
          está editando a foto para uma cena de duas pessoas em pé ao ar livre —
          quanto mais parecida a entrada, melhor o resultado.
        */}
        <p className="text-sm text-muted">
          Uma foto sua de <strong className="text-foreground">meio corpo ou corpo inteiro</strong>,
          de preferência ao ar livre e de dia. Você sozinho na foto.
        </p>
      </header>

      <div className="rounded-xl border border-border bg-surface p-4 text-sm">
        <p className="mb-2 font-semibold">O que funciona melhor</p>
        <ul className="space-y-1 text-muted">
          <li>✓ Você sozinho, de corpo inteiro ou até a cintura</li>
          <li>✓ Luz do dia, ao ar livre</li>
          <li>✗ Foto com outras pessoas — não sabemos qual é você</li>
          <li>✗ Selfie de espelho ou de baixo para cima</li>
        </ul>
      </div>

      {/*
        Um input só. No celular ele já abre a folha nativa do sistema — "Tirar
        foto", "Fotos", "Arquivos" — então um botão separado de câmera seria
        outro caminho para a MESMA tela.

        SEM `capture`: o atributo pularia direto para a câmera, tirando da
        pessoa a opção de escolher uma foto que ela já tem.

        `accept="image/*"` e não a lista restrita: no Android, restringir os
        tipos costuma esconder a opção de câmera na folha. Quem cuida de formato
        inválido é a validação acima, com mensagem legível.
      */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => void pick(e.target.files?.[0])}
      />

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="flex min-h-56 w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border p-6 transition-colors hover:border-muted"
      >
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- blob local, next/image não serve
          <img
            src={previewUrl}
            alt="Prévia da sua selfie"
            className="max-h-64 rounded-xl object-contain"
          />
        ) : (
          <>
            <span aria-hidden className="text-4xl">
              📷
            </span>
            <span className="font-semibold">Toque para enviar sua foto</span>
            <span className="text-xs text-muted">Tire na hora ou escolha da galeria · até 10MB</span>
          </>
        )}
      </button>

      {/*
        Quem tira na hora produz selfie de braço esticado — rosto grande e fundo
        curto. É o oposto do que os dados pedem: closes de rosto falharam na
        Fase 0, e as duas fotos que MAIS funcionaram tinham os menores rostos do
        conjunto (`src/lib/face-check.ts`).
      */}
      {temCamera && !file && (
        <p className="text-center text-xs text-muted">
          Se for tirar na hora, afaste bem o braço e mostre até a cintura.
        </p>
      )}

      {file && (
        <p className="text-center text-sm text-muted">
          {file.name} ·{' '}
          <button type="button" onClick={() => inputRef.current?.click()} className="underline">
            trocar
          </button>
        </p>
      )}

      {error && <ErrorBanner message={error} />}

      <Card>
        <label className="flex cursor-pointer gap-3 text-sm leading-relaxed">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-1 h-4 w-4 shrink-0 accent-accent"
          />
          <span className="text-muted">{CONSENT_TEXT}</span>
        </label>
      </Card>

      <Button onClick={() => file && onConfirm(file)} disabled={!file || !consent || busy}>
        {busy ? 'Enviando...' : 'Continuar para o pagamento'}
      </Button>
    </div>
  );
}

/** Lê as dimensões reais sem decodificar o arquivo inteiro na memória. */
function imageSize(file: File): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new window.Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}
