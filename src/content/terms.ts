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

export const LEGAL_FOOTER =
  'Este site não é propaganda oficial, não possui vínculo com nenhum partido, ' +
  'campanha ou figura pública, e não representa apoio de ninguém. Todas as ' +
  'imagens são fictícias e geradas por inteligência artificial.';
