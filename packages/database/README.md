# @medstock/database

Prisma schema, migrations, and client. The schema covers users, organizations, memberships, Cognito identity accounts, the canonical medicine catalog, and distributor listings. Catalog search uses the `pg_trgm` extension. See `docs/catalog.md` and `docs/listings.md`.

## Local PostgreSQL

From the repository root:

```bash
docker compose -f infrastructure/docker/docker-compose.yml up -d postgres
```

Set `POSTGRES_PORT` before that command when port 5432 is already used by another local database. The default connection string is `postgresql://medstock:medstock@localhost:5432/medstock`. `packages/database/prisma.config.ts` uses `DATABASE_URL` when it is set, and that local URL otherwise.

## Prisma

Run these from the repository root.

```bash
pnpm --filter @medstock/database validate
pnpm --filter @medstock/database exec prisma migrate deploy
pnpm --filter @medstock/database generate
```

`validate` checks the schema. `migrate deploy` applies committed migrations. `generate` refreshes the client under `src/generated/prisma`. Do not edit generated files.

Inspect the local database:

```bash
docker compose -f infrastructure/docker/docker-compose.yml exec postgres \
  psql -U medstock -d medstock -c '\dt'
```

There is no seed. Tests create and remove their own rows.

## Role and organization type

`assertMembershipRole` checks that a membership role matches the organization type. The API membership service calls it inside the insert transaction. The database does not enforce that pairing by itself.

`normalizeEmail` trims and lowercases an email. The identity service stores that value. The unique index does not lowercase on write.
