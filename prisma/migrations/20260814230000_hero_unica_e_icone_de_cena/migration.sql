-- Uma foto de exemplo por FIGURA, e card de cena com icone em vez de miniatura.
--
-- Antes: uma amostra por cena, tres delas num grid na landing. Isso exigia 5
-- imagens por figura (15 no total) antes de conseguir vender, e cada uma so
-- podia ser produzida gerando de verdade pelo proprio sistema. Virou o gargalo
-- do lancamento.

-- A unica imagem de exemplo do produto. Chave no bucket, servida por
-- /api/hero/[figura]. Nula ate alguem subir pelo /admin.
ALTER TABLE "Figure" ADD COLUMN "heroImage" TEXT;

-- Emoji do card de escolha de cena.
ALTER TABLE "Scene" ADD COLUMN "icon" TEXT;

-- `sampleImage` deixa de ser obrigatoria: nenhuma tela le mais esse campo, e
-- cena nova nao teria como preencher. A coluna FICA porque as cinco cenas do
-- patriota ja tem valor, e derrubar coluna com dado nao tem volta.
ALTER TABLE "Scene" ALTER COLUMN "sampleImage" DROP NOT NULL;

-- Icones das cenas que ja existem, para o painel nao abrir com todas em branco.
-- So onde ainda esta nulo: se alguem ja tiver escolhido outro, nao sobrescreve.
UPDATE "Scene" SET "icon" = '🤳' WHERE "sceneId" = 'selfie-rua' AND "icon" IS NULL;
UPDATE "Scene" SET "icon" = '🇧🇷' WHERE "sceneId" = 'comicio'    AND "icon" IS NULL;
UPDATE "Scene" SET "icon" = '🏍️' WHERE "sceneId" = 'moto'       AND "icon" IS NULL;
UPDATE "Scene" SET "icon" = '🏟️' WHERE "sceneId" = 'estadio'    AND "icon" IS NULL;
UPDATE "Scene" SET "icon" = '🧺' WHERE "sceneId" = 'feira'      AND "icon" IS NULL;

-- heroImage fica NULA de proposito, inclusive para o patriota.
--
-- Os `sampleImage` gravados hoje sao caminhos de /public ('/samples/...'), que
-- nao existem no bucket — copia-los para heroImage produziria uma landing com
-- imagem quebrada, que e pior que landing sem imagem. A landing esconde a secao
-- enquanto for nula, e o /admin avisa o que falta.
