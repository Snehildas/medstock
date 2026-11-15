FROM node:26.13.0-bookworm-slim AS build
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && npm install -g pnpm@9.15.4 \
  && rm -rf /root/.npm
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile \
  && pnpm --filter @medstock/shared-types build \
  && pnpm --filter @medstock/web build \
  && pnpm --filter @medstock/web deploy --prod /out \
  && rm -rf /out/.next \
  && cp -a /app/apps/web/.next /out/.next

FROM node:26.13.0-bookworm-slim
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --gid 1001 medstock \
  && useradd --uid 1001 --gid medstock --home-dir /app --no-create-home --shell /usr/sbin/nologin medstock
WORKDIR /app
COPY --from=build --chown=medstock:medstock /out /app
ENV NODE_ENV=production
USER medstock
EXPOSE 3000
CMD ["sh", "-c", "exec node node_modules/next/dist/bin/next start -H 0.0.0.0 -p ${PORT:-3000}"]
