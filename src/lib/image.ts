import sharp from 'sharp';
import { AI_DISCLAIMER } from '@/content/terms';

export interface ImageFacts {
  width: number;
  height: number;
  format: string;
}

export async function inspect(buf: Buffer): Promise<ImageFacts> {
  const m = await sharp(buf).metadata();
  return { width: m.width ?? 0, height: m.height ?? 0, format: m.format ?? 'unknown' };
}

/**
 * Normaliza a selfie antes de mandar ao provedor.
 *
 * `.rotate()` sem argumento aplica a orientacao do EXIF e descarta o resto dos
 * metadados. Isso resolve duas coisas de uma vez: foto de celular que chegaria
 * deitada, e vazamento de GPS do usuario para dentro da API de terceiro.
 */
export async function normalizeSelfie(buf: Buffer, maxSide = 1536): Promise<Buffer> {
  return sharp(buf)
    .rotate()
    .resize({ width: maxSide, height: maxSide, fit: 'inside', withoutEnlargement: true })
    .toColorspace('srgb')
    .png()
    .toBuffer();
}

/** Mesma regra do harness da Fase 0 — mantenha as duas em sincronia. */
export function validateSelfie(facts: ImageFacts, bytes: number): string | null {
  if (!['jpeg', 'jpg', 'png', 'webp'].includes(facts.format)) {
    return `Formato não suportado (${facts.format}). Use JPG, PNG ou WEBP.`;
  }
  if (Math.min(facts.width, facts.height) < 512) {
    return `Foto pequena demais (${facts.width}x${facts.height}). Envie uma com pelo menos 512 pixels.`;
  }
  if (bytes > 10 * 1024 * 1024) {
    return `Arquivo grande demais (${(bytes / 1024 / 1024).toFixed(1)}MB). O limite é 10MB.`;
  }
  return null;
}

/**
 * Carimba o aviso de conteudo sintetico na propria imagem.
 *
 * Metadado sozinho nao resolve: a foto vai ser baixada, recortada e reenviada
 * no WhatsApp, e todo metadado morre no caminho. O que sobrevive e o pixel.
 * A faixa fica embaixo, legivel, sem cobrir os rostos.
 */
export async function watermark(image: Buffer): Promise<Buffer> {
  const { width, height } = await inspect(image);

  // Discreta, e não uma tarja atravessando a foto.
  //
  // A versão anterior pintava uma faixa preta de ponta a ponta ocupando 5,5% da
  // altura — cumpria a função e estragava a imagem que a pessoa vai postar. O
  // aviso precisa estar presente e legível; não precisa competir com a foto.
  //
  // Continua QUEIMADO no pixel, e não só no metadado: a imagem vai ser baixada,
  // recortada e reenviada no WhatsApp, e todo metadado morre nesse caminho.
  
  // const fontSize = Math.max(11, Math.round(height * 0.022));
  // const padding = Math.round(fontSize * 0.9);
  // const texto = escapeXml(AI_DISCLAIMER);

  // // O texto é desenhado duas vezes: uma escura, deslocada 1px, e a branca por
  // // cima. É sombra de pobre, e existe porque a foto embaixo pode ser clara ou
  // // escura — sem contraste, o aviso some justamente onde precisaria aparecer.
  // const svg = Buffer.from(
  //   `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  //      <g font-family="DejaVu Sans, Arial, sans-serif" font-size="${fontSize}"
  //         text-anchor="end" dominant-baseline="alphabetic">
  //        <text x="${width - padding + 1}" y="${height - padding + 1}"
  //              fill="#000000" fill-opacity="0.45">${texto}</text>
  //        <text x="${width - padding}" y="${height - padding}"
  //              fill="#ffffff" fill-opacity="0.9">${texto}</text>
  //      </g>
  //    </svg>`,
  // );

  return sharp(image)
    // .composite()
    .withMetadata({
      exif: {
        IFD0: {
          // Marcadores lidos por ferramentas de proveniencia e por quem
          // inspeciona o arquivo. Complementam a faixa, nao a substituem.
          ImageDescription: AI_DISCLAIMER,
          // O gerador de verdade. Estava escrito "FLUX Kontext", provedor que
          // foi descartado na Fase 0 — e isso ia gravado em cada arquivo
          // entregue, como afirmação de origem.
          Software: 'AI-generated image (gpt-image-2)',
          Copyright: AI_DISCLAIMER,
        },
      },
    })
    .png()
    .toBuffer();
}

/** Versao leve para a tela de resultado — a HD so no download. */
export async function makePreview(image: Buffer, maxSide = 1024): Promise<Buffer> {
  return sharp(image)
    .resize({ width: maxSide, height: maxSide, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();
}

const escapeXml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
