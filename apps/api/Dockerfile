FROM node:20-slim AS base
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile

FROM base AS production
RUN pnpm db:generate
RUN pnpm --filter @nexus/db build
RUN pnpm --filter @nexus/api build
# Рантайм — от непривилегированного пользователя node (uid 1000, есть в образе node).
# Сборка выше идёт от root (apt/global pnpm/build), файлы world-readable → node их читает.
USER node
EXPOSE 4000
CMD ["/bin/sh", "-c", "pnpm --filter @nexus/db exec prisma migrate deploy && node apps/api/dist/server.js"]
