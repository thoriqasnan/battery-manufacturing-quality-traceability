# API Backend

The Phase 1B backend foundation for the Battery Manufacturing Quality & Traceability System. It uses NestJS, TypeScript, and a REST API structure.

The only public API behavior remains the minimal health endpoint. Phase 2 adds the internal manufacturing/quality persistence model, deterministic synthetic seed, and reusable traceability/integrity queries, but no public database-backed endpoint. Authentication, authorization, and user-facing manufacturing features remain later-phase work.

## Local development

From `apps/api`:

```bash
npm run start:dev
```

The API listens on `http://localhost:3001` by default. Set `PORT` to override it.

The browser CORS boundary accepts only `FRONTEND_ORIGIN`. Development defaults to `http://localhost:3000`; production requires an explicit valid HTTP(S) origin. Copy `.env.example` to an ignored local environment file and export the values using your preferred environment loader. The policy does not allow a wildcard and does not enable credentials.

## PostgreSQL development setup

PostgreSQL is the selected relational database. Phase 2A–2E add the manufacturing/quality schema and Phase 2F adds a deterministic synthetic dataset. The API still does not connect to PostgreSQL during startup; database-backed endpoints remain future work.

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

Prisma is the API's ORM/data-access tooling for PostgreSQL. The schema contains the verified Phase 2A–2E manufacturing/quality persistence model and configures ESM client generation; the five ordered migrations are the database history for that model.

After exporting `DATABASE_URL`, validate the configuration and generate the client without opening a database connection:

```bash
npm run prisma:validate
npm run prisma:generate
```

`PrismaModule` exports a lazy `PrismaService`. Creating the NestJS application does not connect to PostgreSQL; the client is initialized only when future data-access code requests it. Final Phase 1 manual acceptance verified live Prisma connectivity with the local development database using a non-domain `SELECT 1;` query.

## Deterministic synthetic seed

After applying the existing migrations and exporting the ignored local `DATABASE_URL`, run:

```bash
npm run db:seed
```

The command generates/compiles the Prisma client and upserts a small connected dataset with the fictional product codes `DEMO_ALPHA` and `DEMO_BETA`. Fixed seed-owned UUIDs, business codes, and UTC timestamps make reruns deterministic. Reconciliation is bounded to those known rows: the script does not delete, truncate, reset, or inspect unrelated records. Two verified consecutive runs produced identical counts.

The dataset includes Pack → Module → Cell/component genealogy, component replacement history, chronological executions, five typed inspection-specification examples, a clean PASS story, a simple NG/retest story without escalation, and an escalated story. It creates no users or authenticated actors and does not substitute for the deferred service-layer business rules.

## Internal traceability queries

Phase 2G adds an internal `TraceabilityModule`; it does not add a public endpoint. The module provides forward and reverse arbitrary-depth genealogy, explicit current/historical/as-of relationship scopes, replacement-position history, process and typed quality histories, full NC/action/verification/disposition reconstruction, a composed unit traceability view, and seed integrity validation.

Recursive SQL uses Prisma tagged templates with bound UUID/timestamp values and a visited UUID path for cycle protection. Unknown trace codes raise `TraceableUnitNotFoundError`. Current relationships have `removedAt IS NULL`; a relationship is active at time `T` when `installedAt <= T AND (removedAt IS NULL OR removedAt > T)`.

After seeding, run the focused database-backed tests and live evidence:

```bash
npm run test:traceability
npm run traceability:evidence
```

Run the complete Phase 2 automated regression with:

```bash
npm run phase2:verify
```

This grouped command formats and validates Prisma, regenerates the client, confirms migration status and no drift, then runs TypeScript, lint, unit, traceability, E2E, production-build, and diff checks. It requires the ignored local environment configuration to have been loaded first. Phase 2H automated regression and the user-performed manual acceptance checklist both passed; the evidence is recorded in the root `ROADMAP.md`.

The small deterministic dataset is intended for correctness and understandable stories, not load testing. Large synthetic production generation, performance benchmarks, pagination/depth limits, REST exposure, and UI are deferred.

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
