FROM node:20-alpine

RUN npm install -g pnpm

WORKDIR /app

COPY package.json pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/

RUN pnpm install --frozen-lockfile 2>/dev/null || pnpm install

COPY apps/web ./apps/web

EXPOSE 5173

CMD ["pnpm", "--filter", "@tv-shifts/web", "dev", "--host"]
