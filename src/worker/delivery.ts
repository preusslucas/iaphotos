import { sendResultEmail } from '@/lib/email';

/**
 * Ponto unico de entrega ao cliente. Hoje e so o e-mail; quando entrar WhatsApp
 * (o canal que de fato converte no Brasil), entra aqui e nada mais muda.
 */
export async function deliverOrder(orderId: string): Promise<void> {
  await sendResultEmail(orderId);
}
