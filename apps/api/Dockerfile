FROM node:20-slim AS base
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile

FROM base AS production
RUN pnpm --filter @tv-shifts/db generate
RUN pnpm --filter @tv-shifts/db build
RUN pnpm --filter @tv-shifts/api build
EXPOSE 4000
CMD ["/bin/sh", "-c", "pnpm --filter @tv-shifts/db migrate:deploy && pnpm --filter @tv-shifts/api start"]
