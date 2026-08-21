import { createHmac, timingSafeEqual } from 'node:crypto';
import { MercadoPagoConfig, Payment, PaymentRefund } from 'mercadopago';
import { env } from './env';

let cached: Payment | null = null;

function payments(): Payment {
  if (cached) return cached;
  const client = new MercadoPagoConfig({
    accessToken: env().MP_ACCESS_TOKEN,
    options: { timeout: 10_000 },
  });
  cached = new Payment(client);
  return cached;
}

export interface PixCharge {
  paymentId: string;
  status: string;
  /** Payload copia-e-cola do Pix. */
  qrCode: string;
  /** PNG do QR em base64. */
  qrCodeBase64: string;
  expiresAt: string | null;
}

/**
 * Cobranca Pix. O `X-Idempotency-Key` amarrado ao pedido garante que um duplo
 * clique no botao nao gere duas cobrancas para a mesma pessoa.
 */
export async function createPixCharge(input: {
  orderId: string;
  amountCents: number;
  description: string;
  email: string;
}): Promise<PixCharge> {
  const res = await payments().create({
    body: {
      transaction_amount: input.amountCents / 100,
      description: input.description,
      payment_method_id: 'pix',
      external_reference: input.orderId,
      notification_url: `${env().APP_URL}/api/webhooks/mercadopago`,
      payer: { email: input.email },
    },
    requestOptions: { idempotencyKey: `pix-${input.orderId}` },
  });

  const tx = res.point_of_interaction?.transaction_data;
  if (!res.id || !tx?.qr_code) {
    throw new Error('Mercado Pago não retornou o QR do Pix');
  }

  return {
    paymentId: String(res.id),
    status: res.status ?? 'pending',
    qrCode: tx.qr_code,
    qrCodeBase64: tx.qr_code_base64 ?? '',
    expiresAt: res.date_of_expiration ?? null,
  };
}

export interface CardCharge {
  paymentId: string;
  status: string;
  statusDetail: string;
}

/**
 * Cobranca no cartao com o token gerado pelo SDK do browser.
 *
 * O numero do cartao NUNCA chega neste servidor — o front tokeniza direto com o
 * Mercado Pago e nos manda so o token. Isso mantem o escopo de PCI fora daqui.
 */
export async function createCardCharge(input: {
  orderId: string;
  amountCents: number;
  description: string;
  email: string;
  cardToken: string;
  paymentMethodId: string;
  installments: number;
  issuerId?: string;
  identification?: { type: string; number: string };
}): Promise<CardCharge> {
  const res = await payments().create({
    body: {
      transaction_amount: input.amountCents / 100,
      description: input.description,
      token: input.cardToken,
      payment_method_id: input.paymentMethodId,
      installments: input.installments,
      // O SDK tipa issuer_id como número, mas o SDK do browser entrega string.
      // A conversão fica aqui, na fronteira, e não espalhada pelas chamadas.
      issuer_id: input.issuerId ? Number(input.issuerId) : undefined,
      external_reference: input.orderId,
      notification_url: `${env().APP_URL}/api/webhooks/mercadopago`,
      payer: {
        email: input.email,
        ...(input.identification ? { identification: input.identification } : {}),
      },
    },
    requestOptions: { idempotencyKey: `card-${input.orderId}` },
  });

  if (!res.id) throw new Error('Mercado Pago não retornou o id do pagamento');

  return {
    paymentId: String(res.id),
    status: res.status ?? 'pending',
    statusDetail: res.status_detail ?? '',
  };
}

export async function getPayment(paymentId: string) {
  return payments().get({ id: paymentId });
}

/**
 * Estorno total. Chamado quando a geracao falha em definitivo: devolver na hora
 * custa muito menos que um chargeback — em taxa e em reputacao com a adquirente.
 */
export async function refundPayment(paymentId: string): Promise<void> {
  const client = new MercadoPagoConfig({ accessToken: env().MP_ACCESS_TOKEN });
  await new PaymentRefund(client).create({
    payment_id: paymentId,
    requestOptions: { idempotencyKey: `refund-${paymentId}` },
  });
}

/**
 * Valida a assinatura do webhook.
 *
 * O endpoint e publico: sem isto, qualquer um faz um POST dizendo "pagamento
 * aprovado" e recebe a imagem sem pagar. O manifest segue o formato exigido
 * pelo Mercado Pago, com o id em minusculas.
 *
 * https://www.mercadopago.com.br/developers/pt/docs/your-integrations/notifications/webhooks
 */
export function verifyWebhookSignature(input: {
  signatureHeader: string | null;
  requestId: string | null;
  dataId: string | null;
}): boolean {
  const { signatureHeader, requestId, dataId } = input;
  if (!signatureHeader || !dataId) return false;

  // Formato: "ts=1704908010,v1=618c85345248dd820d5fd456117c2ab2..."
  const parts = Object.fromEntries(
    signatureHeader.split(',').map((p) => {
      const [k, ...rest] = p.split('=');
      return [k!.trim(), rest.join('=').trim()];
    }),
  );

  const ts = parts.ts;
  const received = parts.v1;
  if (!ts || !received) return false;

  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId ?? ''};ts:${ts};`;
  const expected = createHmac('sha256', env().MP_WEBHOOK_SECRET).update(manifest).digest('hex');

  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(received, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}
