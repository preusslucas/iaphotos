import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { env } from './env';

/** Capacidade de acesso a um pedido. 32 bytes: nao ha o que enumerar. */
export const newAccessToken = () => randomBytes(32).toString('base64url');

/**
 * Comparacao de segredos em tempo constante.
 *
 * `a === b` vaza o tamanho do prefixo correto pelo tempo de resposta, o que
 * permite descobrir um token byte a byte. Como o timingSafeEqual exige buffers
 * do mesmo tamanho, comparamos os digests — que sempre tem 32 bytes — em vez
 * dos valores crus.
 */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHmac('sha256', 'cmp').update(a).digest();
  const hb = createHmac('sha256', 'cmp').update(b).digest();
  return timingSafeEqual(ha, hb);
}

/**
 * Link de entrega assinado, para o e-mail. Carrega o proprio prazo de validade,
 * entao o servidor nao precisa guardar nada por link enviado.
 */
export function signDeliveryToken(orderId: string, expiresAt: number): string {
  const payload = `${orderId}.${expiresAt}`;
  return `${payload}.${sign(payload)}`;
}

export function verifyDeliveryToken(token: string): { orderId: string } | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [orderId, expiresAtRaw, signature] = parts as [string, string, string];
  const payload = `${orderId}.${expiresAtRaw}`;
  if (!safeEqual(signature, sign(payload))) return null;

  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return null;

  return { orderId };
}

/**
 * Deriva a chave de assinatura do segredo do webhook em vez de pedir mais uma
 * variavel de ambiente. O prefixo separa os dominios de uso: assinar link de
 * entrega nunca produz um valor que sirva como assinatura de outra coisa.
 */
const sign = (payload: string) =>
  createHmac('sha256', `delivery:${env().MP_WEBHOOK_SECRET}`).update(payload).digest('base64url');
