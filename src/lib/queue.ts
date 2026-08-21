import { Queue, type JobsOptions } from 'bullmq';
import { redis } from './redis';

export const QUEUE_GENERATION = 'generation';
export const QUEUE_RETENTION = 'retention';

export interface GenerationJobData {
  orderId: string;
}

/**
 * 3 tentativas com backoff exponencial a partir de 5s. O que costuma falhar
 * aqui e instabilidade momentanea do provedor; o que NAO adianta repetir e
 * moderacao de conteudo — o worker marca esses casos como definitivos para nao
 * queimar 3x o custo num pedido que jamais vai passar.
 */
export const generationJobOptions: JobsOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5_000 },
  removeOnComplete: { age: 7 * 24 * 3600, count: 5_000 },
  removeOnFail: { age: 30 * 24 * 3600 },
};

let generationQueue: Queue<GenerationJobData> | null = null;

export function getGenerationQueue(): Queue<GenerationJobData> {
  generationQueue ??= new Queue<GenerationJobData>(QUEUE_GENERATION, {
    connection: redis(),
    defaultJobOptions: generationJobOptions,
  });
  return generationQueue;
}

/**
 * Enfileira a geracao de um pedido pago.
 *
 * `jobId` = orderId de proposito: o BullMQ recusa um job com id ja existente,
 * entao um webhook duplicado do Mercado Pago vira no-op em vez de uma segunda
 * imagem cobrada. Junto com a constraint unica em `mpPaymentId`, sao duas
 * barreiras independentes contra pagar duas vezes pelo mesmo pedido.
 */
export async function enqueueGeneration(orderId: string): Promise<void> {
  await getGenerationQueue().add('generate', { orderId }, { jobId: orderId });
}
