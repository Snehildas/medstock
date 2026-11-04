FROM node:26.13.0-bookworm-slim
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
COPY . .
RUN pnpm install --frozen-lockfile \
  && pnpm --filter @medstock/shared-types --filter @medstock/database build \
  && pnpm --filter @medstock/api build
ENV NODE_ENV=production
WORKDIR /app/apps/api
EXPOSE 3001
CMD ["node", "dist/main.js"]
