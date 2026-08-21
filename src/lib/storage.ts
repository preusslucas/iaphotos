import { Client } from 'minio';
import { env } from './env';

let cached: Client | null = null;

export function s3(): Client {
  if (cached) return cached;

  const cfg = env();
  cached = new Client({
    endPoint: cfg.S3_ENDPOINT,
    port: cfg.S3_PORT,
    useSSL: cfg.S3_USE_SSL,
    accessKey: cfg.S3_ACCESS_KEY,
    secretKey: cfg.S3_SECRET_KEY,
  });
  return cached;
}

export const bucket = () => env().S3_BUCKET;

/**
 * Cria o bucket se faltar. Idempotente — roda no boot do worker para que um
 * ambiente novo (ou o MinIO local recriado do zero) suba sem passo manual.
 */
export async function ensureBucket(): Promise<void> {
  const client = s3();
  const name = bucket();
  if (!(await client.bucketExists(name))) {
    await client.makeBucket(name);
  }
}

/**
 * URL para o browser enviar a selfie DIRETO ao MinIO. O arquivo nunca passa
 * pelo processo do Next: um upload de 10MB por request ocuparia o event loop
 * do servidor que precisa estar livre para vender.
 */
export function presignedUpload(objectKey: string, expirySeconds = 300): Promise<string> {
  return s3().presignedPutObject(bucket(), objectKey, expirySeconds);
}

/** URL de leitura temporaria. O bucket e privado; nada e servido sem assinatura. */
export function presignedDownload(objectKey: string, expirySeconds = 3600): Promise<string> {
  return s3().presignedGetObject(bucket(), objectKey, expirySeconds);
}

/**
 * Igual a `presignedDownload`, mas a resposta vem com `Content-Disposition:
 * attachment` — o navegador BAIXA o arquivo em vez de abrir numa aba.
 *
 * Precisa ser aqui, na assinatura da URL, e nao no `<a download>` do HTML: esse
 * atributo e IGNORADO quando o link aponta para outra origem, e a URL assinada
 * aponta para o MinIO, que nunca e o mesmo dominio do app. Com o atributo
 * sozinho o resultado e o navegador navegar ate a imagem e mostra-la — o
 * usuario pagou e precisa saber salvar a foto por conta propria.
 *
 * O `filename` chega ao usuario como nome do arquivo salvo, entao vale um nome
 * que ele reconheca depois no meio da galeria.
 */
export function presignedAttachment(
  objectKey: string,
  filename: string,
  expirySeconds = 3600,
): Promise<string> {
  return s3().presignedGetObject(bucket(), objectKey, expirySeconds, {
    'response-content-disposition': `attachment; filename="${sanitizeFilename(filename)}"`,
  });
}

/**
 * O nome vai dentro de um header HTTP entre aspas: quebra de linha ou aspas
 * dentro dele quebrariam o header (ou pior, permitiriam injetar outro). Como o
 * nome nasce de dados nossos e nao do usuario, isto e cinto e suspensorio — mas
 * o dia em que virar `figure.productName` editavel, ja esta protegido.
 */
function sanitizeFilename(name: string): string {
  return name.replace(/[^\w.\- ]+/g, '-').slice(0, 100);
}

export async function putObject(
  objectKey: string,
  body: Buffer,
  mimeType: string,
): Promise<void> {
  await s3().putObject(bucket(), objectKey, body, body.byteLength, {
    'Content-Type': mimeType,
  });
}

export async function getObject(objectKey: string): Promise<Buffer> {
  const stream = await s3().getObject(bucket(), objectKey);
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

export async function removeObject(objectKey: string): Promise<void> {
  await s3().removeObject(bucket(), objectKey);
}

/** Objeto existe? Usado antes de cobrar, para provar que a selfie chegou. */
export async function objectExists(objectKey: string): Promise<boolean> {
  try {
    await s3().statObject(bucket(), objectKey);
    return true;
  } catch {
    return false;
  }
}

export async function pingStorage(): Promise<void> {
  await s3().bucketExists(bucket());
}

/**
 * Chaves organizadas por pedido: um `removeObjects` por prefixo apaga tudo de
 * um cliente de uma vez, que e o que a exclusao por LGPD precisa fazer.
 */
export const keys = {
  selfie: (orderId: string, ext: string) => `orders/${orderId}/selfie.${ext}`,

  // Uma chave por ITEM desde 2026-08-13, quando um pedido passou a poder ter
  // mais de uma foto. As duas funcoes antigas ficam para os pedidos anteriores,
  // que gravaram em `result.png` — sem elas, uma foto ja vendida some.
  result: (orderId: string, itemId?: string) =>
    itemId ? `orders/${orderId}/${itemId}/result.png` : `orders/${orderId}/result.png`,
  preview: (orderId: string, itemId?: string) =>
    itemId ? `orders/${orderId}/${itemId}/preview.webp` : `orders/${orderId}/preview.webp`,

  orderPrefix: (orderId: string) => `orders/${orderId}/`,
};
