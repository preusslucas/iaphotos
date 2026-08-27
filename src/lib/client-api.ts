'use client';

/**
 * Cliente de API do funil. Concentra o tratamento de erro em um lugar para que
 * as telas nunca mostrem "[object Object]" ao usuario — numa pagina de venda,
 * um erro ilegivel e uma venda perdida.
 */

export interface CreatedOrder {
  orderId: string;
  accessToken: string;
  uploadUrl: string;
  objectKey: string;
  amountCents: number;
  /** Preço levando todas as fotos. Nulo quando a figura não tem adicional. */
  bundlePriceCents: number | null;
  /** Nomes dos produtos adicionais, para a tela do order bump. */
  addons: string[];
}

export interface OrderStatus {
  status: string;
  paid: boolean;
  /** Entregue. */
  ready: boolean;
  /** Falha definitiva: estorno já disparado. */
  failed: boolean;
  /** Falha com conserto: pagamento RETIDO, esperando ação humana. Não é `failed`. */
  needsReview: boolean;
  failureReason: string | null;
  mpStatus: string | null;
  /** Nunca fica no bundle público — só chega em resposta a um token válido. */
  supportWhatsapp: string | null;
}

export interface ResultPhoto {
  figureSlug: string;
  /** Nome do produto daquela foto, ex.: "Foto com o Trump". */
  label: string;
  sceneLabel: string;
  /** URL inline: serve de fallback do `<img>` e do compartilhamento nativo. */
  resultUrl: string;
  /** URL com `Content-Disposition: attachment` — a única que realmente baixa. */
  downloadUrl: string;
  previewUrl: string | null;
  width: number | null;
  height: number | null;
}

export interface OrderResult {
  photos: ResultPhoto[];
  bonuses: { label: string; description: string; url: string }[];
  /** Quantas fotos o cliente comprou. */
  compradas: number;
  /** Quantas já ficaram prontas. Menor que `compradas` = pedido retido. */
  prontas: number;
}

export type FileExt = 'jpg' | 'jpeg' | 'png' | 'webp';

async function parse<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(
      (data as { error?: string } | null)?.error ?? 'Algo deu errado. Tente novamente.',
    );
  }
  return data as T;
}

export function createOrder(input: {
  figureSlug: string;
  sceneId: string;
  fileExt: FileExt;
  /** Passo 2. Cada opção troca um bloco do prompt — todas foram medidas. */
  framing: 'CHEST_UP' | 'HALF_BODY' | 'CLOSE_SELFIE';
  /** Passo 3. `NONE` deixa a cena falar sozinha. */
  mood: 'NONE' | 'DISCREET' | 'FLAGS' | 'CROWD';
}): Promise<CreatedOrder> {
  return fetch('/api/orders', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...input, consent: true }),
  }).then(parse<CreatedOrder>);
}

/**
 * PUT direto no MinIO com a URL assinada. O arquivo nunca passa pelo servidor
 * do Next — o `content-type` precisa bater com o que foi assinado.
 */
export async function uploadSelfie(uploadUrl: string, file: File): Promise<void> {
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'content-type': file.type },
    body: file,
  });
  if (!res.ok) throw new Error('Não conseguimos enviar sua foto. Verifique a conexão.');
}

export function checkoutPix(input: {
  orderId: string;
  accessToken: string;
  email: string;
  phone?: string;
  fileExt: FileExt;
  /** Order bump: leva todas as fotos. O preço é recalculado no servidor. */
  combo: boolean;
}) {
  const { accessToken, ...body } = input;
  return fetch('/api/checkout', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-order-token': accessToken },
    body: JSON.stringify({ ...body, method: 'pix' }),
  }).then(
    parse<{
      method: 'pix';
      status: string;
      qrCode: string;
      qrCodeBase64: string;
      expiresAt: string | null;
    }>,
  );
}

export function getStatus(orderId: string, accessToken: string): Promise<OrderStatus> {
  return fetch(`/api/orders/${orderId}/status`, {
    headers: { 'x-order-token': accessToken },
    cache: 'no-store',
  }).then(parse<OrderStatus>);
}

export function getResult(orderId: string, accessToken: string): Promise<OrderResult> {
  return fetch(`/api/orders/${orderId}/result`, {
    headers: { 'x-order-token': accessToken },
    cache: 'no-store',
  }).then(parse<OrderResult>);
}

export function extOf(file: File): FileExt | null {
  const map: Record<string, FileExt> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
  };
  return map[file.type] ?? null;
}
