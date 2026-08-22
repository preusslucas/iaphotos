-- Copy da tela de oferta, por figura.
--
-- Estas tres frases sao de CAMPANHA, nao de produto: "em apoio ao nosso
-- Capitao", "Combo: Capitao, Trump e Flavio", "enquanto a esquerda treme".
-- Cravadas no componente, reapareceriam em toda figura futura — o funil e
-- agnostico de figura de proposito, e a copy sempre veio do banco.
--
-- Todas nulas por padrao: sem preencher, a tela monta frases neutras a partir
-- dos precos e dos nomes dos adicionais, como fazia antes.
ALTER TABLE "Figure" ADD COLUMN "priceNote" TEXT;
ALTER TABLE "Figure" ADD COLUMN "comboTitle" TEXT;
ALTER TABLE "Figure" ADD COLUMN "comboPitch" TEXT;
