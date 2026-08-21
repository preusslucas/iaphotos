import { createHmac } from 'node:crypto';
import { cookies } from 'next/headers';
import { env } from './env';
import { safeEqual } from './tokens';

export const ADMIN_COOKIE = 'ia_admin';

/**
 * Autenticacao do painel: uma senha e um cookie assinado.
 *
 * Deliberadamente simples — o /admin e usado por uma ou duas pessoas. Montar
 * usuarios, sessoes e recuperacao de senha aqui seria superficie de ataque e
 * codigo para manter sem nenhum ganho real.
 *
 * O valor do cookie e um HMAC da senha, nunca a senha: um cookie roubado nao
 * revela o segredo, e trocar ADMIN_PASSWORD invalida todas as sessoes de uma vez.
 */
const cookieValue = () =>
  createHmac('sha256', env().ADMIN_PASSWORD).update('admin-session').digest('base64url');

export function passwordMatches(attempt: string): boolean {
  return safeEqual(attempt, env().ADMIN_PASSWORD);
}

export function sessionCookie() {
  return {
    name: ADMIN_COOKIE,
    value: cookieValue(),
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 12,
  };
}

export async function isAuthenticated(): Promise<boolean> {
  const jar = await cookies();
  const value = jar.get(ADMIN_COOKIE)?.value;
  return value ? safeEqual(value, cookieValue()) : false;
}
