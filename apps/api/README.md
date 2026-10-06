# API Backend

The Phase 1B backend foundation for the Battery Manufacturing Quality & Traceability System. It uses NestJS, TypeScript, and a REST API structure.

The only unauthenticated non-auth-contract behavior remains the minimal health endpoint. Phase 2 adds the internal manufacturing/quality persistence model, deterministic synthetic seed, and reusable traceability/integrity queries. Phase 3 adds Argon2id authentication, opaque database-backed sessions, cookie/CSRF/origin protection, default-deny permission guards, and security hardening. Phase 4B–4C add authenticated dashboard overview and traceability search reads.

## Local development

From `apps/api`:

```bash
npm run start:dev
```

The API listens on `http://localhost:3001` by default. Set `PORT` to override it.

The credentialed browser CORS boundary accepts only `FRONTEND_ORIGIN`. Development defaults to `http://localhost:3000`; production requires an explicit valid HTTP(S) origin. Copy `.env.example` to an ignored local environment file and export the values using your preferred environment loader. The policy does not allow a wildcard. `AUTH_CSRF_SECRET` is backend-only and rejects the tracked placeholder.

Production login attempts are limited to ten per client address per minute using bounded process-local state. A multi-instance deployment must replace or supplement this with shared edge/gateway limiting and reviewed proxy trust. API responses use explicit content-type, framing/CSP, referrer, and browser-permission headers. HSTS remains the responsibility of the confirmed HTTPS termination boundary.

## Local acceptance users

`npm run dev:users` is development-only tooling for provisioning the four fictional Phase 3 browser-acceptance accounts: `accept_admin`, `accept_quality`, `accept_production`, and `accept_engineering`. It refuses production execution and is not exposed through HTTP. Supply a temporary password without echoing it or storing it in shell history:

```bash
set -a
source .env
set +a
read -s "BMQT_ACCEPTANCE_PASSWORD?Acceptance password: "
echo
export BMQT_ACCEPTANCE_PASSWORD
npm run dev:users
unset BMQT_ACCEPTANCE_PASSWORD
```

The password must contain 12–128 Unicode code points and cannot be all whitespace. The command uses the application's current Argon2id hashing service, creates missing fixed accounts, restores their expected role and active state on rerun, updates their password only when the command is explicitly run with a supplied value, and revokes their existing sessions after that update. It does not delete unrelated users or touch Phase 2 manufacturing data. Output contains only username, role, and created/updated status.

## PostgreSQL development setup

PostgreSQL is the selected relational database. Phase 2A–2E add the manufacturing/quality schema and Phase 2F adds a deterministic synthetic dataset. The API still connects lazily rather than during startup; the Phase 4B dashboard endpoint opens a database connection when requested.

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

The command generates/compiles the Prisma client and upserts a small connected dataset with the fictional product codes `DEMO_ALPHA` and `DEMO_BETA`. Fixed seed-owned UUIDs, business codes, and explicit absolute UTC timestamps make reruns deterministic. Reconciliation is bounded to those known rows: the script does not delete, truncate, reset, or inspect unrelated records. Two verified consecutive runs produced identical counts.

Every project-owned `PrismaPg` connection, including the NestJS runtime and seed, uses the shared adapter factory with PostgreSQL startup option `-c timezone=UTC`. This prevents timezone-less parameters emitted by the installed adapter from being interpreted under a machine or database-local timezone. The database-backed regression verifies `2026-01-11T08:00:00Z` as persisted epoch `1768118400`, including the upsert/update path; absolute-time verification uses database-side epoch evidence rather than relying only on a Prisma Date round trip.

The dataset includes Pack → Module → Cell/component genealogy, component replacement history, chronological executions, five typed inspection-specification examples, a clean PASS story, a simple NG/retest story without escalation, and an escalated story. It creates no users or authenticated actors and does not substitute for the deferred service-layer business rules.

## Internal traceability queries

Phase 2G adds an internal `TraceabilityModule`; it does not add a public endpoint. The module provides forward and reverse arbitrary-depth genealogy, explicit current/historical/as-of relationship scopes, replacement-position history, process and typed quality histories, full NC/action/verification/disposition reconstruction, a composed unit traceability view, and seed integrity validation.

Recursive SQL uses Prisma tagged templates with bound UUID/timestamp values and a visited UUID path for cycle protection. Unknown trace codes raise `TraceableUnitNotFoundError`. Current relationships have `removedAt IS NULL`; a relationship is active at time `T` when `installedAt <= T AND (removedAt IS NULL OR removedAt > T)`. Installation is inclusive and removal is exclusive.

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

## Dashboard overview endpoint

```http
GET /dashboard/overview
```

This authenticated read requires `dashboard:view`. It returns database-derived unit counts, pack counts by product model, the in-progress execution count, all-record PASS/NG inspection counts, open/in-progress NC counts, and at most ten recent process executions. It returns no internal database IDs or user/session fields. See `docs/DASHBOARD_TRACEABILITY.md` for the authoritative response and absence semantics.

After loading the ignored local environment, run its focused tests with:

```bash
npm run test:dashboard
```

## Traceability search endpoint

```http
GET /traceability?query=PACK-DEMO&unitType=PACK&productModel=DEMO_ALPHA&page=1&pageSize=25
```

This authenticated read requires `traceability:view`. `query` is optional trimmed-uppercase exact/prefix search; omission or whitespace enters browse mode. Optional `unitType` uses the five stable unit types. Optional `productModel` filters only units with that direct persisted model relationship (packs under the current schema), without genealogy inference. Pagination is 1-based, defaults to 25 rows, and permits at most 100. Invalid inputs return `400 INVALID_REQUEST`; no matches and pages beyond the end return successful empty collections.

Run its focused parser and database-backed endpoint tests with:

```bash
npm run test:traceability-search
```

## Unit detail and genealogy endpoints

```http
GET /traceability/:traceCode
GET /traceability/:traceCode/genealogy?direction=descendants&scope=current&depth=1&limit=50
```

Both reads require `traceability:view`. Unit detail returns direct persisted identity and section record counts without embedding histories. Genealogy supports `descendants` or `ancestors`, `current`, `historical`, or timestamped `asOf` scope, depth 1–8, edge pages up to 100, and a scope-bound cursor. Responses provide direct relationship counts for progressive expansion and explicit edge/depth/cycle partial reasons. Internal unit/relation UUIDs are not exposed.

Run the database-backed contract tests with:

```bash
npm run test:traceability-detail
```

## Validation

```bash
npm run lint
npx tsc --noEmit
npm run test
npm run test:e2e
npm run test:security-hardening
npm run build
```
