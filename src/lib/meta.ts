import { createHash } from 'node:crypto';
import { prisma } from './prisma';

/**
 * Conversions API do Meta, chamada do servidor.
 *
 * O pixel do browser perde uma fatia grande das conversoes (bloqueador, ITP do
 * Safari, aba fechada antes do redirect). Como este produto vive de trafego
 * pago, um evento de compra perdido e otimizacao de campanha perdida.
 *
 * Opcional de proposito: sem as credenciais, tudo continua funcionando.
 */
const PIXEL_ID = process.env.META_PIXEL_ID;
const ACCESS_TOKEN = process.env.META_CAPI_TOKEN;

/** O Meta exige PII normalizada e hasheada em SHA-256. */
const hash = (value: string) =>
  createHash('sha256').update(value.trim().toLowerCase()).digest('hex');

export async function sendPurchaseEvent(orderId: string): Promise<void> {
  if (!PIXEL_ID || !ACCESS_TOKEN) return;

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || order.metaSentAt) return;

  const userData: Record<string, string[]> = {};
  if (order.email) userData.em = [hash(order.email)];
  if (order.phone) userData.ph = [hash(order.phone.replace(/\D/g, ''))];

  const res = await fetch(`https://graph.facebook.com/v21.0/${PIXEL_ID}/events`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      access_token: ACCESS_TOKEN,
      data: [
        {
          event_name: 'Purchase',
          event_time: Math.floor((order.paidAt ?? new Date()).getTime() / 1000),
          // Chave de deduplicacao com o pixel do browser: se os dois eventos
          // chegarem, o Meta conta uma compra so.
          event_id: order.id,
          action_source: 'website',
          user_data: userData,
          custom_data: {
            currency: 'BRL',
            value: order.amountCents / 100,
            content_ids: [`${order.figureSlug}:${order.sceneId}`],
            content_type: 'product',
          },
        },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`Meta CAPI ${res.status}: ${await res.text()}`);
  }

  await prisma.order.update({
    where: { id: order.id },
    data: { metaSentAt: new Date() },
  });
}
