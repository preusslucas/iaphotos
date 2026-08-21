#!/bin/sh
set -e

# A migracao roda no boot do WEB, nunca no worker: se os dois containers
# subirem juntos e ambos migrarem, um deles pega o lock e o outro morre.
# Um unico migrador significa uma ordem de execucao previsivel.
# O CLI vive em ./prisma-cli, e nao em ./node_modules, porque o node_modules do
# standalone tem @prisma/client como symlink e nao aceita a mesclagem.
echo "[entrypoint] aplicando migracoes..."
node prisma-cli/node_modules/prisma/build/index.js migrate deploy

# Bootstrap do catalogo. NAO sobrescreve: o seed sai sem fazer nada se ja
# houver figura no banco. Sem isto, um ambiente novo sobe com o banco vazio e a
# landing nao acha figura nenhuma — o cliente ve 404 no lugar do produto.
#
# Roda no web e nao no worker pelo mesmo motivo da migracao: um unico
# responsavel, ordem previsivel.
echo "[entrypoint] conferindo catalogo..."
node prisma/seed.mjs || echo "[entrypoint] seed falhou (a aplicacao sobe assim mesmo)"

echo "[entrypoint] iniciando: $*"
exec "$@"
