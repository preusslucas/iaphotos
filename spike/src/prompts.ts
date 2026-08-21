/**
 * VARIANTES DE PROMPT — edite este arquivo à vontade.
 *
 * É o único arquivo que você precisa mexer para testar uma ideia nova de
 * prompt. Adicione uma entrada aqui e rode:
 *
 *   pnpm run run -- --routes=d --prompt=<id> --scenes=comicio --limit=3
 *
 * A variante fica registrada em cada resultado, então o review.html e o
 * summary comparam variantes lado a lado sem você organizar nada à mão.
 */

export interface PromptVariant {
  id: string;
  /** Uma linha explicando o que esta variante está tentando provar. */
  hypothesis: string;
  build(input: { setting: string; refCount: number }): string;
}

/**
 * O que sabemos da rodada de 2026-08-11: o modo de falha NÃO é foto feia, é
 * foto bonita de outra pessoa. Por isso toda variante carrega alguma forma de
 * trava de identidade — o que muda entre elas é a força e a formulação.
 */
const IDENTITY_GUARD =
  'Preserve the exact facial identity, skin tone, hairline, facial hair and body type of ' +
  'each person; do not beautify, slim or age them. Photorealistic, natural skin texture, ' +
  'consistent lighting and perspective across both subjects.';

/**
 * Blocos de ENQUADRAMENTO. O padrão é o do `closeup-v2`, que é o que a Fase 0
 * validou; os outros dois existem para medir o preço das opções da tela.
 */
const ENQ_PADRAO =
  `Framing is critical: this is an arm's-length selfie. Both heads must be large and ` +
  `fill the upper half of the frame, cropped at chest level, cheek to cheek, with the ` +
  `background only visible around them. Both faces sharp and in focus. `;

const MEIO_CORPO =
  `Framing: a half-body shot showing both people from the waist up, standing side by side, ` +
  `with the scene clearly visible around them. Both faces must remain sharp, in focus and ` +
  `large enough to be unmistakably recognisable. `;

const SELFIE_PROXIMA =
  `Framing is critical: a very close arm's-length selfie. Both heads fill almost the entire ` +
  `frame, cheek to cheek, cropped at the shoulders, with very little background visible. ` +
  `Both faces sharp and in focus. `;

/**
 * Blocos de CLIMA. Entram DEPOIS do texto da cena, então podem contradizê-lo —
 * medir essa contradição é metade do objetivo desta rodada.
 */
const CLIMA_DISCRETO =
  `Atmosphere: understated and calm. Few or no flags, no crowd pressing in, muted patriotic ` +
  `styling. `;

const CLIMA_BANDEIRAS =
  `Atmosphere: a festive rally, many Brazilian flags visible around them, energetic crowd. `;

const CLIMA_POPULAR =
  `Atmosphere: a warm, friendly encounter — ordinary people close around them, relaxed and ` +
  `welcoming, the feel of meeting someone admired in person. `;

/** Monta o `closeup-v2` trocando um bloco por vez. */
function closeupV2({
  setting,
  refCount,
  framing = ENQ_PADRAO,
  mood = '',
}: {
  setting: string;
  refCount: number;
  framing?: string;
  mood?: string;
}): string {
  return (
    `Edit these images into a single photo: ${setting}. ` +
    framing +
    mood +
    `Render both faces with the undistorted geometry of a 50mm portrait lens: no ` +
    `wide-angle stretching, no fisheye, no enlarged nose or altered face proportions. ` +
    `Keep the exact facial expression the person on the left has in the first image — ` +
    `if they are not smiling there, they must not smile here. ` +
    `There are exactly two different people, and they must not be confused with each other. ` +
    `The person on the left comes ONLY from the first image. ` +
    `The person on the right comes ONLY from the following ${refCount} ` +
    `reference image${refCount > 1 ? 's' : ''}. ` +
    `The two people may differ by decades in age — keep the person on the left at exactly ` +
    `the apparent age, build, hair colour and facial hair he or she has in the first image. ` +
    `Do not age them, do not grey their hair, do not add or thicken facial hair, ` +
    `do not make them resemble the person on the right in any way. ` +
    IDENTITY_GUARD
  );
}

export const PROMPT_VARIANTS: PromptVariant[] = [
  {
    id: 'base',
    hypothesis: 'Linha de base da Fase 0: 2/3 na cena boa. É contra ela que se compara.',
    build: ({ setting, refCount }) =>
      `Create ${setting}. ` +
      `The person on the left is the person from image 1. ` +
      `The person on the right is the person shown in the following ${refCount} ` +
      `reference image${refCount > 1 ? 's' : ''}. ` +
      IDENTITY_GUARD,
  },

  {
    id: 'keep-subject',
    hypothesis:
      'Manda PRESERVAR a pessoa da imagem 1 em vez de "criar uma cena". ' +
      'Se o modelo entender que é edição e não geração, a identidade deveria segurar melhor.',
    build: ({ setting, refCount }) =>
      `Keep the person from image 1 exactly as they are — same face, same hair, same body, ` +
      `same clothes — and place them into a new scene: ${setting}. ` +
      `Standing on their right is the person from the following ${refCount} ` +
      `reference image${refCount > 1 ? 's' : ''}. ` +
      `Do not redraw or replace the person from image 1; only change their surroundings. ` +
      IDENTITY_GUARD,
  },

  {
    id: 'framing',
    hypothesis:
      'Fixa o enquadramento em meio corpo para os dois. As fotos que funcionaram eram ' +
      'meio/corpo inteiro; talvez pedir isso explicitamente estabilize o resto.',
    build: ({ setting, refCount }) =>
      `Create ${setting}. ` +
      `Frame both people from the knees up, standing side by side, both facing the camera, ` +
      `their faces clearly visible and sharp, occupying the center of the image. ` +
      `The person on the left is the person from image 1. ` +
      `The person on the right is the person shown in the following ${refCount} ` +
      `reference image${refCount > 1 ? 's' : ''}. ` +
      IDENTITY_GUARD,
  },

  {
    id: 'no-mix',
    hypothesis:
      'Rodada 2026-08-12 (e-nano-banana): o cliente saiu com a IDADE e o bigode da figura. ' +
      'O modo de falha nao e perder a identidade, e MISTURAR as duas. Esta variante diz ' +
      'explicitamente de onde cada rosto NAO pode vir.',
    build: ({ setting, refCount }) =>
      `Edit these images into a single photo: ${setting}. ` +
      `There are exactly two different people, and they must not be confused with each other. ` +
      `The person on the left comes ONLY from the first image. ` +
      `The person on the right comes ONLY from the following ${refCount} ` +
      `reference image${refCount > 1 ? 's' : ''}. ` +
      `Never transfer any facial feature between them: not the age, not the hair colour or ` +
      `hairline, not the facial hair, not the skin or the body type. ` +
      `They are two unrelated people who happen to be standing together. ` +
      IDENTITY_GUARD,
  },

  {
    id: 'no-mix-age',
    hypothesis:
      'no-mix + trava explicita de idade. Isola se a clausula de idade acrescenta algo ' +
      'alem da separacao de fontes — os dois sujeitos podem ter 25 anos de diferenca.',
    build: ({ setting, refCount }) =>
      `Edit these images into a single photo: ${setting}. ` +
      `There are exactly two different people, and they must not be confused with each other. ` +
      `The person on the left comes ONLY from the first image. ` +
      `The person on the right comes ONLY from the following ${refCount} ` +
      `reference image${refCount > 1 ? 's' : ''}. ` +
      `The two people may differ by decades in age — keep the person on the left at exactly ` +
      `the apparent age, build, hair colour and facial hair he or she has in the first image. ` +
      `Do not age them, do not grey their hair, do not add or thicken facial hair, ` +
      `do not make them resemble the person on the right in any way. ` +
      IDENTITY_GUARD,
  },

  {
    id: 'closeup',
    hypothesis:
      'Rodada 2026-08-12: o e-nano-banana tirou nota 1 com o rosto do cliente ocupando ~150px ' +
      'de altura; o d-seedream tirou 3 com ~700px. Semelhanca e orcamento de pixel no rosto. ' +
      'Esta variante forca o enquadramento de selfie de braco esticado — mesmo teto de ' +
      'resolucao, muito mais pixel gasto em rosto e nao em calcada.',
    build: ({ setting, refCount }) =>
      `Edit these images into a single photo: ${setting}. ` +
      `Framing is critical: this is an arm's-length selfie. Both heads must be large and ` +
      `fill the upper half of the frame, cropped at chest level, cheek to cheek, with the ` +
      `background only visible around them. Both faces sharp and in focus. ` +
      `There are exactly two different people, and they must not be confused with each other. ` +
      `The person on the left comes ONLY from the first image. ` +
      `The person on the right comes ONLY from the following ${refCount} ` +
      `reference image${refCount > 1 ? 's' : ''}. ` +
      `The two people may differ by decades in age — keep the person on the left at exactly ` +
      `the apparent age, build, hair colour and facial hair he or she has in the first image. ` +
      `Do not age them, do not grey their hair, do not add or thicken facial hair, ` +
      `do not make them resemble the person on the right in any way. ` +
      IDENTITY_GUARD,
  },

  {
    id: 'closeup-v2',
    hypothesis:
      'Pontuacao de 2026-08-12 (g-gpt-image-2, closeup): 80% >=4, mas a variancia se ' +
      'concentrou nas cenas cuja descricao briga com a selfie — selfie-rua (5,3,2) pede ' +
      '"wide-angle lens distortion" e "smiling", estadio (5,4,3) pede "looking at the ' +
      'camera". As estaveis (moto, feira, comicio: 4,4,4) nao pedem nada disso. ' +
      'Esta variante faz o prompt SOBREPOR o texto da cena nesses dois pontos, em vez de ' +
      'depender de cada cena ser escrita com cuidado.',
    build: ({ setting, refCount }) =>
      `Edit these images into a single photo: ${setting}. ` +
      `Framing is critical: this is an arm's-length selfie. Both heads must be large and ` +
      `fill the upper half of the frame, cropped at chest level, cheek to cheek, with the ` +
      `background only visible around them. Both faces sharp and in focus. ` +
      // Contra "wide-angle lens distortion" no texto da cena: distorcer a
      // geometria do rosto e o mesmo que pedir para ele parecer outra pessoa.
      `Render both faces with the undistorted geometry of a 50mm portrait lens: no ` +
      `wide-angle stretching, no fisheye, no enlarged nose or altered face proportions. ` +
      // Contra "smiling at the camera": expressao e onde o reconhecimento mora.
      `Keep the exact facial expression the person on the left has in the first image — ` +
      `if they are not smiling there, they must not smile here. ` +
      `There are exactly two different people, and they must not be confused with each other. ` +
      `The person on the left comes ONLY from the first image. ` +
      `The person on the right comes ONLY from the following ${refCount} ` +
      `reference image${refCount > 1 ? 's' : ''}. ` +
      `The two people may differ by decades in age — keep the person on the left at exactly ` +
      `the apparent age, build, hair colour and facial hair he or she has in the first image. ` +
      `Do not age them, do not grey their hair, do not add or thicken facial hair, ` +
      `do not make them resemble the person on the right in any way. ` +
      IDENTITY_GUARD,
  },

  // ------------------------------------------------------------------
  // ENQUADRAMENTO E CLIMA escolhidos pelo cliente (pedido de 2026-08-14).
  //
  // O funil de referência pergunta enquadramento e clima em dois passos
  // próprios. Antes de vender isso é preciso saber quanto custa em semelhança,
  // porque o bloco de ENQUADRAMENTO do `closeup-v2` existe justamente por uma
  // medição: sem pedir selfie de braço esticado, o rosto do cliente ocupava
  // ~150px e a nota caiu para 1 de 5.
  //
  // As variantes abaixo mudam UMA coisa por vez em relação ao `closeup-v2`,
  // que é a linha de base. Comparar `enq-meio-corpo` contra `closeup-v2` diz
  // exatamente o preço daquela opção — misturar eixos custaria o mesmo e não
  // concluiria nada.
  // ------------------------------------------------------------------

  {
    id: 'enq-meio-corpo',
    hypothesis:
      'A opção "Meio corpo" pede o OPOSTO do bloco que salvou a semelhança. Expectativa: ' +
      'degrada. Se degradar, a opção não deve existir na tela como está.',
    build: ({ setting, refCount }) =>
      closeupV2({ setting, refCount, framing: MEIO_CORPO }),
  },

  {
    id: 'enq-selfie-proxima',
    hypothesis:
      'A opção "Selfie próxima" aperta ainda mais o enquadramento que já funciona. ' +
      'Expectativa: mantém ou melhora — rosto maior em pixels foi sempre melhor.',
    build: ({ setting, refCount }) =>
      closeupV2({ setting, refCount, framing: SELFIE_PROXIMA }),
  },

  {
    id: 'clima-discreto',
    hypothesis:
      'A opção "Patriota discreta" CONTRADIZ cenas que já pedem multidão e bandeiras. ' +
      'Mede se a contradição vira imagem confusa ou se o modelo escolhe um dos dois.',
    build: ({ setting, refCount }) =>
      closeupV2({ setting, refCount, mood: CLIMA_DISCRETO }),
  },

  {
    id: 'clima-bandeiras',
    hypothesis:
      'A opção "Evento com bandeiras" REFORÇA o que a cena já diz. Expectativa: neutro ' +
      'para a semelhança. É o controle do eixo de clima.',
    build: ({ setting, refCount }) =>
      closeupV2({ setting, refCount, mood: CLIMA_BANDEIRAS }),
  },

  {
    id: 'clima-popular',
    hypothesis:
      'Terceira opção de clima do funil de referência. Diferente das outras duas, ela pede ' +
      'gente PERTO dos dois — e aproximar figurantes do rosto principal é o tipo de coisa ' +
      'que já derrubou semelhança antes. É o que falta medir para nada ir à tela sem teste.',
    build: ({ setting, refCount }) => closeupV2({ setting, refCount, mood: CLIMA_POPULAR }),
  },

  {
    id: 'face-first',
    hypothesis:
      'Repete a trava de identidade no começo E no fim. Instrução no início do prompt ' +
      'costuma pesar mais; talvez repetir resolva o rosto genérico.',
    build: ({ setting, refCount }) =>
      `The most important requirement: the person on the left must be exactly the person ` +
      `from image 1, with the same face and features — a viewer who knows them must ` +
      `recognize them immediately. ` +
      `Create ${setting}. ` +
      `The person on the right is the person shown in the following ${refCount} ` +
      `reference image${refCount > 1 ? 's' : ''}. ` +
      IDENTITY_GUARD,
  },
];

/**
 * Historico do padrao, tudo em 2026-08-12, mesma selfie/cena/seed:
 *
 * 1. 'base' -> 'no-mix-age', na rota e-nano-banana:
 *      base         cliente de 25 anos saiu com ~50, grisalho, bigode grosso
 *      no-mix       identico ao base — "nao misture as duas pessoas" nao faz nada
 *      no-mix-age   idade, cabelo, bigode e roupa preservados
 *    O que carrega e a PROIBICAO CONCRETA ("do not grey their hair"), nao o pedido
 *    abstrato de fidelidade. Vale como regra ao escrever variante nova.
 *
 * 2. 'no-mix-age' -> 'closeup', depois da primeira pontuacao humana
 *    (e-nano-banana 1, d-seedream 3, com o MESMO prompt no-mix-age):
 *      d-seedream      saida 3072x4096, rosto do cliente ~700px  -> 3
 *      e-nano-banana   saida  864x1184, rosto do cliente ~150px  -> 1
 *    O 'closeup' forca enquadramento de braco esticado e levou o rosto para
 *    ~500px sem mudar de modelo nem de preco. Ganho real, mantido.
 *
 * 3. CUIDADO com a leitura obvia do item 2. Parecia que semelhanca era orcamento
 *    de pixel no rosto — nao e. O g-gpt-image-2 sai em 768x1024, 16x menos pixel
 *    que o Seedream, e ainda assim tem a melhor semelhanca das rotas. Resolucao
 *    explica o Nano Banana comum perder, mas nao explica quem ganha: isso e
 *    fidelidade da ENTRADA, que varia por modelo e nao se conserta com prompt.
 *
 * 4. 'closeup' -> 'closeup-v2', na g-gpt-image-2 em quality=low. O piso subiu nas
 *    duas cenas instaveis, sem regredir as estaveis:
 *      selfie-rua  5,3,2 -> 5,4,3
 *      estadio     5,4,3 -> 5,5,4
 *    Sao 3 amostras por celula e pontuacao nao-cega: evidencia fraca, mas
 *    consistente nas duas cenas, e a decisao seria a mesma sob qualquer leitura.
 *
 *    ARESTA CONHECIDA: a trava de expressao fala em `the person on the left`, mas
 *    o modelo generaliza — na motociata os DOIS sairam serios. Semelhanca nao
 *    piora; a foto vende pior. Se incomodar, liberar sorriso para a figura.
 */
const DEFAULT_VARIANT = 'closeup-v2';

let active: PromptVariant = PROMPT_VARIANTS[0]!;

export function setPromptVariant(id: string): PromptVariant {
  const found = PROMPT_VARIANTS.find((v) => v.id === id);
  if (!found) {
    const ids = PROMPT_VARIANTS.map((v) => v.id).join(', ');
    throw new Error(`variante de prompt "${id}" nao existe. Disponiveis: ${ids}`);
  }
  active = found;
  return found;
}

export const activeVariant = () => active;
export const defaultVariantId = DEFAULT_VARIANT;
