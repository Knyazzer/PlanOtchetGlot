FROM node:20-alpine AS base
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
RUN pnpm --filter @tv-shifts/api build
EXPOSE 4000
CMD ["pnpm", "--filter", "@tv-shifts/api", "start"]
