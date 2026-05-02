FROM node:20-slim AS base
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/db/package.json ./packages/db/
COPY apps/api/package.json ./apps/api/
RUN pnpm install --frozen-lockfile

FROM base AS production
COPY packages/db ./packages/db
COPY apps/api ./apps/api
RUN pnpm --filter @tv-shifts/db generate
RUN pnpm --filter @tv-shifts/db build
RUN pnpm --filter @tv-shifts/api build
EXPOSE 4000
CMD ["/bin/sh", "-c", "pnpm --filter @tv-shifts/db migrate:deploy && pnpm --filter @tv-shifts/api start"]
