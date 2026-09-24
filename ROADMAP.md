# Implementation Roadmap

This roadmap is the source of truth for implementation sequence and phase status. A subphase must not be marked **VERIFIED COMPLETE** while required manual acceptance remains pending. Internationalization is introduced progressively across relevant phases rather than isolated into a late phase.

## Phase 0 — Discovery & Architecture

**Status: COMPLETE**

- 0A Manufacturing Domain Map — VALIDATED
- 0B Product Definition — VALIDATED
- 0C Public/Synthetic Boundary — VALIDATED
- 0D MVP & Feature Map — VALIDATED
- 0E Domain/Data Architecture — VALIDATED
- 0F Technical Architecture — VALIDATED

## Phase 1 — Modern Full-Stack Foundation

**Status: VERIFIED COMPLETE**

### Phase 1A — Frontend Foundation

**Status: VERIFIED COMPLETE**

- Next.js 16.3.5 with React 19.2.8
- TypeScript 5 and Tailwind CSS 4 foundation
- App Router and ESLint
- Minimal responsive Project 2 foundation page
- Automated lint, TypeScript, and production build validation completed

Final manual acceptance confirmed successful desktop and 375×812 mobile rendering with no observed horizontal overflow.

### Phase 1B — Backend Foundation

**Status: VERIFIED COMPLETE**

- NestJS 12 and TypeScript 6 REST API foundation
- Standard controller and service dependency-injection flow
- Stable `GET /health` endpoint without database dependencies
- Focused unit and E2E coverage
- Automated lint, TypeScript, test, E2E, and production build validation completed

Final manual acceptance confirmed that NestJS starts on port 3001 and `GET /health` returns HTTP 200 with the exact expected JSON response.

### Phase 1C — PostgreSQL Development Foundation

**Status: VERIFIED COMPLETE**

- PostgreSQL selected as the development relational database
- Safe `DATABASE_URL` convention and trackable `.env.example` established
- Local database setup and non-destructive verification steps documented
- No ORM, driver, schema, migration, seed, or application connection introduced

Final manual acceptance confirmed PostgreSQL 17.11 running on `localhost:5432`, the project-specific role and development database, and a successful connection reporting the expected database and user. Private credentials remain in the ignored local environment file.

### Phase 1D — Prisma Data-Access Foundation

**Status: VERIFIED COMPLETE**

- Stable Prisma 7 PostgreSQL tooling and driver adapter installed
- Minimal PostgreSQL datasource and ESM client-generation configuration
- Lazy NestJS `PrismaModule` and `PrismaService` foundation
- No domain models, migrations, seeds, repositories, queries, or database-backed endpoints
- Prisma validation and generation, API lint, TypeScript, unit tests, E2E health test, and production build completed

Final manual acceptance confirmed live Prisma connectivity with `npx prisma db execute --stdin` and the non-domain query `SELECT 1;`. Physical relational and manufacturing modeling remains deferred to Phase 2.

### Phase 1E — Frontend Internationalization Foundation

**Status: VERIFIED COMPLETE**

- `next-intl` 4.14.5 integrated with the Next.js App Router
- Central registry for `en`, `zh-CN`, `de`, `ko`, `ja`, `ar`, `id`, and `hi`
- Canonical/default/fallback English policy and locale-prefixed routing
- Complete foundation-page messages for English and Bahasa Indonesia
- Accessible locale switcher with cookie persistence
- Locale-derived document language and Arabic RTL direction
- Frontend lint, TypeScript, production build, and static locale-output checks completed

Final manual acceptance confirmed English default rendering, Bahasa Indonesia switching and rendering, locale persistence across refresh, and English fallback with RTL layout for Arabic.

### Phase 1F — Frontend/Backend Integration Foundation

**Status: VERIFIED COMPLETE**

- Central `NEXT_PUBLIC_API_BASE_URL` frontend environment contract
- Small native-fetch health API boundary with response validation
- Localized checking, connected, unavailable, and recheck UI states
- Restricted NestJS CORS for the configured frontend origin
- Existing database-independent `GET /health` contract preserved
- Frontend and backend lint, TypeScript, tests where applicable, and production builds completed

Final manual acceptance confirmed the browser-to-Next.js-to-NestJS health path with development CORS restricted to `http://localhost:3000`. The unavailable-backend state rendered without a frontend crash, and Check again recovered to connected after the backend restarted without a page refresh.

### Final Phase 1 manual acceptance

**Status: PASSED**

The final acceptance session verified:

- Frontend: Next.js starts, the foundation page renders on desktop and mobile, and there is no unintended horizontal overflow.
- Internationalization: English and Bahasa Indonesia render, switching persists across reload/navigation, an untranslated locale falls back to English, and Arabic applies RTL direction.
- Backend: NestJS starts and `GET /health` returns HTTP 200 with `{ "status": "ok", "service": "api" }`.
- Full-stack integration: a valid response produces connected state, an unavailable backend produces unavailable state without a frontend crash, and recheck recovers after the backend starts without a page refresh.
- PostgreSQL: local tooling/server availability and connections on `localhost:5432` are confirmed; the project-specific development database and role use private local credentials; the connection reports the expected database and user.
- Prisma: a safe, non-domain connection succeeds with the local `DATABASE_URL` without creating Phase 2 tables.
- Repository security: real environment files remain ignored, example files remain trackable, and no credentials enter Git.

Phase 1A through Phase 1F and Phase 1 are **VERIFIED COMPLETE**. Phase 2A through Phase 2H and Phase 2 are also **VERIFIED COMPLETE**.

## Phase 2 — Database & Synthetic Manufacturing Model

**Status: VERIFIED COMPLETE**

- Physical schema design and relational constraints
- Migrations
- Synthetic seed data
- Product models
- Configurable process routes
- Synthetic genealogy

### Phase 2A — Core Configuration Schema

**Status: VERIFIED COMPLETE**

- Added configuration-only `ProductModel`, `ProcessDefinition`, `ProcessRoute`, and `ProcessRouteStep` Prisma models.
- A product model owns versioned routes; each route owns uniquely ordered steps; each step references one reusable process definition.
- Stable business codes remain separate from UUID primary keys. Product and process codes are unique, while route code/version combinations are unique within a product model.
- Route steps use the stable `MANUAL`, `AUTOMATED`, or `HYBRID` execution-method enum. Positive route versions and step orders are enforced in PostgreSQL.
- Migration `20260923000000_phase_2a_core_configuration_schema` was applied to the local PostgreSQL development database and its tables, enum, relationships, constraints, and applied migration record were inspected.
- Prisma format, validation, and client generation; API TypeScript checking; 5 unit tests; 1 E2E health test; API production build; migration status; and `git diff --check` passed.

### Phase 2B — Product Genealogy Schema

**Status: VERIFIED COMPLETE**

- Added a normalized `TraceableUnit` model for physical packs, modules, cells, components, and material units, each with an internal UUID and unique synthetic-safe trace code.
- Physical packs reference their configuration `ProductModel`; a database check prevents non-pack units from using that relationship and requires it for packs.
- Added time-bounded `GenealogyRelation` records between parent and child units. Indexed parent and child directions support forward and reverse traversal, while `installedAt` and nullable `removedAt` preserve replacement history.
- Database constraints reject self-parenting and invalid removal chronology. Partial unique indexes permit only one active direct parent per child and one active child per named position within a parent.
- Migration `20260923010000_phase_2b_product_genealogy_schema` was applied without resetting the database. PostgreSQL catalog inspection confirmed Phase 2A remained intact and the Phase 2B tables, enum, foreign keys, checks, indexes, and migration record exist.
- Prisma format, validation, generation, migration status, and drift comparison; API TypeScript checking and lint; 5 unit tests; 1 E2E health test; API production build; a rolled-back genealogy traversal/history/constraint smoke check; and `git diff --check` passed.

### Phase 2C — Process Execution & History Schema

**Status: VERIFIED COMPLETE**

- Added append-only-oriented `ProcessExecution` attempts for physical `TraceableUnit` records, with required `ProcessDefinition` linkage and optional historically stable `ProcessRouteStep` linkage.
- Each execution records a positive attempt number, `IN_PROGRESS`, `COMPLETED`, or `ABORTED` status, actual execution-method snapshot, start/finish timestamps, and audit timestamps without inspection measurements or PASS/NG semantics.
- A composite foreign key guarantees that an optional route step configures the same process definition referenced by the execution. Attempts are unique per physical unit and process definition.
- PostgreSQL checks enforce positive attempt numbers, chronological timestamps, and status/finish-time consistency. Time-oriented indexes support history by unit, process, route step, and status.
- Migration `20260923020000_phase_2c_manufacturing_execution_history` was applied without resetting the database. Catalog inspection confirmed the Phase 2C table, enum, foreign keys, checks, and indexes while all Phase 2A and Phase 2B objects remained intact.
- A rolled-back synthetic smoke test retained two chronological attempts, resolved process/route-step configuration, rejected invalid lifecycle and temporal state plus mismatched configuration, and left zero temporary rows.
- Prisma format, validation, generation, migration status, and drift comparison; API TypeScript checking and lint; 5 unit tests; 1 E2E health test; API production build; and `git diff --check` passed.

### Phase 2D — Quality Inspection Schema

**Status: VERIFIED COMPLETE**

- Added explicitly versioned `InspectionSpecification` rows linked to a `ProcessDefinition` and optionally its consistent `ProcessRouteStep`. Numeric bounds/unit, boolean expectation, target unit type, active state, and stable type/code fields configure evaluation without real manufacturing limits.
- Added stable-code `InspectionSpecificationOption` rows for categorical and visual specifications, including acceptability configuration without localized business values.
- Added historical `Inspection` events and one-to-one typed `InspectionResult` evidence for `NUMERIC`, `BOOLEAN`, `CATEGORICAL`, `VISUAL`, and `TEXT`, with separate `PASS`/`NG` quality outcomes.
- Composite foreign keys enforce specification type/scope/process context, traceable-unit scope, optional execution unit/process context, route-step/process consistency, and selected-option ownership. Checks enforce valid bounds, type-specific configuration/results, positive versions, and positive attempts.
- Attempt uniqueness preserves retest history for each physical unit and exact specification version. Time-oriented indexes support inspection history by unit, specification, process execution, and outcome.
- Migration `20260923030000_phase_2d_quality_inspection_foundation` was applied without resetting the database. Catalog inspection confirmed all Phase 2A–2D tables, enums, constraints, indexes, and ordered migration records with no Prisma drift.
- A rolled-back synthetic smoke test persisted numeric bounds/unit plus NG→PASS retests, boolean evidence, a stable categorical option, and text evidence; rejected invalid bounds, type mismatch, and execution-unit mismatch; and left zero temporary rows.
- Prisma format, validation, generation, migration status, and drift comparison; API TypeScript checking and lint; 5 unit tests; 1 E2E health test; API production build; and `git diff --check` passed.

### Phase 2E — Nonconformance & Action History Schema

**Status: VERIFIED COMPLETE**

- Added reusable stable-code `DefectCategory` configuration and lifecycle-bearing `Nonconformance` records linked to affected units plus optional same-unit originating inspection/process execution.
- Added optional one-to-many `AbnormalCase` escalation history, so simple nonconformances do not require a case and repeated escalations can remain distinct.
- Added append-oriented `ActionHistory` with `CORRECTION`, `REWORK`, `REPLACEMENT`, `RETEST`, `BALANCING`, and `ESCALATION`; optional retest-inspection and related-unit links reference existing evidence/identity without duplicating quality results or genealogy.
- Added inspection-backed `Verification` and append-oriented `DispositionHistory` with `CONTINUE`, `CONCESSION`, `RETURN_IQC`, and `SCRAP`, separate from nonconformance lifecycle status.
- Composite foreign keys enforce same-unit source evidence, action-linked inspection, and verification evidence, plus same-NC abnormal-case/action relationships. Checks enforce nonconformance lifecycle timestamps and abnormal-case chronology.
- Migration `20260923040000_phase_2e_nonconformance_action_history` was applied without resetting the database. Catalog inspection confirmed all seventeen Phase 2A–2E tables, enums, constraints, indexes, and ordered migrations with no Prisma drift.
- Rolled-back scenarios verified a simple NC without abnormal case, an escalated NC with a case, retained NG→PASS inspections, separate action and disposition history, verification linkage, meaningful relationship/lifecycle rejections, and zero temporary Phase 2E rows.
- Prisma format, validation, generation, migration status, and drift comparison; API TypeScript checking and lint; 5 unit tests; 1 E2E health test; API production build; and `git diff --check` passed.

### Phase 2F — Synthetic Seed Dataset

**Status: VERIFIED COMPLETE**

- Added `npm run db:seed` under `apps/api` for a deterministic Prisma/PostgreSQL seed with fixed seed-owned UUIDs, stable synthetic business codes, fixed UTC timestamps, and bounded per-row upserts.
- Seeded fictional `DEMO_ALPHA` and `DEMO_BETA` configurations with four reusable generic process definitions and intentionally different route orders.
- Added three small connected Pack → Module → Cell/component/material stories, including closed `COMP-DEMO-OLD` and active `COMP-DEMO-NEW` relationships at the same synthetic position.
- Added chronological execution history, all five supported specification/result types, a clean PASS pack, a simple NG → correction → retest → PASS → verification → CONTINUE story without escalation, and an optional escalated NG → abnormal case → replacement/retest → PASS verification story with separate disposition history.
- The seed creates no users or actors and does not implement deferred quality/nonconformance service rules. It contains no deletion, truncation, reset, uncontrolled randomness, real identifiers, or real process values.
- First and second runs both completed. The second run retained the same seed-owned count vector: 2 products, 4 processes, 2 routes/8 steps, 16 units, 13 genealogy relationships, 14 executions, 5 specifications/4 options, 8 inspections/results (6 PASS, 2 NG), 2 defect categories, 2 NCs, 1 abnormal case, 5 actions, 2 verifications, and 3 dispositions.
- Focused SQL verified forward/reverse genealogy, replacement history, clean PASS without NC, simple and escalated histories, and retained NG/PASS retest attempts. Prisma format/validate/generate, migration status, no-drift comparison, API TypeScript/lint, 5 unit tests, 1 E2E health test, production build, and `git diff --check` passed.

### Phase 2G — Traceability & Integrity Queries

**Status: VERIFIED COMPLETE**

- Added an internal `TraceabilityModule` with a focused repository, composition service, typed result contracts, and seed integrity service. No controller, public REST endpoint, frontend, generic repository framework, or schema change was added.
- Parameterized recursive PostgreSQL CTEs resolve a trace code to its UUID and traverse arbitrary-depth descendants or ancestors. A visited UUID path prevents malformed cycles from causing infinite recursion.
- Explicit `current`, `historical`, and future-ready `asOf` scopes distinguish active relationships from full history. At time `T`, activity means `installedAt <= T AND (removedAt IS NULL OR removedAt > T)`.
- Added chronological replacement-position, process-execution, typed inspection, and complete NC/case/action/retest/verification/disposition reconstruction. Complete traceability composes focused results without a Cartesian mega-join.
- Unknown trace codes throw a specific `TraceableUnitNotFoundError`; raw SQL uses Prisma tagged templates and bound values rather than concatenating trace codes.
- Added nine seed-integrity checks covering cycles, active hierarchy/positions, route/process agreement, inspection/result completeness, retained NG/retest history, verification context, NC-history coherence, and old/new replacement history.
- Live evidence verified the multi-level `PACK-DEMO-ALPHA-PASS` traversal; reverse cell → module → pack impact path; historical-only `COMP-DEMO-OLD`; active `COMP-DEMO-NEW`; repeated verify execution attempts; simple NG/correction/retest/PASS/verification/CONTINUE without escalation; and escalated NG/case/actions/PASS verification/RETURN_IQC/CONTINUE with both dispositions retained.
- Automated verification passed: deterministic seed, 7 unit tests, 10 focused database-backed Phase 2G tests, 1 E2E health test, Prisma format/validate/generate, all 5 migrations applied, no schema drift, TypeScript, lint, production build, and `git diff --check`.

The query shapes are correctness-oriented for the small deterministic dataset, not production load testing. Large synthetic production generation, scale benchmarks, pagination/limits, public API design, and UI remain later work.

### Phase 2H

**Status: VERIFIED COMPLETE**

- Reviewed the complete Phase 2 diff from the Phase 1 baseline commit `79dad32`, all five ordered migrations, Prisma schema, deterministic seed, traceability implementation/tests, npm commands, and source-of-truth documentation. No Phase 3+, frontend feature, public API, large-data generator, or confidential-data scope entered the implementation.
- Migration review found a coherent additive chain with appropriate foreign keys, composite consistency keys, checks, indexes, and restricted historical deletion. All five migrations are applied and not rolled back; Prisma migration status is current and schema/database drift is none. The user's database was not reset or destroyed.
- Two final consecutive seed runs succeeded with the same 17-entity count vector documented in Phase 2F. The seed contains bounded known-ID upserts and no broad delete, truncate, migration reset, or unrelated-row cleanup.
- Live evidence retained the forward and reverse paths, historical old/current new replacement state, repeated process attempt, simple NC without abnormal case, escalated NC with both dispositions, and all nine passing integrity checks.
- Final automated regression passed: Prisma format/validate/generate, migration status/no-drift comparison, TypeScript, lint, 7 unit tests, 10 database-backed traceability tests, 1 E2E health test, production build, and `git diff --check`. The grouped command is `npm run phase2:verify`.
- Final focused review found no correctness, integrity, security, performance, maintainability, or scope defect requiring a code/schema/migration fix. Recursive SQL remains parameterized and cycle-bounded; queries are scoped and use existing indexes without speculative schema changes.
- Public-repository audit found no prohibited product identifiers, confidential operational artifacts, unsafe raw SQL, embedded credential value, destructive seed behavior, or tracked real environment file. The ignored local `.env` remains ignored; only safe example environment files are tracked.
- Phase 2D/2E application-service rules remain explicitly deferred. Large synthetic production generation and performance/load testing remain future work.

The user personally completed the following checklist on the local Mac. Every required manual acceptance check passed.

#### Phase 2 manual acceptance checklist

Run these commands in Terminal on the local Mac. They load the existing ignored environment file without displaying its contents:

```bash
cd ~/battery-manufacturing-quality-traceability/apps/api
set -a; source .env; set +a
```

- [x] **Database readiness:** `npx prisma migrate status` reported five migrations and an up-to-date database schema.
- [x] **Seed first run:** `npm run db:seed` generated Prisma Client successfully and completed the deterministic Phase 2F synthetic seed.
- [x] **Seed idempotency:** a second `npm run db:seed` completed successfully with no duplicate or unique-constraint error.
- [x] **Traceability evidence:** `npm run traceability:evidence` confirmed:
  - `PACK-DEMO-ALPHA-PASS` → module → two cells and material;
  - `CELL-DEMO-ALPHA-PASS-01` → module → pack;
  - `COMP-DEMO-OLD` with zero current parents but a historical module/pack path, followed by current `COMP-DEMO-NEW` at `SENSOR-01`;
  - all five preserved process attempts for `PACK-DEMO-ALPHA-RETEST`, including both `DEMO_VERIFY` attempts;
  - `DEMO_NUMERIC_LEVEL` attempt 1 as `NG` and attempt 2 as `PASS`;
  - simple `NC-DEMO-SIMPLE-001` history of `NG → CORRECTION → RETEST → PASS verification → CONTINUE` with zero abnormal cases;
  - escalated `NC-DEMO-ESCALATED-001` history of `NG → ABNORMAL-DEMO-001 → ESCALATION → REPLACEMENT → RETEST → PASS verification → RETURN_IQC → CONTINUE`, retaining both disposition-history entries;
  - `integrity.valid = true` and all nine integrity checks passing: `NO_GENEALOGY_CYCLES`, `ACTIVE_HIERARCHY`, `ACTIVE_POSITION_UNIQUENESS`, `ROUTE_PROCESS_COHERENCE`, `INSPECTION_RESULT_COMPLETENESS`, `RETEST_HISTORY_PRESERVED`, `VERIFICATION_CONTEXT`, `NC_HISTORY_COHERENCE`, and `REPLACEMENT_HISTORY`.
- [x] **Focused traceability tests:** `npm run test:traceability` passed one test file and all 10 tests, covering genealogy, current/historical state, replacement and process/quality history, NC reconstruction, complete composition, unknown trace code, and integrity validation.
- [x] **Final automated regression:** `npm run phase2:verify` passed Prisma format/validate/generate, migration status, no-drift comparison, TypeScript, lint with zero warnings/errors, 7 unit tests, 10 traceability tests, 1 E2E test, production build, and `git diff --check`.

Phase 2A through Phase 2H and Phase 2 are **VERIFIED COMPLETE**. Phase 3 is next and has **NOT STARTED**. A Phase 2 commit remains a separate user-approved action.

## Phase 3 — Authentication & RBAC

**Status: NEXT / NOT STARTED**

- Authentication
- Users
- Roles
- Server-side authorization
- Finalization of MVP permissions

## Phase 4 — Manufacturing Dashboard & Traceability

**Status: PLANNED**

- Manufacturing dashboard
- Pack trace-code search
- Product genealogy
- Process timeline and history
- Forward and appropriate reverse traceability

## Phase 5 — Quality Inspection System

**Status: PLANNED**

- Inspection specifications
- Inspection entry
- Typed measurements
- PASS/NG history

## Phase 6 — Nonconformance & Rework

**Status: PLANNED**

- Abnormal cases
- Hold
- Corrective and rework actions
- Component replacement
- Retest and reinspection
- Required verification
- Concession
- Scrap/reject
- Complete history preservation

## Phase 7 — Quality Analytics

**Status: PLANNED**

- NG trends
- Defect Pareto
- First-pass yield
- Rework rate
- Process analysis
- Drill-down to affected units

## Phase 8 — Production Engineering

**Status: PLANNED**

- Docker and Docker Compose
- CI/CD
- Security hardening
- Structured logging and useful request correlation
- Consistent errors and health endpoints
- Performance and responsive polish
- Production deployment

Kubernetes, microservices, distributed tracing stacks, and complex observability platforms are excluded unless future requirements clearly justify them.

## Delivery workflow

Each implementation subphase should follow:

1. Targeted inspection
2. Implementation
3. Focused tests
4. Minimal necessary review
5. Focused fixes
6. Targeted retest
7. Manual acceptance when required
8. Source-of-truth documentation reconciliation
9. Mark the subphase complete
10. Continue to the next subphase

Commit and push remain separate, explicit actions.
