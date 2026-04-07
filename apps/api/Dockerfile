FROM node:20-alpine

RUN npm install -g pnpm

WORKDIR /app

COPY package.json pnpm-workspace.yaml ./
COPY packages/db/package.json ./packages/db/
COPY apps/api/package.json ./apps/api/

RUN pnpm install --frozen-lockfile 2>/dev/null || pnpm install

COPY packages/db ./packages/db
COPY apps/api ./apps/api

RUN pnpm --filter @tv-shifts/db generate

EXPOSE 4000

CMD ["pnpm", "--filter", "@tv-shifts/api", "dev"]
