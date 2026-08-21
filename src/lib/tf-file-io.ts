import fs from 'node:fs/promises';
import path from 'node:path';
import type { io } from '@tensorflow/tfjs-core';

/**
 * Carrega um modelo do tfjs a partir do disco.
 *
 * O tfjs em Node so sabe buscar modelo por HTTP — o `fetch` do undici nem
 * implementa o esquema `file://`. Como o modelo esta dentro da imagem Docker,
 * um IOHandler proprio evita a alternativa absurda de o servidor fazer uma
 * requisicao de rede para ler o proprio disco (e depender da rede para subir).
 */
export function fileSystemIO(modelJsonPath: string): io.IOHandler {
  return {
    load: async () => {
      const json = JSON.parse(await fs.readFile(modelJsonPath, 'utf8')) as {
        modelTopology: unknown;
        weightsManifest: { paths: string[]; weights: unknown[] }[];
        format?: string;
        generatedBy?: string;
        convertedBy?: string;
      };

      const dir = path.dirname(modelJsonPath);
      const chunks: Buffer[] = [];
      for (const group of json.weightsManifest) {
        for (const relative of group.paths) {
          chunks.push(await fs.readFile(path.join(dir, relative)));
        }
      }

      const merged = Buffer.concat(chunks);

      return {
        modelTopology: json.modelTopology as io.ModelArtifacts['modelTopology'],
        weightSpecs: json.weightsManifest.flatMap(
          (g) => g.weights,
        ) as io.ModelArtifacts['weightSpecs'],
        // `.buffer` sozinho devolveria o pool inteiro do Node, e nao so estes
        // bytes: o slice e obrigatorio para o modelo nao ler lixo adjacente.
        weightData: merged.buffer.slice(
          merged.byteOffset,
          merged.byteOffset + merged.byteLength,
        ) as ArrayBuffer,
        format: json.format,
        generatedBy: json.generatedBy,
        convertedBy: json.convertedBy,
      };
    },
  };
}
