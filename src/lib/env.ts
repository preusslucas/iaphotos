import { z } from 'zod';

/**
 * Contrato de configuracao do servidor.
 *
 * A validacao e PREGUICOSA de proposito. Se ela rodasse no import, o
 * `next build` dentro do Docker quebraria — a imagem e construida sem os
 * secrets, que so aparecem quando o Coolify sobe o container. Validando no
 * primeiro acesso, o build passa e um deploy mal configurado falha no boot,
 * com mensagem clara, em vez de dar 500 na primeira venda.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  S3_ENDPOINT: z.string().min(1),
  S3_PORT: z.coerce.number().int().positive().default(443),
  S3_USE_SSL: z
    .string()
    .default('true')
    .transform((v) => v !== 'false'),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_BUCKET: z.string().min(1).default('ia-photos'),

  /** Provedor de geracao escolhido na Fase 0: Seedream 4.5, servido pelo fal.ai. */
  FAL_KEY: z.string().min(1),
  /** Legado: so serve se voltarmos ao FLUX Kontext direto na BFL. */
  BFL_API_KEY: z.string().optional(),

  MP_ACCESS_TOKEN: z.string().min(1),
  /** Segredo do webhook, usado para validar a assinatura x-signature. */
  MP_WEBHOOK_SECRET: z.string().min(1),

  /** URL publica do app, usada para montar links de retorno e de webhook. */
  APP_URL: z.string().url(),

  /** Senha do /admin. Sem isso o painel simplesmente nao sobe. */
  ADMIN_PASSWORD: z.string().min(12),

  /**
   * WhatsApp do suporte, so digitos com DDI (ex.: 5541999999999).
   *
   * NAO e `NEXT_PUBLIC_` de proposito: essa prefixo embutiria o numero no bundle
   * JS servido a todo visitante da landing. Aqui ele fica no servidor e so sai
   * na resposta de status de um pedido — ou seja, so chega a quem ja criou um
   * pedido (tem token valido), nunca a quem so esta navegando na landing.
   *
   * Opcional: sem ele as telas de Pix e retencao aparecem iguais, so sem o botao.
   */
  SUPPORT_WHATSAPP: z
    .string()
    // Vazio conta como ausente. `.optional()` sozinho so aceita `undefined`, e a
    // variavel declarada sem valor no .env chega como string vazia — do jeito
    // que o .env.example a deixa. Sem este preprocess, deixar em branco (o caso
    // NORMAL, ja que ela e opcional) derrubaria o boot inteiro.
    .regex(/^\d{10,15}$/, 'SUPPORT_WHATSAPP deve ter só dígitos com DDI, ex.: 5541999999999')
    .optional()
    .or(z.literal('').transform(() => undefined)),

  /** Retencao LGPD, em dias. */
  SELFIE_RETENTION_DAYS: z.coerce.number().int().positive().default(7),
  RESULT_RETENTION_DAYS: z.coerce.number().int().positive().default(30),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;

  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(raiz)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Configuracao invalida. Confira o .env:\n${problems}`);
  }

  cached = parsed.data;
  return cached;
}

/** Só para testes: descarta o cache entre cenários de configuração. */
export function resetEnvCache() {
  cached = null;
}
