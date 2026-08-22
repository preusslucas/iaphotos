'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PublicFigure, PublicScene } from '@/content';
import {
  type FileExt,
  type OrderResult,
  checkoutPix,
  createOrder,
  extOf,
  getResult,
  getStatus,
  uploadSelfie,
} from '@/lib/client-api';
import { fbTrackOnce } from '@/lib/fbq';
import { Depoimento, ErrorBanner, LegalFooter, Spinner, StepDots } from '@/components/ui';
import { CheckoutStep, type PixCharge } from './CheckoutStep';
import {
  ClimaStep,
  EnquadramentoStep,
  type FramingId,
  type MoodId,
} from './EstiloStep';
import { Landing } from './Landing';
import { OfertaStep } from './OfertaStep';
import { ResultStep } from './ResultStep';
import { SceneStep } from './SceneStep';
import { UploadStep } from './UploadStep';

type Step =
  | 'landing'
  | 'scene'
  | 'enquadramento'
  | 'clima'
  | 'upload'
  /** Tela de preço e combo — o `/oferta` da LP. Vive na rota /[figura]/oferta. */
  | 'oferta'
  | 'checkout'
  | 'processing'
  | 'result'
  | 'failed'
  /** Pago, geração falhou por causa com conserto, dinheiro RETIDO. Não é `failed`. */
  | 'review';

const POLL_INTERVAL_MS = 2_000;
/** Teto do polling: 15 min cobre o Pix mais lento sem bater na API para sempre. */
const POLL_TIMEOUT_MS = 15 * 60 * 1000;

/** Chave do rascunho no localStorage — sobrevive ao recarregar a página. */
const draftKey = (slug: string) => `ia-photos:order:${slug}`;

interface Draft {
  orderId: string;
  accessToken: string;
  sceneId: string;
  fileExt: FileExt;
  /**
   * Quanto o pedido custou de fato, já com o order bump. Guardado no rascunho
   * porque o `Purchase` pode ser disparado numa aba recarregada, quando o
   * estado em memória com a escolha do combo já se perdeu — e `Purchase` sem
   * valor deixa o anúncio sem ROAS.
   */
  paidCents?: number;
  /**
   * Se o combo foi aceito. Guardado junto do resto porque a decisão é tomada na
   * tela de oferta e o salto para a rota `/oferta` — ou um F5 nela — apaga o
   * estado em memória. Sem isto, quem escolhesse o combo e recarregasse voltaria
   * ao checkout com a caixa desmarcada e pagaria o valor da foto sozinha.
   */
  combo?: boolean;
  /**
   * A cobrança Pix, para o QR sobreviver ao recarregar.
   *
   * Sem isto, um F5 na tela do Pix devolvia a pessoa a um `processing` sem
   * cobrança — que desenhava "Criando a sua foto" para um pedido que ninguém
   * pagou, e ainda levava embora o código que ela precisava para pagar.
   */
  charge?: PixCharge;
}

/**
 * O funil inteiro, com DOIS pontos de entrada.
 *
 * `/[figura]` monta com `inicio="landing"` e `/[figura]/oferta` com
 * `inicio="oferta"`. É o mesmo componente nas duas rotas de propósito: a
 * máquina de estados — rascunho no localStorage, polling do Pix, disparo do
 * `Purchase` — é código de pagamento, e duplicá-la em dois arquivos só para dar
 * uma URL à oferta seria pagar em risco por um endereço.
 *
 * O que atravessa a fronteira é o rascunho no localStorage, que já guardava
 * tudo o que a segunda metade precisa: `orderId`, `accessToken`, a cena e a
 * cobrança. Nenhum estado em memória precisa sobreviver ao salto — que é
 * exatamente o motivo de ele ser seguro.
 *
 * E a fronteira fica no UPLOAD, e não em qualquer ponto: antes dele não existe
 * pedido nenhum no servidor, depois dele existe. Um carregamento de página no
 * meio da decisão de compra é caro; aqui ele acontece uma vez só, logo depois
 * de uma espera de rede que a pessoa já aceitou pagar.
 */
export function Funnel({
  figure,
  inicio = 'landing',
}: {
  figure: PublicFigure;
  inicio?: 'landing' | 'oferta';
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(inicio);
  const [scene, setScene] = useState<PublicScene | null>(null);
  const [framing, setFraming] = useState<FramingId>('CHEST_UP');
  const [mood, setMood] = useState<MoodId>('NONE');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [charge, setCharge] = useState<PixCharge | null>(null);
  const [result, setResult] = useState<OrderResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failureReason, setFailureReason] = useState<string | null>(null);
  const [supportWhatsapp, setSupportWhatsapp] = useState<string | null>(null);
  /** Pagamento confirmado pelo SERVIDOR. Só ele autoriza dizer que está gerando. */
  const [pago, setPago] = useState(false);
  const [conferindo, setConferindo] = useState(false);
  const [avisoPix, setAvisoPix] = useState<string | null>(null);
  /** Decidido na OfertaStep, aplicado no checkout e reconferido no servidor. */
  const [combo, setCombo] = useState(false);

  const topRef = useRef<HTMLDivElement>(null);

  /**
   * Retoma um pedido em andamento, e coloca a pessoa na ROTA certa para ele.
   *
   * Sem a retomada, fechar a aba durante o Pix — que é exatamente o que ela faz
   * para abrir o app do banco — perderia o pedido e viraria um pedido de
   * reembolso de alguém que já pagou.
   *
   * A parte da rota é nova e existe porque o funil agora tem duas. As regras:
   *
   * - Em `/[figura]` com rascunho: manda para `/[figura]/oferta`. Um pedido já
   *   criado não pode continuar numa tela que começa pela landing.
   * - Em `/[figura]/oferta` SEM rascunho: manda de volta para a landing. É o
   *   caso de quem colou a URL da oferta, ou de quem voltou a ela depois de
   *   "Fazer outra foto" ter limpado o rascunho — sem pedido não há o que pagar,
   *   e a tela de preço sozinha não leva a lugar nenhum.
   * - Com rascunho E cobrança: cai direto em `processing`, onde o QR reaparece.
   *   Sem cobrança, cai em `oferta`, que é onde ela parou.
   *
   * `router.replace` e não `push`: a URL de onde estamos saindo não é um lugar
   * válido para voltar, e deixá-la no histórico dá um "voltar" que só refaz o
   * mesmo redirecionamento.
   */
  useEffect(() => {
    const raw = localStorage.getItem(draftKey(figure.slug));

    if (!raw) {
      if (inicio === 'oferta') router.replace(`/${figure.slug}`);
      return;
    }

    let saved: Draft;
    try {
      saved = JSON.parse(raw) as Draft;
    } catch {
      localStorage.removeItem(draftKey(figure.slug));
      if (inicio === 'oferta') router.replace(`/${figure.slug}`);
      return;
    }

    // Cena sumiu do catálogo (desligada no /admin entre uma visita e outra):
    // não há como continuar este pedido, e insistir mostraria uma oferta de
    // algo que o gerador não produz mais.
    const savedScene = figure.scenes.find((s) => s.id === saved.sceneId);
    if (!savedScene) {
      if (inicio === 'oferta') router.replace(`/${figure.slug}`);
      return;
    }

    if (inicio === 'landing') {
      router.replace(`/${figure.slug}/oferta`);
      return;
    }

    // O lint prefere inicializador preguiçoso de useState a setState em efeito,
    // mas aqui não dá: localStorage não existe durante o SSR, e ler no
    // inicializador quebraria a renderização no servidor. Ler depois da
    // montagem é a única forma correta — e acontece uma vez só.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(saved);
    setScene(savedScene);
    setCharge(saved.charge ?? null);
    setCombo(saved.combo ?? false);
    setStep(saved.charge ? 'processing' : 'oferta');
  }, [figure, inicio, router]);

  useEffect(() => {
    topRef.current?.scrollIntoView({ block: 'start' });
  }, [step]);

  const finish = useCallback(async (saved: Draft) => {
    setResult(await getResult(saved.orderId, saved.accessToken));
    setStep('result');
    // Só aqui: `Purchase` é a foto entregue, o único momento em que o dinheiro
    // é nosso de verdade. Amarrado ao orderId para não contar de novo se ela
    // reabrir esta tela — que é justamente o que o rascunho permite fazer.
    // O `orderId` no fim é o `eventID`: a CAPI manda este mesmo Purchase do
    // servidor com `event_id` igual, e é o que faz a Meta contar UMA venda.
    fbTrackOnce(
      `purchase:${saved.orderId}`,
      'Purchase',
      { value: (saved.paidCents ?? 0) / 100, currency: 'BRL' },
      saved.orderId,
    );
    // O rascunho NÃO é apagado aqui, de propósito. Não mandamos a foto por
    // e-mail: esta aba é o único caminho até ela. Apagar no instante em que a
    // tela abre significa que um download bloqueado pelo navegador, um F5 ou um
    // toque no botão errado deixariam a pessoa sem o que ela pagou e sem volta.
    // Mantido, ela reabre o site no mesmo navegador e cai direto no resultado.
    // Quem limpa é o botão "Fazer outra foto", quando ela já tem o arquivo.
  }, []);

  /**
   * Recomeça o processo inteiro, do começo.
   *
   * Volta para a LANDING, não para a escolha de cena: quem clica em "fazer
   * outra foto" está começando outra compra, e o funil inteiro — headline,
   * prova social, oferta — é o que faz a segunda venda acontecer. Cair direto
   * na grade de cenas pula justamente a parte que convence.
   *
   * Zera tudo, inclusive enquadramento e clima: senão a escolha anterior
   * ficaria pré-marcada num fluxo que a pessoa acha que começou limpo.
   */
  const startOver = useCallback(() => {
    localStorage.removeItem(draftKey(figure.slug));
    // A landing é outra ROTA agora. `push` e não `replace`: a pessoa está
    // começando uma compra nova por vontade própria, e o resultado que ela
    // acabou de ver é um lugar legítimo para o "voltar" do navegador.
    router.push(`/${figure.slug}`);
    setDraft(null);
    setResult(null);
    setScene(null);
    setFraming('CHEST_UP');
    setMood('NONE');
    setCharge(null);
    setError(null);
    setAvisoPix(null);
    setPago(false);
    setCombo(false);
    setStep('landing');
  }, [figure.slug, router]);

  // Polling do status enquanto o pedido está sendo pago ou gerado.
  useEffect(() => {
    if (step !== 'processing' || !draft) return;

    let cancelled = false;
    let cobrancaLimpa = false;
    const startedAt = Date.now();

    const tick = async () => {
      if (cancelled) return;
      // No topo, e não no meio do caminho "ainda não pronto": lá embaixo ele
      // não é alcançado quando a consulta falha, e o teto deixaria de existir
      // justamente no caso em que ele serve para alguma coisa.
      if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
        setError('A espera passou do normal. Assim que ficar pronta você recebe por e-mail.');
        return;
      }
      try {
        const status = await getStatus(draft.orderId, draft.accessToken);
        if (cancelled) return;

        // `await`, e dentro do try. Antes era `return void finish(draft)`: a
        // promise era descartada e o `return` saía sem reagendar o tick. Uma
        // falha isolada do getResult — a corrida mais provável do fluxo, o
        // pedido virando READY enquanto os assets ainda são escritos — matava o
        // polling em silêncio e deixava quem PAGOU olhando o QR até dar F5.
        if (status.ready) {
          await finish(draft);
          return;
        }
        // Pagou: o QR sai da tela e entra o "criando a sua foto".
        //
        // Sem isto, quem acabou de pagar continua lendo "Pague com Pix para
        // liberar" com o codigo na cara enquanto a imagem e gerada. A leitura
        // obvia e "meu pagamento nao entrou" — e a reacao e pagar de novo ou
        // pedir reembolso de um pedido que esta indo bem.
        if (status.paid) {
          setPago(true);
          setCharge(null);
          // A cobranca sai do rascunho junto: ela so serve para quem ainda
          // precisa pagar, e mante-la faria o QR piscar de volta a cada F5.
          if (!cobrancaLimpa) {
            cobrancaLimpa = true;
            const { charge: _, ...semCobranca } = draft;
            localStorage.setItem(draftKey(figure.slug), JSON.stringify(semCobranca));
          }
        }

        // Não pago e sem cobrança para mostrar: não há o que esperar aqui.
        //
        // Cai neste caso quem recarregou antes de gerar o Pix, ou quem tem um
        // rascunho salvo por uma versão anterior a este arquivo guardar a
        // cobrança. Devolver ao checkout deixa ela gerar um Pix novo para o
        // MESMO pedido — o alternativo era um spinner eterno sobre um pedido
        // que nunca vai ser pago, com a selfie já enviada.
        if (!status.paid && !draft.charge) {
          setStep('oferta');
          return;
        }

        if (status.failed) {
          setFailureReason(status.failureReason);
          setStep('failed');
          localStorage.removeItem(draftKey(figure.slug));
          return;
        }
        // Retido: alguém vai consertar e reprocessar. O rascunho NÃO é apagado,
        // ao contrário do caso acima — se o reprocessamento der certo, esta
        // mesma tela volta a carregar o resultado do pedido que já foi pago.
        if (status.needsReview) {
          setFailureReason(status.failureReason);
          setSupportWhatsapp(status.supportWhatsapp ?? null);
          setStep('review');
          return;
        }
      } catch (err) {
        // Falha de rede não derruba a tela: o próximo tick tenta de novo.
        console.warn('[funnel] polling falhou', err);
      }
      timer = setTimeout(() => void tick(), POLL_INTERVAL_MS);
    };

    // Primeira consulta imediata: no caminho de retomada o pedido muitas vezes
    // JÁ está pronto, e esperar o intervalo só atrasa a foto que ela pagou.
    let timer = setTimeout(() => void tick(), 0);

    /**
     * Volta a consultar assim que a aba reaparece.
     *
     * O navegador estrangula `setTimeout` em aba oculta (Chrome derruba para um
     * disparo por minuto), e sair da aba é o comportamento NORMAL aqui: para
     * pagar o Pix é preciso ir ao app do banco. Sem isto, quem volta encontra o
     * QR ainda na tela por até um minuto depois de o pagamento ter caído.
     */
    const aoVoltar = () => {
      if (document.visibilityState !== 'visible' || cancelled) return;
      clearTimeout(timer);
      timer = setTimeout(() => void tick(), 0);
    };
    document.addEventListener('visibilitychange', aoVoltar);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', aoVoltar);
    };
  }, [step, draft, figure.slug, finish]);

  async function handleUpload(file: File) {
    if (!scene) return;
    const ext = extOf(file);
    if (!ext) return setError('Formato de imagem não suportado.');

    setBusy(true);
    setError(null);
    try {
      const order = await createOrder({
        figureSlug: figure.slug,
        sceneId: scene.id,
        fileExt: ext,
        framing,
        mood,
      });
      await uploadSelfie(order.uploadUrl, file);

      const saved: Draft = {
        orderId: order.orderId,
        accessToken: order.accessToken,
        sceneId: scene.id,
        fileExt: ext,
      };
      localStorage.setItem(draftKey(figure.slug), JSON.stringify(saved));
      setDraft(saved);

      // A selfie subiu e a oferta vai abrir: é aqui que o checkout começa. O
      // valor é o de uma foto — o order bump ainda não foi decidido.
      //
      // Disparado ANTES do `push`, e não depois: a navegação desmonta este
      // componente, e um efeito pendente do pixel morreria junto. Como o
      // `fbTrackOnce` grava a marca do evento, um F5 na oferta não conta de novo.
      fbTrackOnce(`checkout:${order.orderId}`, 'InitiateCheckout', {
        value: figure.priceCents / 100,
        currency: 'BRL',
        content_name: figure.slug,
      });

      // Daqui em diante o pedido existe no servidor, e a segunda metade do
      // funil roda na própria rota — que sabe se reerguer sozinha a partir do
      // rascunho que acabou de ser gravado.
      router.push(`/${figure.slug}/oferta`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não conseguimos enviar sua foto.');
    } finally {
      setBusy(false);
    }
  }

  async function handlePay(email: string, phone: string) {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      const pix = await checkoutPix({ ...draft, email, phone: phone || undefined, combo });
      setCharge(pix);

      // Grava o valor cobrado no rascunho antes do polling: quando o Pix cair,
      // o `Purchase` lê daqui — inclusive se a pessoa tiver fechado a aba para
      // abrir o banco e voltado depois, que é o caminho normal.
      const pago: Draft = {
        ...draft,
        paidCents: combo ? (figure.bundlePriceCents ?? figure.priceCents) : figure.priceCents,
        combo,
        charge: pix,
      };
      localStorage.setItem(draftKey(figure.slug), JSON.stringify(pago));
      setDraft(pago);
      // Já entra em polling: o Pix pode cair antes de a pessoa voltar para cá.
      setStep('processing');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não conseguimos gerar o Pix.');
    } finally {
      setBusy(false);
    }
  }

  /**
   * "Já paguei": consulta o pagamento agora.
   *
   * Não confia no clique — quem decide é o servidor. Se o Pix ainda não caiu, a
   * tela continua igual e diz isso com todas as letras, porque a alternativa
   * (silêncio) é lida como falha do site e leva a pagar de novo.
   */
  async function conferirPagamento() {
    if (!draft) return;
    setConferindo(true);
    setAvisoPix(null);
    try {
      const status = await getStatus(draft.orderId, draft.accessToken);
      if (status.paid) {
        // O QR sai da tela na hora. O resto do caminho — gerando, pronta,
        // falhou — continua sendo do polling, que já está rodando.
        setPago(true);
        setCharge(null);
      } else {
        setAvisoPix(
          'O pagamento ainda não apareceu. O Pix costuma levar alguns segundos; ' +
            'esta tela muda sozinha assim que ele cair.',
        );
      }
    } catch {
      setAvisoPix('Não conseguimos conferir agora. Tente de novo em instantes.');
    } finally {
      setConferindo(false);
    }
  }

  /**
   * Para onde cada passo volta. Só os cinco que a pessoa percorre têm anterior.
   *
   * `processing` em diante ficam de fora de propósito: depois de gerar o Pix não
   * há para onde voltar que faça sentido — o pedido já existe e pode ter sido
   * pago enquanto ela olhava a tela.
   */
  const ANTERIOR: Partial<Record<Step, Step>> = {
    // A landing é o passo inicial de `/[figura]`, e não outra rota: quem está em
    // `scene` chegou aqui pelo CTA, sem navegar. Voltar é trocar o passo.
    scene: 'landing',
    enquadramento: 'scene',
    clima: 'enquadramento',
    upload: 'clima',
    // Voltar daqui atravessa a fronteira de ROTA (as telas anteriores vivem em
    // `/[figura]`) e abandona um pedido já criado no servidor — a selfie subiu
    // antes desta tela. O `Order` anterior fica PENDING para sempre e um novo é
    // criado no próximo upload. Nada é cobrado e nada quebra, mas o /admin
    // acumula pedidos órfãos. Está aqui porque é o desenho do cliente.
    oferta: 'upload',
    checkout: 'oferta',
  };

  /**
   * Voltar de `oferta` navega entre ROTAS: as telas anteriores vivem em
   * `/[figura]` e esta em `/[figura]/oferta`. O `voltar()` abaixo trata disso.
   */

  function voltar() {
    // Da oferta o anterior está na OUTRA rota, então é navegação e não troca de
    // passo. `push` e não `replace`: a oferta é um lugar legítimo para o
    // "avançar" do navegador trazer de volta.
    if (step === 'oferta') {
      router.push(`/${figure.slug}`);
      return;
    }
    const destino = ANTERIOR[step];
    if (!destino) return;
    // Limpa o erro junto: mensagem do passo anterior continuar na tela depois de
    // voltar faz parecer que o problema é do passo em que ela acabou de chegar.
    setError(null);
    setStep(destino);
  }

  /**
   * Seis passos agora, e não cinco: a oferta virou tela própria e conta como
   * um. "PASSO 6 DE 6" no pagamento é o mesmo número que a LP do Lovable
   * mostrava naquela tela — e não por coincidência, é o mesmo desenho.
   */
  const TOTAL_PASSOS = 6;

  const stepIndex: Record<Step, number> = {
    landing: 0,
    scene: 1,
    enquadramento: 2,
    clima: 3,
    upload: 4,
    // A oferta é o passo 6 DE 6 — é assim no desenho do cliente, e faz sentido
    // para quem compra: escolher quanto pagar é a última decisão. O que vem
    // depois (dados, QR, espera) é o pagamento acontecendo, não mais uma etapa
    // a vencer. Por isso `checkout` em diante fica fora do contador.
    oferta: 5,
    checkout: 6,
    processing: 7,
    result: 7,
    failed: 7,
    review: 7,
  };
  /** O que o contador MOSTRA. A oferta é a última etapa aos olhos de quem compra. */
  const passoExibido = step === 'oferta' ? TOTAL_PASSOS : stepIndex[step];

  return (
    <main className="mx-auto min-h-dvh w-full max-w-2xl px-5 pb-16">
      <div ref={topRef} />

      {/* Só nos cinco passos que a PESSOA percorre.
          `processing`, `result`, `failed` e `review` marcavam 6 contra um total
          de 5 — "Passo 6 de 5" na tela e a barra em 120%, transbordando. E
          nenhum deles é passo: depois de pagar não há mais nada para ela fazer,
          e contador de progresso ali só sugere que ainda falta etapa. */}
      {stepIndex[step] >= 1 && stepIndex[step] <= TOTAL_PASSOS && (
        <div className="py-6">
          <StepDots current={passoExibido} total={TOTAL_PASSOS} onBack={voltar} />
        </div>
      )}

      {step === 'landing' && (
        <Landing figure={figure} onStart={() => setStep('scene')} />
      )}

      {step === 'oferta' && (
        <OfertaStep
          figure={figure}
          onContinuar={(escolheuCombo) => {
            setCombo(escolheuCombo);
            // Gravado no rascunho na hora, e não só ao pagar: entre esta tela e
            // o Pix a pessoa ainda digita e-mail e telefone, e um F5 no meio
            // disso não pode desfazer uma escolha de preço que ela já fez.
            if (draft) {
              const atualizado: Draft = { ...draft, combo: escolheuCombo };
              localStorage.setItem(draftKey(figure.slug), JSON.stringify(atualizado));
              setDraft(atualizado);
            }
            setStep('checkout');
          }}
        />
      )}

      {step === 'scene' && (
        <div className="space-y-6">
          <SceneStep
            figure={figure}
            selected={scene}
            onSelect={setScene}
            onNext={() => setStep('enquadramento')}
          />
          {/* Um depoimento DIFERENTE por passo. Repetir o mesmo em todas as
              telas tem efeito contrário ao de prova social. */}
          {figure.testimonials[0] && <Depoimento {...figure.testimonials[0]} />}
        </div>
      )}

      {step === 'enquadramento' && (
        <EnquadramentoStep
          valor={framing}
          onChange={setFraming}
          onNext={() => setStep('clima')}
          depoimento={figure.testimonials[1] ?? null}
        />
      )}

      {step === 'clima' && (
        <ClimaStep
          valor={mood}
          onChange={setMood}
          onNext={() => setStep('upload')}
          depoimento={figure.testimonials[2] ?? null}
        />
      )}

      {step === 'upload' && (
        <div className="space-y-4">
          <UploadStep onConfirm={(file) => void handleUpload(file)} busy={busy} />
          {error && <ErrorBanner message={error} />}
        </div>
      )}

      {step === 'checkout' && (
        <CheckoutStep
          totalCents={combo ? (figure.bundlePriceCents ?? figure.priceCents) : figure.priceCents}
          combo={combo}
          depoimento={figure.testimonials[2] ?? null}
          charge={null}
          busy={busy}
          error={error}
          onPay={(email, phone) => void handlePay(email, phone)}
        />
      )}

      {step === 'processing' && (
        <div className="space-y-8">
          {charge ? (
            <CheckoutStep
              totalCents={combo ? (figure.bundlePriceCents ?? figure.priceCents) : figure.priceCents}
              combo={combo}
              depoimento={null}
              charge={charge}
              busy={false}
              error={null}
              onPay={() => {}}
              onConferir={() => void conferirPagamento()}
              conferindo={conferindo}
              avisoConferencia={avisoPix}
            />
          ) : (
            <div className="py-20">
              {/* O texto depende do SERVIDOR ter confirmado o pagamento.
                  Antes era fixo, e um F5 na tela do Pix — que cai aqui com a
                  cobrança perdida — anunciava "Criando a sua foto" para um
                  pedido PENDING. Dizer a alguém que a foto dela está sendo
                  feita quando nada foi pago é a pior mentira que esta tela pode
                  contar: ela para de tentar pagar e vai embora esperando. */}
              <Spinner
                label={
                  pago
                    ? 'Criando a sua foto... costuma levar cerca de um minuto.'
                    : 'Conferindo o seu pagamento...'
                }
              />
            </div>
          )}
          {error && <ErrorBanner message={error} />}
        </div>
      )}

      {step === 'result' && (
        <ResultStep result={result} onStartOver={startOver} />
      )}

      {step === 'review' && (
        <div className="space-y-5 py-16 text-center">
          <h1 className="text-2xl font-bold">Deu um problema do nosso lado</h1>
          <p className="text-muted">
            A sua foto não foi gerada por uma falha nossa, não pela foto que você enviou. Já
            estamos avisados e vamos refazer — assim que ficar pronta, você recebe por e-mail.
          </p>
          {/* Frase deliberada: o dinheiro está retido, não estornado. Dizer
              "estornado" aqui seria mentira e vira chargeback. */}
          <p className="text-sm text-muted">
            O seu pagamento continua conosco e nada foi cobrado a mais. Se preferir o estorno,
            é só pedir.
          </p>
          {supportWhatsapp && (
            <a
              href={`https://wa.me/${supportWhatsapp}?text=${encodeURIComponent(
                `Olá! Meu pedido ${draft?.orderId ?? ''} deu problema na geração.`,
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block rounded-xl bg-accent px-6 py-3 font-bold text-white hover:bg-accent-hover"
            >
              Falar com o suporte no WhatsApp
            </a>
          )}
        </div>
      )}

      {step === 'failed' && (
        <div className="space-y-5 py-16 text-center">
          <h1 className="text-2xl font-bold">Não deu certo desta vez</h1>
          <p className="text-muted">
            {failureReason ?? 'Não conseguimos gerar a sua foto.'} O seu pagamento foi estornado
            automaticamente.
          </p>
          <p className="text-sm text-muted">
            Você recebeu um e-mail com os detalhes. Se quiser tentar de novo, use uma foto sua
            de meio corpo, ao ar livre e sozinho na imagem.
          </p>
        </div>
      )}

      <LegalFooter />
    </main>
  );
}
