import type { Framing, Mood } from '@prisma/client';
import type { SceneConfig } from '@/content/types';

/**
 * Blocos de ENQUADRAMENTO, portados palavra por palavra do que foi medido em
 * 2026-08-14 (spike, variantes `enq-*`, nota 5 nas tres opcoes).
 *
 * A trava "large enough to be unmistakably recognisable" nos dois blocos
 * abertos NAO e enfeite: e ela que impede o modo de falha que uma medicao
 * anterior registrou — sem pedir enquadramento fechado, o rosto do cliente
 * ocupava ~150px e a nota caiu para 1 de 5. Se alguem "simplificar" esse texto,
 * o problema volta e so aparece depois de vender.
 */
const ENQUADRAMENTO: Record<Framing, string> = {
  CHEST_UP:
    `Framing is critical: this is an arm's-length selfie. Both heads must be large and ` +
    `fill the upper half of the frame, cropped at chest level, cheek to cheek, with the ` +
    `background only visible around them. Both faces sharp and in focus. `,

  HALF_BODY:
    `Framing: a half-body shot showing both people from the waist up, standing side by side, ` +
    `with the scene clearly visible around them. Both faces must remain sharp, in focus and ` +
    `large enough to be unmistakably recognisable. `,

  CLOSE_SELFIE:
    `Framing is critical: a very close arm's-length selfie. Both heads fill almost the entire ` +
    `frame, cheek to cheek, cropped at the shoulders, with very little background visible. ` +
    `Both faces sharp and in focus. `,
};

/**
 * Blocos de CLIMA, da mesma rodada.
 *
 * Eles vem DEPOIS do texto da cena e a SOBREPOEM — medido, nao suposto: um
 * comicio com clima `DISCREET` saiu sem bandeiras, com a multidao desfocada e
 * sem a faixa presidencial. Nao e defeito, e o modelo obedecendo a instrucao
 * mais recente. Mas significa que a amostra que o cliente viu na tela de cena
 * pode nao corresponder ao que ele recebe se escolher um clima que a contradiz.
 */
const CLIMA: Record<Mood, string> = {
  NONE: '',

  DISCREET:
    `Atmosphere: understated and calm. Few or no flags, no crowd pressing in, muted patriotic ` +
    `styling. `,

  FLAGS: `Atmosphere: a festive rally, many Brazilian flags visible around them, energetic crowd. `,

  CROWD:
    `Atmosphere: a warm, friendly encounter — ordinary people close around them, relaxed and ` +
    `welcoming, the feel of meeting someone admired in person. `,
};

/**
 * Montagem do prompt final.
 *
 * Fica separado do catalogo de cenas porque as duas coisas mudam por motivos
 * diferentes: a cena muda quando o marketing quer outro cenario, o prompt muda
 * quando a Fase 0 descobre o que o modelo entende.
 *
 * Estado: portado da variante `closeup-v2` do spike (2026-08-12), vencedora com
 * o gpt-image-2. Para iterar, mexa em spike/src/prompts.ts, meca, e so entao
 * traga para ca — o spike compara variantes lado a lado, aqui nao da.
 */

/**
 * Vale mais que qualquer adjetivo de qualidade: o jeito de este produto falhar
 * nao e gerar uma foto feia, e gerar uma foto bonita de OUTRA pessoa. O cliente
 * paga pelo proprio rosto.
 */
const IDENTITY_GUARD =
  'Preserve the exact facial identity, skin tone, hairline, facial hair and body type of ' +
  'each person; do not beautify, slim or age them. Photorealistic, natural skin texture, ' +
  'consistent lighting and perspective across both subjects.';

/**
 * Selfie + fotos de referencia da figura no mesmo request.
 *
 * Cada bloco abaixo existe porque uma rodada medida mostrou o modelo errando
 * sem ele. Antes de cortar qualquer um "para simplificar", meca no spike:
 *
 *  - ENQUADRAMENTO: sem pedir selfie de braco esticado, o rosto do cliente
 *    ocupava ~150px e a semelhanca desabava (nota 1 de 5).
 *  - LENTE: varias cenas pedem `wide-angle`, que deforma a geometria facial —
 *    ou seja, pede para o cliente parecer outra pessoa. Este bloco sobrepoe.
 *  - EXPRESSAO: forcar sorriso muda boca, bochecha e olhos, que e onde o
 *    reconhecimento mora. As cenas que pediam `smiling` eram as mais instaveis.
 *  - SEPARACAO DAS FONTES + IDADE: sem isso o modelo faz a MEDIA das duas
 *    pessoas — um cliente de 25 anos saia com 50, grisalho e de bigode. Note
 *    que a proibicao concreta ("do not grey their hair") e o que funciona; o
 *    pedido abstrato de fidelidade, sozinho, nao muda nada.
 */
export function multiRefPrompt(
  scene: SceneConfig,
  referenceCount: number,
  opcoes: { framing?: Framing; mood?: Mood } = {},
): string {
  return (
    `Edit these images into a single photo: ${scene.setting}. ` +
    ENQUADRAMENTO[opcoes.framing ?? 'CHEST_UP'] +
    CLIMA[opcoes.mood ?? 'NONE'] +
    `Render both faces with the undistorted geometry of a 50mm portrait lens: no ` +
    `wide-angle stretching, no fisheye, no enlarged nose or altered face proportions. ` +
    `Keep the exact facial expression the person on the left has in the first image — ` +
    `if they are not smiling there, they must not smile here. ` +
    `There are exactly two different people, and they must not be confused with each other. ` +
    `The person on the left comes ONLY from the first image. ` +
    `The person on the right comes ONLY from the following ${referenceCount} ` +
    `reference image${referenceCount > 1 ? 's' : ''}. ` +
    `The two people may differ by decades in age — keep the person on the left at exactly ` +
    `the apparent age, build, hair colour and facial hair he or she has in the first image. ` +
    `Do not age them, do not grey their hair, do not add or thicken facial hair, ` +
    `do not make them resemble the person on the right in any way. ` +
    IDENTITY_GUARD
  );
}

/** Rota B do spike: identidade da figura vem de uma LoRA treinada. */
export function loraPrompt(scene: SceneConfig, trigger: string): string {
  return (
    `Create ${scene.setting}. ` +
    `The person on the left is the person from the input image. ` +
    `The person on the right is ${trigger}. ` +
    IDENTITY_GUARD
  );
}

/** Rota C do spike: cena pronta, o modelo so insere o rosto do cliente. */
export function platePrompt(): string {
  return (
    'Replace the face and hair of the person on the left in image 1 with the face and hair ' +
    'of the person in image 2, keeping image 1 otherwise completely unchanged: same pose, ' +
    'same clothing, same background, same lighting and same camera angle. ' +
    IDENTITY_GUARD
  );
}
