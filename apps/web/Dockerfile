FROM node:26.13.0-bookworm-slim
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
COPY . .
RUN pnpm install --frozen-lockfile \
  && pnpm --filter @medstock/shared-types build \
  && pnpm --filter @medstock/web build
ENV NODE_ENV=production
WORKDIR /app/apps/web
EXPOSE 3000
CMD ["pnpm", "exec", "next", "start", "-H", "0.0.0.0", "-p", "3000"]
