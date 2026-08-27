FROM node:20-alpine AS base
# pnpm запиннен: latest (pnpm 11) больше не читает pnpm.onlyBuiltDependencies из package.json
# → ERR_PNPM_IGNORED_BUILDS на prisma/esbuild. 10.33.x читает поле (совпадает с локальной сборкой).
RUN npm install -g pnpm@10.33.0
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile

FROM base AS build
ARG VITE_API_URL
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_INVENTORY_URL
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
ENV VITE_INVENTORY_URL=$VITE_INVENTORY_URL
RUN pnpm db:generate
RUN pnpm --filter @nexus/web exec vite build

FROM nginx:alpine AS production
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
