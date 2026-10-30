#!/bin/sh
# Démarrage du conteneur API : migrations Prisma (sauf RUN_MIGRATIONS_ON_START=false),
# puis l'API. Une migration en échec arrête le conteneur : jamais d'API sur un schéma périmé.
set -eu

if [ "${RUN_MIGRATIONS_ON_START:-true}" != "false" ]; then
  echo "Migrations Prisma…"
  npx --no-install prisma migrate deploy --schema packages/db/prisma/schema.prisma
fi

exec node apps/api/dist/main.js
