FROM oven/bun:1 AS base
WORKDIR /app

FROM base AS deps
COPY package.json bun.lock* ./
RUN bun install

FROM deps AS build
COPY . .
RUN bun run build

FROM base AS prod-deps
COPY package.json bun.lock* ./
RUN bun install --production

FROM oven/bun:1-slim AS runtime
USER root

RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends curl gnupg2 lsb-release ca-certificates; \
    curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /etc/apt/trusted.gpg.d/postgresql.gpg; \
    echo "deb http://apt.postgresql.org/pub/repos/apt/ $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list; \
    apt-get update; \
    apt-get install -y --no-install-recommends postgresql-client-15 default-mysql-client sqlite3 openssh-client; \
    apt-get purge -y --auto-remove curl gnupg2 lsb-release; \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

COPY --chown=bun:bun --from=prod-deps /app/node_modules ./node_modules
COPY --chown=bun:bun --from=build /app/dist ./dist
COPY --chown=bun:bun --from=build /app/src ./src
COPY --chown=bun:bun --from=build /app/package.json ./package.json

RUN mkdir /app/data /app/exports
RUN chown bun:bun /app/data /app/exports

# Create app data directory and set permissions
RUN mkdir -p /app/data && chown bun:bun /app/data

USER bun

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD bun -e "fetch('http://127.0.0.1:' + (process.env.PORT || '3000')).then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# Use the cleaner Bun native server entry point
CMD ["bun", "src/server-prod.ts"]
