'use client';

import { useEffect, useRef } from 'react';
import type { OrderResult } from '@/lib/client-api';
import { AiBadge, Button, Card, Spinner } from '@/components/ui';

/**
 * Tela final. O download da alta é o primeiro botão de cada foto: é o que a
 * pessoa pagou para ter, e todo passo entre o pagamento e o arquivo na mão vira
 * reclamação.
 */
export function ResultStep({
  result,
  onStartOver,
}: {
  result: OrderResult | null;
  onStartOver?: () => void;
}) {
  const disparado = useRef(false);
  const primeira = result?.photos[0]?.downloadUrl;

  /**
   * Dispara o download sozinho, uma vez, assim que a primeira foto aparece.
   *
   * Só a PRIMEIRA: três downloads automáticos de uma vez fazem o navegador
   * bloquear tudo depois do primeiro e assustam quem está vendo. As outras
   * ficam no botão de cada card.
   *
   * Não substitui o botão, reforça: navegador pode bloquear download que o
   * usuário não pediu com um clique, e em iOS o comportamento varia por versão.
   * Por isso o texto abaixo assume que pode não ter acontecido.
   *
   * `iframe` escondido em vez de `location.href`: navegar a página inteira para
   * um attachment faz alguns navegadores mostrarem tela em branco por um
   * instante, e aqui a pessoa acabou de pagar — a foto tem que continuar à vista.
   */
  useEffect(() => {
    if (!primeira || disparado.current) return;
    disparado.current = true;

    const frame = document.createElement('iframe');
    frame.style.display = 'none';
    frame.src = primeira;
    document.body.appendChild(frame);

    // 60s: tempo de sobra para a resposta começar. Remover antes cancelaria o
    // download em conexão ruim, que é justamente quem mais precisa dele.
    const timer = setTimeout(() => frame.remove(), 60_000);
    return () => {
      clearTimeout(timer);
      frame.remove();
    };
  }, [primeira]);

  if (!result) {
    return (
      <div className="py-20">
        <Spinner label="Carregando a sua foto..." />
      </div>
    );
  }

  const faltando = result.compradas - result.prontas;

  return (
    <div className="space-y-8">
      <header className="space-y-2 text-center">
        <h1 className="text-2xl font-bold">
          {result.prontas > 1 ? 'Suas fotos estão prontas!' : 'Sua foto está pronta!'}
        </h1>
        {/* Diz a verdade quando falta alguma, em vez de fingir que acabou. O
            pedido está retido e alguém já foi avisado no /admin. */}
        {faltando > 0 && (
          <p className="text-sm text-warn">
            {faltando === 1 ? 'Falta 1 foto' : `Faltam ${faltando} fotos`} — deu um problema do
            nosso lado e já estamos resolvendo. Você recebe assim que ficar pronta.
          </p>
        )}
      </header>

      {result.photos.map((photo, i) => (
        <section key={photo.figureSlug} className="space-y-3">
          {result.photos.length > 1 && (
            <h2 className="text-lg font-bold">
              {photo.label}
              {photo.sceneLabel && <span className="ml-2 text-sm font-normal text-muted">{photo.sceneLabel}</span>}
            </h2>
          )}

          <figure className="relative overflow-hidden rounded-2xl border border-border">
            {/* eslint-disable-next-line @next/next/no-img-element -- URL assinada com expiração */}
            <img
              src={photo.previewUrl ?? photo.resultUrl}
              alt={`Sua foto gerada por inteligência artificial: ${photo.label}`}
              className="w-full"
            />
            <figcaption className="absolute inset-x-2 bottom-2">
              <AiBadge />
            </figcaption>
          </figure>

          {/* `downloadUrl`, não `resultUrl`: o `Content-Disposition: attachment`
              vem assinado na própria URL. O atributo `download` do HTML seria
              ignorado aqui, porque o link aponta para o MinIO — outra origem. */}
          <a
            href={photo.downloadUrl}
            className="block w-full rounded-xl bg-accent px-6 py-4 text-center text-base font-bold text-white transition-colors hover:bg-accent-hover"
          >
            Baixar em alta resolução
          </a>

          {i === 0 && (
            <p className="text-center text-xs text-muted">
              O download da primeira começa sozinho. Se não começar, toque no botão.
            </p>
          )}
        </section>
      ))}

      <div className="space-y-3">
        {/* Aviso deliberado: sem e-mail, esta aba é o caminho da pessoa até as
            fotos. Ela precisa saber disso ANTES de fechar, não depois. */}
        <p className="text-center text-xs text-muted">
          Salve {result.photos.length > 1 ? 'as fotos' : 'a foto'} antes de sair. Você pode reabrir
          esta página no mesmo navegador para baixar de novo enquanto estiver disponível.
        </p>

        {/* Não há botão de compartilhar. O `navigator.share` compartilharia uma
            URL ASSINADA que expira em uma hora — quem recebesse o link depois
            disso veria um erro, e a pessoa que compartilhou levaria a culpa. O
            que faz sentido é ela baixar e postar o arquivo, que é dela. */}

        {onStartOver && (
          // Único lugar que descarta o pedido salvo. Fica por último e sem
          // destaque: quem chegou aqui veio buscar o arquivo, não recomeçar.
          <Button variant="ghost" onClick={onStartOver}>
            Fazer outra foto
          </Button>
        )}
      </div>

      {/* A seção só aparece quando há bônus cadastrado. Hoje não há nenhum, de
          propósito: prometer um arquivo que não existe é pior que não prometer
          nada — o cliente clica, não baixa, e abre suporte. Quando os arquivos
          existirem de verdade, cadastre e a seção volta sozinha. */}
      {/* {result.bonuses.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-bold">Seus bônus</h2>
          {result.bonuses.map((b) => (
            <Card key={b.label} className="flex items-center justify-between gap-4">
              <span>
                <span className="block font-semibold">{b.label}</span>
                <span className="block text-sm text-muted">{b.description}</span>
              </span>
              <a
                href={b.url}
                className="shrink-0 rounded-lg bg-surface-2 px-4 py-2 text-sm font-semibold hover:bg-border"
              >
                Baixar
              </a>
            </Card>
          ))}
        </section>
      )} */}
    </div>
  );
}
