import path from 'node:path';
import * as blazeface from '@tensorflow-models/blazeface';
import '@tensorflow/tfjs-backend-cpu';
import * as tf from '@tensorflow/tfjs-core';
import sharp from 'sharp';
import { fileSystemIO } from './tf-file-io';

/**
 * Validacao de foto ANTES de cobrar.
 *
 * Escopo deliberadamente estreito. A Fase 0 testou tres regras e so uma
 * sobreviveu aos dados:
 *
 *  - MAIS DE UM ROSTO -> rejeita. Confirmado: a foto com tres pessoas no carro
 *    fez o modelo escolher a pessoa errada. Mecanismo claro, dado consistente.
 *  - NENHUM ROSTO -> rejeita. Nao ha o que transferir.
 *  - "tamanho minimo do rosto" -> REFUTADA. Nos dados a correlacao veio
 *    INVERTIDA: as duas fotos que mais funcionaram tinham os menores rostos
 *    (1,8% e 2,2% do quadro) e as piores tinham os maiores (8% a 12%). Faz
 *    sentido: as cenas gerадas sao de corpo inteiro ao ar livre, entao entrada
 *    parecida com a saida funciona melhor. Aplicar essa regra teria barrado
 *    justamente as melhores fotos.
 *  - "rosto frontal" -> SEM APOIO. A segunda melhor foto tinha desvio alto.
 *
 * Contraste e brilho separaram bem as 8 amostras, mas um limiar que corta
 * perfeitamente 8 pontos e overfitting, nao descoberta. Se quiser automatizar
 * mais, colete mais dados primeiro.
 */

const MODEL_PATH = path.join(process.cwd(), 'public', 'models', 'blazeface', 'model.json');

/**
 * 1024px e o minimo que funciona: a 640px o detector perdeu completamente uma
 * foto boa de corpo inteiro (rosto pequeno demais em pixels). Medido, nao
 * chutado.
 */
const DETECT_SIZE = 1024;

export type FaceCheckCode = 'ok' | 'no_face' | 'multiple_faces' | 'unavailable';

export interface FaceCheckResult {
  code: FaceCheckCode;
  faces: number;
  /** Mensagem pronta para o usuario; vazia quando `ok`. */
  message: string;
}

let modelPromise: Promise<blazeface.BlazeFaceModel> | null = null;

function loadModel(): Promise<blazeface.BlazeFaceModel> {
  modelPromise ??= (async () => {
    await tf.setBackend('cpu');
    await tf.ready();
    return blazeface.load({ modelUrl: fileSystemIO(MODEL_PATH), maxFaces: 10 });
  })();
  return modelPromise;
}

export async function checkFaces(image: Buffer): Promise<FaceCheckResult> {
  let input: tf.Tensor3D | null = null;

  try {
    const model = await loadModel();

    const { data, info } = await sharp(image)
      .rotate()
      .resize({ width: DETECT_SIZE, height: DETECT_SIZE, fit: 'inside' })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    input = tf.tensor3d(new Uint8Array(data), [info.height, info.width, 3]);
    const faces = await model.estimateFaces(input, false);

    if (faces.length === 0) {
      return {
        code: 'no_face',
        faces: 0,
        message: 'Não encontramos um rosto nessa foto. Envie outra em que você apareça.',
      };
    }
    if (faces.length > 1) {
      return {
        code: 'multiple_faces',
        faces: faces.length,
        message:
          'Essa foto tem mais de uma pessoa e não sabemos qual é você. ' +
          'Envie uma foto em que você esteja sozinho.',
      };
    }

    return { code: 'ok', faces: 1, message: '' };
  } catch (err) {
    // Falha OPEN de proposito: se o modelo nao carregar, a venda continua. Um
    // detector quebrado bloqueando 100% dos pedidos e muito pior que deixar
    // passar algumas fotos ruins — para as quais ja existe o reembolso.
    console.error('[face-check] indisponível, liberando o pedido:', err);
    return { code: 'unavailable', faces: -1, message: '' };
  } finally {
    input?.dispose();
  }
}
