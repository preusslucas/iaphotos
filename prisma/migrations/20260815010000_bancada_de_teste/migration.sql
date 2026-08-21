-- Bancada de teste do /admin.
--
-- Pedido de teste passa pelo MESMO caminho de geracao de um pedido de cliente —
-- e o unico jeito de o teste medir o que a producao faz. A marca serve para o
-- que vem DEPOIS: manter esses pedidos fora das metricas e da lista.
ALTER TABLE "Order" ADD COLUMN "isTest" BOOLEAN NOT NULL DEFAULT false;

-- Indice parcial: toda consulta do painel passou a filtrar `isTest = false`, e
-- essa e a esmagadora maioria das linhas. O indice parcial cobre o caso raro —
-- listar os testes — sem custar escrita nos pedidos de verdade.
CREATE INDEX "Order_isTest_createdAt_idx" ON "Order" ("createdAt" DESC) WHERE "isTest" = true;
