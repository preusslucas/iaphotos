import { getFigure } from '@/content';
import { LEGAL_FOOTER } from '@/content/terms';
import { env } from './env';
import { prisma } from './prisma';
import { signDeliveryToken } from './tokens';

/**
 * E-mail transacional via Brevo (mesma conta ja usada no 21-days). Usamos a
 * API HTTP direto em vez do SDK: sao dois templates, e o SDK traria dependencia
 * e superficie que nao se pagam.
 *
 * Opcional: sem BREVO_API_KEY o app funciona e o cliente ainda ve o resultado
 * na tela — o e-mail e reforco, nao o unico canal de entrega.
 */
const API_KEY = process.env.BREVO_API_KEY;
const FROM_EMAIL = process.env.BREVO_FROM_EMAIL ?? 'nao-responda@localhost';
const FROM_NAME = process.env.BREVO_FROM_NAME ?? 'Foto IA';

const DELIVERY_LINK_DAYS = 30;

async function send(to: string, subject: string, html: string): Promise<void> {
  if (!API_KEY) {
    console.warn('[email] BREVO_API_KEY ausente; e-mail não enviado para', to);
    return;
  }

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': API_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({
      sender: { email: FROM_EMAIL, name: FROM_NAME },
      to: [{ email: to }],
      subject,
      htmlContent: html,
    }),
  });

  if (!res.ok) throw new Error(`Brevo ${res.status}: ${await res.text()}`);
}

/**
 * Avisa que a foto ficou pronta. Idempotente por `notifiedAt`: worker e admin
 * podem disparar a entrega, e ninguem quer receber o mesmo e-mail duas vezes.
 */
export async function sendResultEmail(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order?.email || order.notifiedAt) return;

  const figure = await getFigure(order.figureSlug);
  const token = signDeliveryToken(order.id, Date.now() + DELIVERY_LINK_DAYS * 24 * 3600 * 1000);
  const link = `${env().APP_URL}/r/${token}`;

  await send(
    order.email,
    `Sua foto está pronta — ${figure?.productName ?? 'Foto IA'}`,
    `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#111">
      <h1 style="font-size:22px">Sua foto ficou pronta!</h1>
      <p>Clique abaixo para ver, baixar em alta resolução e pegar os seus bônus.</p>
      <p style="margin:28px 0">
        <a href="${link}" style="background:#16a34a;color:#fff;padding:14px 26px;
           border-radius:8px;text-decoration:none;font-weight:bold">Ver minha foto</a>
      </p>
      <p style="font-size:13px;color:#666">Este link é pessoal e expira em ${DELIVERY_LINK_DAYS} dias.</p>
      <hr style="border:none;border-top:1px solid #e5e5e5;margin:24px 0">
      <p style="font-size:11px;color:#888">${LEGAL_FOOTER}</p>
    </div>`,
  );

  await prisma.order.update({
    where: { id: order.id },
    data: { notifiedAt: new Date() },
  });
}

/** Avisa que nao deu certo e que o dinheiro voltou. */
export async function sendFailureEmail(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order?.email) return;

  await send(
    order.email,
    'Não conseguimos gerar sua foto — reembolso a caminho',
    `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#111">
      <h1 style="font-size:22px">Não deu certo desta vez</h1>
      <p>Tentamos gerar a sua foto, mas não conseguiu sair com a qualidade que prometemos.</p>
      <p><strong>O seu pagamento já foi estornado.</strong> Se pagou no Pix, o valor volta
      em minutos; no cartão, em até duas faturas, conforme o seu banco.</p>
      <p>Se quiser tentar de novo, uma foto sua de meio corpo, ao ar livre e de dia,
      e sozinho na imagem, costuma resolver.</p>
      <hr style="border:none;border-top:1px solid #e5e5e5;margin:24px 0">
      <p style="font-size:11px;color:#888">${LEGAL_FOOTER}</p>
    </div>`,
  );
}
