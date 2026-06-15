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
EXPOSE 4000
CMD ["/bin/sh", "-c", "pnpm --filter @nexus/db exec prisma migrate deploy && node apps/api/dist/server.js"]
