# Image de production de l'API NestJS (monorepo npm workspaces).
# Construire depuis la racine du dépôt :
#   docker build -f apps/api/Dockerfile -t shadoma-api .
# Les secrets sont injectés à l'exécution (variables d'environnement), jamais dans l'image.

FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
RUN npm ci --workspace=@votezpro/api --workspace=@votezpro/db --workspace=@votezpro/shared --include-workspace-root
COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps/api ./apps/api
RUN npx prisma generate --schema packages/db/prisma/schema.prisma \
 && npm --prefix packages/shared run build \
 && npm --prefix packages/db run build \
 && npm --prefix apps/api run build

FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY --from=build --chown=node:node /app /app
USER node
EXPOSE 3001
# Applique les migrations Prisma puis démarre l'API (RUN_MIGRATIONS_ON_START=false
# si l'hébergeur les lance dans une étape séparée, ex. preDeployCommand).
ENTRYPOINT ["sh", "apps/api/docker-entrypoint.sh"]
