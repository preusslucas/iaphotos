/**
 * `moderated` NAO e um erro tecnico: e o provedor recusando o conteudo, e
 * repetir gasta dinheiro sem nenhuma chance de sucesso. O worker trata os dois
 * casos de forma oposta, e classificar errado custa nos dois sentidos —
 * ver a funcao `classify` em cada provedor.
 */
export type GenerationOutcome = 'ok' | 'moderated' | 'error' | 'timeout';

export interface ProviderResult {
  outcome: GenerationOutcome;
  image?: Buffer;
  /** Id do job no provedor, para rastrear uma geracao especifica no suporte. */
  providerJobId?: string;
  detail?: string;
}

export interface GenerateRequest {
  prompt: string;
  /** Primeira imagem e a selfie; as demais sao referencias da figura. */
  images: Buffer[];
  aspectRatio: string;
  seed?: number;
  timeoutMs?: number;
}
