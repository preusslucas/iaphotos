/**
 * Versao do texto de consentimento. Incremente SEMPRE que o texto mudar: o
 * banco guarda a versao aceita por pedido, e sem isso nao ha como provar o que
 * a pessoa concordou quando os termos forem revisados.
 */
export const TERMS_VERSION = '2026-08-14.1';

/**
 * Segunda versao: a primeira autorizava so a geracao da imagem. Como o e-mail e
 * o WhatsApp passaram a ser usados tambem para contato comercial, o texto
 * precisa dizer isso — usar dado coletado para uma finalidade em outra e o que
 * a LGPD chama de desvio de finalidade.
 *
 * A mencao ao descadastramento nao e cortesia: e o direito de oposicao, e sem
 * uma via clara para exerce-lo a base legal do envio fica fragil.
 */
export const CONSENT_TEXT =
  'Autorizo o envio da minha foto para gerar uma imagem fictícia por inteligência ' +
  'artificial. Entendo que a imagem NÃO é real, não representa um encontro que ' +
  'aconteceu, e que minha selfie será apagada automaticamente em até 7 dias. ' +
  'Autorizo também o contato por e-mail e WhatsApp sobre este pedido e sobre ' +
  'novidades e ofertas, podendo pedir o descadastramento a qualquer momento.';

/** Aviso obrigatorio em toda imagem gerada e em toda tela que a exibe. */
export const AI_DISCLAIMER = 'Imagem fictícia gerada por inteligência artificial';

/**
 * Aviso para midia que NAO foi gerada por IA.
 *
 * Existe por causa do video da hero, que e uma gravacao de tela real: uma
 * pessoa falando para a camera e o proprio funil sendo usado. Carimbar o
 * `AI_DISCLAIMER` em cima dele seria afirmar que aquilo e sintetico, e nao e —
 * seria uma declaracao falsa no unico selo do site que existe para ser
 * verdadeiro. O selo e o que sustenta a promessa de que o produto nunca se
 * apresentou como registro de um encontro real; um selo errado corroi
 * exatamente a defesa que ele deveria dar.
 *
 * A segunda frase continua necessaria porque as FOTOS que aparecem dentro do
 * video sao geradas por IA. O aviso muda de sujeito, nao desaparece.
 */
export const DEMO_DISCLAIMER = 'Demonstração real do produto · as fotos exibidas são geradas por IA';

/**
 * Selo curto usado SOBRE as midias da landing (hero e carrossel de exemplos).
 *
 * Texto definido pelo cliente, e mais curto que o `AI_DISCLAIMER` de proposito:
 * ali ele fica sobreposto a uma imagem de ~170px de largura, e a frase completa
 * quebrava em tres linhas cobrindo metade do exemplo. A funcao de divulgacao
 * esta cumprida — diz que aquilo e gerado por IA, que e o ponto.
 *
 * O `AI_DISCLAIMER` continua sendo o aviso canonico e acompanha a imagem
 * ENTREGUE, onde ha espaco e onde a precisao importa mais.
 */
export const SAMPLE_AI_BADGE = 'Exemplo gerado por IA';

export const LEGAL_FOOTER =
  'Este site não é propaganda oficial, não possui vínculo com nenhum partido, ' +
  'campanha ou figura pública, e não representa apoio de ninguém. Todas as ' +
  'imagens são fictícias e geradas por inteligência artificial.';
