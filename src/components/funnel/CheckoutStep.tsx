'use client';

import { useState } from 'react';
import { formatBRL } from '@/lib/format';
import { Button, Card, Depoimento, ErrorBanner } from '@/components/ui';

export interface PixCharge {
  qrCode: string;
  qrCodeBase64: string;
  expiresAt: string | null;
}

/**
 * Checkout. Pix é o único método na primeira versão, de propósito: é o que
 * converte em tráfego frio no Brasil, cai na conta em segundos e não traz
 * chargeback nem antifraude para dentro do produto. Cartão entra depois, com o
 * SDK de tokenização do Mercado Pago — o servidor já aceita (`method: 'card'`).
 *
 * A OFERTA não mora mais aqui. O order bump ("leve as N fotos"), o preço e os
 * bônus saíram para a `OfertaStep`, que é a tela anterior — o desenho do
 * `/oferta` da LP do Lovable. Esta tela ficou com o que sempre foi: coletar
 * e-mail e WhatsApp, gerar a cobrança e mostrar o QR.
 *
 * O motivo da separação está na `OfertaStep`, resumido: escolher quanto gastar e
 * preencher formulário são dois modos diferentes, e o bump enfiado entre dois
 * campos era lido como mais um campo. O que sobrou aqui é `totalCents` — já
 * decidido — e `combo`, que só viaja de volta para o servidor.
 */
export function CheckoutStep({
  totalCents,
  combo,
  depoimento,
  charge,
  busy,
  error,
  onPay,
  onConferir,
  conferindo = false,
  avisoConferencia = null,
  onRecomecar,
  supportWhatsapp = null,
  orderId = null,
}: {
  /** O que ela vai pagar, já com a decisão do combo aplicada na OfertaStep. */
  totalCents: number;
  /**
   * Se o combo foi aceito. Não muda nada nesta tela além do resumo: viaja para
   * o servidor, que reaplica a mesma regra e recalcula o valor por conta
   * própria — o preço nunca é o que o browser mandou.
   */
  combo: boolean;
  /** Prova social exibida junto ao formulário. */
  depoimento: { name: string; city: string; text: string } | null;
  charge: PixCharge | null;
  busy: boolean;
  error: string | null;
  onPay: (email: string, phone: string) => void;
  /** Consulta o pagamento agora, sem esperar o próximo ciclo do polling. */
  onConferir?: () => void;
  conferindo?: boolean;
  /** Resposta da última conferência, quando o pagamento ainda não caiu. */
  avisoConferencia?: string | null;
  /**
   * Abandona esta cobrança e volta para a landing, do zero.
   *
   * Existe porque a tela do Pix era um beco: quem errou o e-mail, escolheu a
   * cena errada ou simplesmente mudou de ideia sobre o combo não tinha saída
   * a não ser fechar a aba — e quem fecha a aba não volta. O botão de voltar
   * do funil (`StepDots`) para no `checkout` de propósito, porque daqui para
   * trás o pedido já existe no servidor; recomeçar é outra coisa: é assumir
   * que este pedido morreu e criar um novo.
   */
  onRecomecar?: () => void;
  /**
   * Numero do suporte, so digitos com DDI. `null` quando `SUPPORT_WHATSAPP` não
   * está configurado no servidor — nesse caso o botão simplesmente não aparece,
   * em vez de virar um link quebrado.
   */
  supportWhatsapp?: string | null;
  /** Vai no texto pré-preenchido do WhatsApp, para o suporte já saber qual pedido. */
  orderId?: string | null;
}) {
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [copied, setCopied] = useState(false);
  const [erroFone, setErroFone] = useState<string | null>(null);
  /** Segundo clique do "Recomeçar": confirma antes de largar a cobranca. */
  const [confirmandoRecomeco, setConfirmandoRecomeco] = useState(false);

  /**
   * Celular brasileiro com DDD: 11 dígitos, e o nono sempre 9.
   *
   * Validado aqui e não só no servidor porque o custo do erro é assimétrico —
   * um número torto só aparece quando você tenta falar com um cliente que teve
   * problema, e aí é tarde. Guardamos apenas os dígitos: máscara é coisa de
   * tela, e telefone salvo com pontuação não casa em busca nem em disparo.
   */
  function validaFone(valor: string): string | null {
    const digitos = valor.replace(/\D/g, '');
    if (digitos.length !== 11) {
      return 'Escreva com o DDD na frente, assim: (11) 99999-9999.';
    }
    if (digitos[2] !== '9') return 'Celular precisa começar com 9 depois do DDD.';
    return null;
  }

  function mascara(valor: string): string {
    const d = valor.replace(/\D/g, '').slice(0, 11);
    if (d.length <= 2) return d;
    if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  }

  if (charge) {
    return (
      <div className="space-y-6 text-center">
        <header className="space-y-2">
          <h1 className="text-2xl font-bold">Pague com Pix para liberar</h1>
          <p className="text-sm text-muted">
            Assim que o pagamento cair, a sua foto começa a ser gerada automaticamente.
          </p>
        </header>

        {charge.qrCodeBase64 && (
          <div className="mx-auto w-fit rounded-2xl bg-white p-4">
            {/* eslint-disable-next-line @next/next/no-img-element -- data URI do MP */}
            <img
              src={`data:image/png;base64,${charge.qrCodeBase64}`}
              alt="QR Code do Pix"
              width={220}
              height={220}
            />
          </div>
        )}

        <Card className="space-y-3">
          <p className="text-sm text-muted">Ou copie o código Pix:</p>
          <p className="rounded-lg bg-surface-2 p-3 font-mono text-xs break-all">{charge.qrCode}</p>
          <Button
            variant="ghost"
            onClick={() => {
              void navigator.clipboard.writeText(charge.qrCode).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 2500);
              });
            }}
          >
            {copied ? 'Código copiado!' : 'Copiar código Pix'}
          </Button>
        </Card>

        {/* "Já paguei" não é um atalho para a foto: ele apenas consulta o
            pagamento agora, em vez de esperar o próximo ciclo do polling. A
            tela já se vira sozinha — o botão existe porque quem acabou de pagar
            no app do banco quer AGIR, e sem nada para clicar a suspeita é de
            que o site não percebeu. Quem não tem o que clicar paga de novo. */}
        {onConferir && (
          <div className="space-y-2">
            <Button onClick={onConferir} disabled={conferindo}>
              {conferindo ? 'Conferindo...' : 'Já paguei'}
            </Button>
            {avisoConferencia && <p className="text-sm text-muted">{avisoConferencia}</p>}
          </div>
        )}

        <p className="text-xs text-muted">
          Esta tela atualiza sozinha quando o pagamento for confirmado. Pode deixar aberta.
        </p>

        {/* Saída para quem trava no Pix — QR que não abre, código que não cola,
            pagamento que caiu e a tela não avisou. Sem isto o único caminho de
            quem tem problema é fechar a aba, e quem fecha a aba não volta. */}
        {supportWhatsapp && (
          <div className="space-y-2 border-t border-border pt-6">
            <p className="text-sm text-muted">Problema para pagar?</p>
            <a
              href={`https://wa.me/${supportWhatsapp}?text=${encodeURIComponent(
                `Olá! Estou com dificuldade para pagar o Pix do pedido ${orderId ?? ''}.`,
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block rounded-xl bg-accent px-6 py-3 font-bold text-white hover:bg-accent-hover"
            >
              Falar com o suporte no WhatsApp
            </a>
          </div>
        )}

        {/* Saída da tela do Pix. Em DOIS cliques, e não em um: este botão apaga
            o rascunho, e o rascunho guarda o `accessToken` — o único caminho
            até a foto paga. Quem já pagou e clicasse aqui por engano perderia
            o que comprou, sem tela de recuperação nenhuma. O aviso é escrito
            para ser lido por quem está com o app do banco aberto na outra mão. */}
        {onRecomecar && (
          <div className="border-t border-border pt-6">
            {confirmandoRecomeco ? (
              <div className="space-y-3">
                <p className="text-sm font-medium">Recomeçar do início?</p>
                <p className="text-xs text-muted">
                  Este código Pix deixa de valer e você escolhe tudo de novo.{' '}
                  <strong>Se você já pagou, não recomece</strong> — fique nesta tela, a sua
                  foto aparece aqui.
                </p>
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={() => setConfirmandoRecomeco(false)}>
                    Continuar pagando
                  </Button>
                  <Button variant="ghost" onClick={onRecomecar}>
                    Sim, recomeçar
                  </Button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmandoRecomeco(true)}
                className="text-sm text-muted underline underline-offset-4 hover:text-foreground"
              >
                Quero mudar alguma coisa — recomeçar do início
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        const problema = validaFone(phone);
        setErroFone(problema);
        if (problema) return;
        // Só os dígitos para o servidor: máscara é apresentação.
        onPay(email.trim(), phone.replace(/\D/g, ''));
      }}
    >
      <header className="space-y-2 text-center">
        <h1 className="text-2xl font-bold">Quase lá</h1>
        {/* NÃO prometa envio por e-mail: o sistema não envia. A entrega é nesta
            tela, e dizer o contrário faz a pessoa fechar a aba esperando algo
            que nunca chega — e perder o que pagou. */}
        <p className="text-sm text-muted">
          Sua foto aparece <strong>aqui mesmo</strong> assim que ficar pronta. O e-mail é do
          pagamento.
        </p>
      </header>

      <Card className="space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Seu e-mail</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            inputMode="email"
            placeholder="voce@email.com"
            className="w-full rounded-xl border border-border bg-surface-2 px-4 py-3 outline-none focus:border-accent"
          />
          <span className="mt-1 block text-xs text-muted">
            Vai no recibo do Mercado Pago e identifica o seu pedido.
          </span>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Seu WhatsApp (com DDD)</span>
          <div className="flex items-stretch gap-2">
            <span className="flex items-center rounded-xl border border-border bg-surface-2 px-3 text-sm text-muted">
              🇧🇷 +55
            </span>
            <input
              type="tel"
              required
              value={phone}
              onChange={(e) => {
                setPhone(mascara(e.target.value));
                if (erroFone) setErroFone(null);
              }}
              autoComplete="tel"
              inputMode="numeric"
              placeholder="(00) 00000-0000"
              className={`w-full rounded-xl border bg-surface-2 px-4 py-3 outline-none ${
                erroFone ? 'border-danger' : 'border-border focus:border-accent'
              }`}
            />
          </div>
          <span className="mt-1 block text-xs text-muted">
            É por aqui que falamos com você se algo der errado com o seu pedido.
          </span>
          {erroFone && <span className="mt-1 block text-xs text-danger">{erroFone}</span>}
        </label>
      </Card>

      {depoimento && <Depoimento {...depoimento} />}

      {error && <ErrorBanner message={error} />}

      {/* Resumo do que foi decidido na tela anterior. Ele existe porque a
          oferta agora está DUAS telas atrás do botão de pagar: sem repetir o
          valor aqui, a pessoa digita e-mail e telefone sem o preço à vista e
          chega no "Pagar" sem lembrar do que aceitou. */}
      <div className="flex items-baseline justify-between px-1">
        <span className="text-muted">{combo ? 'Total (combo)' : 'Total'}</span>
        <span className="text-2xl font-extrabold">{formatBRL(totalCents)}</span>
      </div>

      <Button type="submit" disabled={busy || !email} variant="cta">
        {busy ? 'Gerando o Pix...' : `Pagar ${formatBRL(totalCents)} no Pix`}
      </Button>

      <p className="text-center text-xs text-muted">
        Pagamento único, sem assinatura. Processado pelo Mercado Pago.
      </p>
    </form>
  );
}
