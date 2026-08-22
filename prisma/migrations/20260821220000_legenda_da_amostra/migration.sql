-- Legenda da amostra no carrossel da landing.
--
-- Separada do `label` porque as duas falam com pessoas em momentos diferentes: a
-- landing fala com quem ainda nao comprou ("Exemplo 1: Selfie patriota") e o
-- seletor de cenario fala com quem ja esta escolhendo ("Selfie na rua"). Antes
-- disso, mudar uma das duas mexia na outra.
--
-- Nula por padrao: quem nao preencher continua vendo o `label`, como antes.
ALTER TABLE "Scene" ADD COLUMN "sampleCaption" TEXT;
