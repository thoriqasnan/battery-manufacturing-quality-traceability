# API Backend

The Phase 1B backend foundation for the Battery Manufacturing Quality & Traceability System. It uses NestJS, TypeScript, and a REST API structure.

This subproject currently contains only a minimal health endpoint. Database access, authentication, authorization, and manufacturing domain features are planned for later phases.

## Local development

From `apps/api`:

```bash
npm run start:dev
```

The API listens on `http://localhost:3001` by default. Set `PORT` to override it.

The browser CORS boundary accepts only `FRONTEND_ORIGIN`. Development defaults to `http://localhost:3000`; production requires an explicit valid HTTP(S) origin. Copy `.env.example` to an ignored local environment file and export the values using your preferred environment loader. The policy does not allow a wildcard and does not enable credentials.

## PostgreSQL development setup

PostgreSQL is the selected relational database. Phase 1C defines the local configuration contract, and Phase 1D adds the Prisma tooling and lazy NestJS data-access foundation. The API does not connect to PostgreSQL during startup, and no application models, migrations, or seed data exist.

1. Install and run a supported PostgreSQL version using your preferred local setup outside this repository.
2. Create an empty, project-specific development database and local role using your PostgreSQL administrator tooling. Suggested synthetic names are `battery_quality_traceability_dev` and `battery_quality_app`.
3. Copy `.env.example` to `.env` and replace `CHANGE_ME` with the local role password. The `.env` file is ignored by Git.
4. Export `DATABASE_URL` from that untracked file using your preferred environment loader.
5. Verify the local setup without creating tables:

```bash
psql --version
pg_isready -h localhost -p 5432
psql "$DATABASE_URL" -c "select current_database(), current_user;"
```

Do not use production credentials for local development.

## Prisma foundation

Prisma is the API's planned ORM/data-access tooling for PostgreSQL. The minimal schema selects PostgreSQL and configures ESM client generation, but intentionally contains no domain models.

After exporting `DATABASE_URL`, validate the configuration and generate the client without opening a database connection:

```bash
npm run prisma:validate
npm run prisma:generate
```

`PrismaModule` exports a lazy `PrismaService`. Creating the NestJS application does not connect to PostgreSQL; the client is initialized only when future data-access code requests it. Final Phase 1 manual acceptance verified live Prisma connectivity with the local development database using a non-domain `SELECT 1;` query.

## Health endpoint

```http
GET /health
```

Successful response:

```json
{
  "status": "ok",
  "service": "api"
}
```

## Validation

```bash
npm run lint
npx tsc --noEmit
npm run test
npm run test:e2e
npm run build
```
