# API Backend

The Phase 1B backend foundation for the Battery Manufacturing Quality & Traceability System. It uses NestJS, TypeScript, and a REST API structure.

The only unauthenticated non-auth-contract behavior remains the minimal health endpoint. Phase 2 adds the internal manufacturing/quality persistence model, deterministic synthetic seed, and reusable traceability/integrity queries. Phase 3 adds Argon2id authentication, opaque database-backed sessions, cookie/CSRF/origin protection, default-deny permission guards, and security hardening. Phase 4B–4C add authenticated dashboard overview and traceability search reads.

## Local development

From `apps/api`:

```bash
node --env-file=.env ./node_modules/.bin/nest start --watch
```

The API listens on `http://localhost:3001` by default. Set `PORT` to override it. The explicit Node environment loader is required because Nest does not automatically read `apps/api/.env`; `/health` can remain available while a later database-backed request fails if `DATABASE_URL` was not loaded. See the repository [Local Development and Manual Testing guide](../../docs/LOCAL_DEVELOPMENT_AND_TESTING.md) for safe PostgreSQL setup, complete startup, acceptance login, and troubleshooting.

The credentialed browser CORS boundary accepts only `FRONTEND_ORIGIN`. Development defaults to `http://localhost:3000`; production requires an explicit valid HTTP(S) origin. The restricted request-header allowlist includes `Content-Type`, `X-CSRF-Token`, and the `Idempotency-Key` required by `POST /inspections`; a focused NestJS OPTIONS test protects that browser preflight contract. Copy `.env.example` to an ignored local environment file and export the values using your preferred environment loader. The policy does not allow a wildcard. `AUTH_CSRF_SECRET` is backend-only and rejects the tracked placeholder.

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

### Isolated integration-test database

Database-backed integration and E2E tests must not use the active development database. The local isolated target is `battery_quality_traceability_test`, owned by the existing `battery_quality_app` role and initialized independently from the development database. It is created empty, receives only the repository migrations and deterministic synthetic reference seed, and must never be cloned from or silently fall back to `battery_quality_traceability_dev`.

Supply its connection string explicitly for each setup or test command; do not replace the ignored development `.env` file:

```bash
export BMQT_TEST_DATABASE_URL='postgresql://battery_quality_app:LOCAL_PASSWORD@localhost:5432/battery_quality_traceability_test'

DATABASE_URL="$BMQT_TEST_DATABASE_URL" npm run test:db:guard
DATABASE_URL="$BMQT_TEST_DATABASE_URL" npx prisma migrate deploy
DATABASE_URL="$BMQT_TEST_DATABASE_URL" npm run db:seed
```

`npm run test:db:guard` connects through the effective `DATABASE_URL`, executes `SELECT current_database()`, and requires the exact name `battery_quality_traceability_test`. It exits before a following mutating command when the connection resolves to any other database. Run it immediately before every database-backed suite, preserving the same explicit environment:

```bash
DATABASE_URL="$BMQT_TEST_DATABASE_URL" npm run test:db:guard && \
DATABASE_URL="$BMQT_TEST_DATABASE_URL" npm run test:inspection-entry-e2e
```

The guard does not create, migrate, seed, reset, truncate, or clean a database. Database creation remains an explicit local administrator action. Passwords and full connection strings stay outside Git.

Phase 5F-1 adds a dedicated cross-layer suite whose package command and test process both enforce the exact database identity before any fixture cleanup or creation:

```bash
DATABASE_URL="$BMQT_TEST_DATABASE_URL" npm run test:phase5f-history-integration
```

The test uses prefix-owned temporary records and proves the real secured inspection POST, atomic persisted result/submission, exact Quality History append, Process History execution correlation and stability, null execution support, no automatic Nonconformance, unchanged reference NC/genealogy history, same-key replay without duplication, authorization, and public privacy. Cleanup restores the deterministic reference vector and verifies integrity 9/9. It does not reset or reseed either database.

## Prisma foundation

Prisma is the API's ORM/data-access tooling for PostgreSQL. The schema contains the verified Phase 2A–2E manufacturing/quality persistence model and configures ESM client generation; the five ordered migrations are the database history for that model.

Phase 5B-2 adds the eighth ordered migration, `20261006000000_phase_5b2_quality_persistence`. It replaces inspection-specification `isActive` with the `DRAFT`/`PUBLISHED`/`RETIRED` lifecycle, preserves the reference specifications as `PUBLISHED`, adds nullable restrictive inspector attribution for legacy-compatible inspections, and adds restrictive durable `InspectionSubmission` idempotency persistence. It also adds the explicit ENGINEERING-only `inspection-specification:manage` permission. No quality controller, service, endpoint, or UI is implemented at this checkpoint.

Phase 5C-2 adds read-only inspection-specification services. ENGINEERING uses `GET /inspection-specifications` and `GET /inspection-specifications/:code/versions/:version` with `inspection-specification:manage`; QUALITY uses the separate `GET /inspection-specifications/discovery` and `GET /inspection-specifications/discovery/:code/versions/:version` surface with `inspection:write`. Lists are one-based, default to 25, cap at 100, and expose no internal IDs. Discovery is always PUBLISHED-only and hides DRAFT/RETIRED exact identities as not found. Management detail includes a strong canonical ETag for future mutation preconditions, but Phase 5C-2 implements no write route or `If-Match` handling.

Phase 5C-3 adds ENGINEERING-only version-1 DRAFT creation, full DRAFT replacement, publication, and retirement. Replacement and lifecycle transitions require the current strong ETag in `If-Match`, serialize the exact public `(code, version)` through a transaction-scoped advisory lock, and return the resulting representation with a fresh ETag. Creation and complete categorical/visual option replacement are atomic; public process/route-step references resolve server-side. No new-version endpoint, public delete, inspection entry, or frontend is included.

Phase 5C-4 adds ENGINEERING-only `POST /inspection-specifications/:code/versions`. Its strict body selects an exact PUBLISHED or RETIRED `sourceVersion`; the server acquires the shared normalized family lock, allocates `max + 1`, and atomically creates a DRAFT copy with fresh option ownership. It never mutates the source or repoints inspection history, and returns the public copy with a fresh strong ETag. Clients cannot select the target version or override configuration.

Phase 5C-5 verifies the complete specification service through the real HTTP application boundary. ENGINEERING management, QUALITY PUBLISHED-only discovery, negative ADMIN/PRODUCTION access, strong ETag/lifecycle behavior, PostgreSQL concurrency, version-history preservation, all five typed configurations, reference integrity, privacy, safe errors, and full backend regression pass. Phase 5C is verified complete.

Phase 5D-1 approves the atomic inspection-entry contract. Phase 5D-2 adds pure utilities only: strict normalized request and `Idempotency-Key` parsing, exact decimal handling, five-type evaluation, Unicode-safe TEXT and timezone-qualified timestamp handling, canonical request fingerprints, and deterministic attempt/idempotency advisory-lock keys.

Phase 5D-3 adds the internal transactional inspection-entry service. It performs durable idempotent replay/conflict handling, coordinates exact PUBLISHED lifecycle, validates transaction time and optional execution context, serializes max-plus-one attempts, persists all five exact typed results with authenticated inspector attribution, and commits Inspection/Result/Submission as one unit. PostgreSQL concurrency and rollback/retry tests pass.

Phase 5D-4 adds exactly one public write route: QUALITY-only `POST /inspections`. It uses the existing authenticated session, global CSRF/origin guards, strict Phase 5D request and `Idempotency-Key` parsers, and the Phase 5D-3 transactional service. Initial writes and matching durable replays return 201 with the same UUID-free public response. Focused real HTTP tests cover all five evidence types, role/security boundaries, safe context errors, idempotency scoping, attribution, quality-history visibility, and no automatic Nonconformance creation.

Phase 5D-5 completes final automated acceptance and reconciliation. Focused utility/service and real HTTP tests, PostgreSQL concurrency and lifecycle races, quality-history readback, complete backend regression, the unchanged deterministic reference vector, 9/9 integrity checks, UTC evidence, eight-migration/no-drift verification, TypeScript, type-aware lint, and production build pass. Overall Phase 5D is verified complete. Phase 5E inspection-entry experience and Phase 5F integration/history reconciliation are also verified complete.

Phase 5F-3 final regression uses only the explicitly selected `battery_quality_traceability_test` database behind the exact-name guard. Phase 5-focused suites pass 114/114, authentication/security/Traceability/history suites pass 113/113, the complete backend suite passes 118/118, and sequential E2E passes 79/79. Prisma validates, all eight migrations are current with no detected schema difference, cleanup restores zero users/submissions and the deterministic eight inspections/results plus five specifications, and integrity remains 9/9. TypeScript, type-aware lint, and the NestJS production build pass. No production API, schema, migration, or database behavior changed during closure.

Run its focused unit, PostgreSQL concurrency/integration, and HTTP tests with `npm run test:inspection-specifications` after loading the ignored local database environment.

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

The small deterministic dataset is intended for correctness and understandable stories, not load testing. Verified Phase 5G preserves it alongside a separate configurable deterministic large-data generator and curated reviewer guidance. The representative MEDIUM profile was measured before any optimization decision; the existing seed is never replaced by load data.

### Phase 5G generator foundation

Phase 5G-1 adds a database-free versioned planning contract in `scripts/synthetic-generator-contract.ts`; it does not generate or persist records. `SMALL`, `MEDIUM`, and `LARGE` plan 100, 2,000, and 10,000 packs respectively, while bounded overrides cap custom plans at 25,000 packs. Explicit lowercase seeds, safe `SYN5G_*` namespaces, SHA-256-derived identities/timestamps/scenarios, exact count planning, and a canonical ownership fingerprint make plans repeatable and namespace-isolated.

Run the focused pure contract tests with:

```bash
npm run test:synthetic-generator
```

Dry-run planning has no database dependency. Mutations must receive an explicit URL and call `assertSyntheticGeneratorMutationTarget`, which accepts only `battery_quality_traceability_test` and then runs the established live identity guard with that same URL. Development and unknown databases are rejected before verification. Rerun and cleanup behavior is restricted to exact identities whose canonical content matches the versioned plan, never prefix-only deletion, truncate, reset, or reseed. See [`../../docs/SYNTHETIC_TEST_DATA.md`](../../docs/SYNTHETIC_TEST_DATA.md).

Phase 5G-2A adds a guarded persistence subset for one deterministic product model and at most 100 SMALL-profile PACK units. It creates Prisma only after the exact database guard, preflights deterministic IDs and public codes, verifies canonical fields and timestamps, serializes a resolved namespace in one transaction, writes in batches of at most 100, and reuses only exact matches. Cleanup is an explicit API requiring the exact plan fingerprint and dependency-free exact ownership; it has no broad or prefix-delete mode.

Run its isolated PostgreSQL verification only with the explicit test URL:

```bash
DATABASE_URL="$BMQT_TEST_DATABASE_URL" npm run test:synthetic-generator-persistence
```

The package command runs the database guard before Vitest, while the test process and every persistence/cleanup call enforce the guard again. The suite cleans only its deterministic identities and finishes with no generated rows, unchanged reference fixtures, and integrity 9/9. At the 2A checkpoint it generated no connected history; 2B adds genealogy only and still generates no process or quality history.

Phase 5G-2B extends the same command and mutation path to deterministic connected genealogy. The SMALL defaults create 100 PACKs, 100 MODULEs, 400 CELLs, 100 COMPONENTs, 100 MATERIALs, and 700 PACK→MODULE or MODULE→child relations. Exact endpoints, positions, timestamps, and relationship IDs participate in ownership verification. Rerun, partial recovery, unit and relationship collision refusal, cycle/orphan checks, and edge-first exact cleanup are verified. Process, inspection, NC, rework, retest, and verification generation remain absent.

Phase 5G-2C adds four generator-owned process definitions, one product route, four ordered steps, and deterministic PACK execution history. For the fixed SMALL acceptance seed, 68 packs receive four standard attempts, 22 add a VERIFY retry, and 10 add ASSEMBLE plus VERIFY retries: 442 COMPLETED executions total, including 42 retry attempts with optional route context. Exact configuration/attempt preflight, partial recovery, process collision refusal, public Process History mapping, and execution-first cleanup are verified. No inspection or NC record is generated.

Phase 5G-2D adds five owned PUBLISHED specifications and deterministic Quality History through `scripts/synthetic-generator-quality.ts`. The fixed 100-pack acceptance seed creates four exact-version options and 523 atomic Inspection/InspectionResult/InspectionSubmission aggregates: 500 PASS, 23 NG, all five evidence types, preserved NG→PASS retests, 273 compatible VERIFY links, and 250 null execution contexts. It uses the production parser, fingerprint, and evaluator; exact rerun creates no duplicates, compatible missing aggregates recover, conflicts refuse before quality writes, and cleanup removes only fully verified plan-owned rows. NG never creates a Nonconformance. Run this coverage only with an explicit test URL through `npm run test:synthetic-generator-persistence`.

Phase 5G-2E adds bounded lifecycle persistence through `scripts/synthetic-generator-nc.ts`. The fixed SMALL seed leaves 77 clean and 14 NG/retest packs without NC, then creates nine explicit NCs: three OPEN, three RESOLVED correction/retest, and three CLOSED escalated literal-REWORK/retest histories. Five categories, three abnormal cases, 15 actions, six verifications, and nine dispositions use only existing models and enums. Exact rerun, partial lifecycle recovery, collision refusal, public Nonconformance History mapping, dependency-refusing cleanup, and integrity 9/9 are covered by the same guarded test command. No inspection endpoint behavior or automatic NC creation changes.

Phase 5G-3A enables only the exact MEDIUM defaults: 2,000 PACKs, 4,000 MODULEs, 32,000 CELLs, 8,000 COMPONENTs, and 4,000 MATERIALs plus deterministic process, quality, and NC histories. The verified plan persisted 139,671 non-aggregate rows. Writes stay in 100-row batches; exact ownership reads use bounded 500-row batches; MEDIUM transactions use an explicit bounded timeout. Generation, zero-create rerun, one-lifecycle recovery, and exact-fingerprint cleanup were executed against `battery_quality_traceability_test`. Cleanup left zero generator-owned rows and reference integrity 9/9. Custom MEDIUM, LARGE persistence, and speculative index changes remain refused; Phase 5G-3B owns measured query evidence.

Phase 5G-3B measured the existing Search, Unit Detail, bounded genealogy, paginated Process/Quality/NC History, specification discovery/detail, idempotency lookup, and dashboard paths against one retained MEDIUM session. One warm-up plus five service repetitions and read-only `EXPLAIN (ANALYZE, BUFFERS)` plans are recorded in `docs/SYNTHETIC_TEST_DATA.md`. Indexed per-unit paths remained bounded; dashboard inventory and recent activity were the only observed scale-wide scans. No performance target or optimization was inferred. Exact cleanup removed all 139,671 rows, left zero generator records, and retained reference integrity 9/9.

Phase 5G-5 closes generator verification without new behavior. The explicit test-database guard passes before each database suite; generator contracts pass 26/26, guarded persistence passes 15/15, complete backend unit regression passes 144/144, Traceability/history passes 19/19, focused inspection HTTP passes 5/5, and sequential HTTP E2E passes 79/79. Final read-only counts show zero generator product/unit/specification/submission/NC anchors and reference integrity 9/9. LARGE persistence remains disabled, custom MEDIUM remains refused, and cleanup remains exact-fingerprint/dependency verified rather than prefix based. Overall Phase 5G is verified complete.

Phase 5H final closure reruns the complete 144-test backend unit suite, guarded 15-test persistence/cleanup suite, and sequential 79-test HTTP E2E suite, with focused post-format specification and quality suites passing 61/61 and 27/27. The exact test-database guard, eight current migrations, empty schema drift, zero generator anchors, integrity 9/9, static/build gates, security review, and final documentation/change inventory pass. Overall Phase 5 is verified complete; Phase 6 is planned and not started.

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
