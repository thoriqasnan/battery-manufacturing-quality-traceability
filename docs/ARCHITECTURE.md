# Technical Architecture

This document records validated technical direction and current foundation evidence. Phase 1 and Phase 2 are verified complete following automated regression and final manual acceptance. Phase 2A introduces core product/process configuration, Phase 2B physical-unit genealogy, Phase 2C manufacturing execution history, Phase 2D quality-inspection specifications/evidence, Phase 2E nonconformance decision/action history, Phase 2F a deterministic synthetic seed dataset, Phase 2G reusable traceability queries and integrity validation, and Phase 2H the final integration/regression and acceptance gate. Phase 3 is next and has not started; public feature APIs, UI, authentication, analytics, and production infrastructure do not yet exist.

## System shape

The project will use a simple monorepo:

```text
apps/
  web/       # Phase 1A Next.js foundation
  api/       # Phase 1B NestJS foundation
docs/
```

The validated stack is:

| Layer       | Direction                                |
| ----------- | ---------------------------------------- |
| Frontend    | Next.js, React, TypeScript, Tailwind CSS |
| Backend     | NestJS, TypeScript, REST API             |
| Data access | Prisma                                   |
| Database    | PostgreSQL                               |

Phase 1A provides Next.js 16.3.5, React 19.2.8, TypeScript 5, Tailwind CSS 4, the App Router, and ESLint under `apps/web`. The application remains a minimal responsive foundation page; Phase 1E adds internationalization and Phase 1F adds only the health integration described below. No feature dashboard, authentication, or database-backed frontend behavior has been introduced.

Phase 1B provides NestJS 12.0.4, TypeScript 6.0.3, an ESM REST API foundation, and focused Vitest coverage under `apps/api`. The only API behavior is `GET /health`, which returns a stable service-status response. No database, authentication, domain modules, microservices, or external observability integration has been introduced.

Microservices are not justified. Nx and Turborepo will not be introduced unless a later concrete requirement warrants their cost.

## Frontend/backend integration

Phase 1F establishes the first browser-to-API path: the localized frontend calls the existing database-independent `GET /health` endpoint and renders checking, connected, or unavailable state. A small health helper owns native `fetch` and verifies HTTP success plus the expected `{ "status": "ok", "service": "api" }` values before the UI can report connected. It treats network errors, malformed JSON, and unexpected responses as unavailable.

`NEXT_PUBLIC_API_BASE_URL` is the single public frontend API-origin contract. The example value is `http://localhost:3001`; missing or invalid configuration fails safely in the status UI, with no implicit production localhost fallback. NestJS CORS accepts the one configured `FRONTEND_ORIGIN`, defaults to `http://localhost:3000` only outside production, rejects non-origin values, and requires explicit configuration in production. Wildcard and credentialed CORS are not enabled.

All status copy is provided through the existing `next-intl` resources in English and Bahasa Indonesia. Other planned locales continue to receive English fallback, and locale routing, persistence, and direction behavior are unchanged. Final manual acceptance verified English and Bahasa Indonesia rendering, locale persistence, Arabic English fallback with RTL layout, desktop and 375×812 responsive behavior, live full-stack connectivity, graceful unavailable-backend handling, and recovery after backend restart without a page refresh.

## Backend direction

The planned backend flow is:

```text
Controller
    ↓
Service
    ↓
Data-access layer
    ↓
PostgreSQL
```

Phase 1D adds a reusable `PrismaModule` and lazy `PrismaService` as the data-access foundation. The current health flow remains `Request → Controller → Service → Response` and never requests a Prisma client. Future domain services may use `PrismaService`, but domain repositories and queries remain deferred.

Controllers should handle transport concerns, while services coordinate business rules. Core rules should not be placed in controllers or tightly coupled to Prisma query details.

Potential domain boundaries are authentication, users, products/configuration, manufacturing, traceability, quality, and analytics. These are directions rather than finalized NestJS module or folder names.

## Data architecture

Prisma is the selected ORM and data-access tool, but it does not replace PostgreSQL knowledge. The implementation should explicitly exercise tables and rows, primary and foreign keys, one-to-many and many-to-many relationships, unique constraints, indexes, transactions, migrations, and relational modeling.

Phase 2A begins the physical schema with configuration only. Database design continues to preserve separation between configuration and execution, internal identities and trace codes, specifications and observations, current state and append-only history, and actions and decisions.

The Phase 2A relational foundation contains:

- `ProductModel`, a configurable product type with a UUID identity, unique stable code, human-readable name and optional description, active state, timestamps, and one-to-many routes.
- `ProcessDefinition`, a reusable process definition with a UUID identity, unique stable code, human-readable name and optional description, active state, timestamps, and references from route steps.
- `ProcessRoute`, a product-owned route with a stable code, positive version, name and optional description, active state, timestamps, and a product-scoped unique code/version combination.
- `ProcessRouteStep`, an ordered route member that references one route and one process definition, records a stable `MANUAL`, `AUTOMATED`, or `HYBRID` execution method, and enforces a positive order unique within its route.

Route deletion cascades only to its configuration steps. Product-model and process-definition deletion is restricted while referenced. This subphase intentionally adds no physical units, process executions, inspections, nonconformances, genealogy, seeds, repositories, or database-backed endpoints.

### Phase 2B genealogy foundation

Phase 2B uses a normalized generic-unit design rather than separate pack, module, cell, and component tables. `TraceableUnit` gives every physical unit the same UUID identity, globally unique trace-code lookup, lifecycle timestamps, and a stable type of `PACK`, `MODULE`, `CELL`, `COMPONENT`, or `MATERIAL`. This keeps later process, quality, and traceability references from needing multiple nullable target foreign keys. Only a `PACK` has a required `ProductModel` relationship; PostgreSQL enforces that pack/non-pack distinction.

`GenealogyRelation` is a self-referencing association between a parent and child `TraceableUnit`. Parent and child indexes support forward and reverse traversal from the same source of truth. `installedAt` and nullable `removedAt` make relationships time-bounded: replacement closes the old row and inserts a new row rather than overwriting genealogy. An optional generic `positionCode` can identify a location inside a parent without embedding a company-specific assembly structure.

PostgreSQL rejects self-parent relationships and removal timestamps that are not later than installation. A child can have only one active direct parent, and a named parent position can have only one active child; historical closed relationships remain available. Foreign keys restrict deletion of referenced product models or traceable units so genealogy is not silently discarded. Full graph-cycle detection is intentionally deferred because it requires application/transaction logic beyond a simple row constraint.

This subphase adds no process execution/history, inspections, nonconformances, seed dataset, API endpoints, frontend behavior, authentication, or analytics.

### Phase 2C execution-history foundation

`ProcessExecution` represents one actual process occurrence for one `TraceableUnit`. It always references the performed `ProcessDefinition` and may also reference the exact `ProcessRouteStep` that configured it. A composite foreign key between route-step identity and process-definition identity prevents those two historical links from disagreeing. Executions do not infer their route from whichever product route is currently active.

Each row stores a positive `attemptNumber`, `startedAt`, optional `finishedAt`, and the small lifecycle enum `IN_PROGRESS`, `COMPLETED`, or `ABORTED`. `IN_PROGRESS` requires no finish timestamp; terminal statuses require one; and a finish cannot precede the start. The `(traceableUnitId, processDefinitionId, attemptNumber)` uniqueness constraint makes retries explicit without replacing earlier attempts.

`executionMethod` records the method actually used as a historical snapshot. This remains useful if route configuration later changes or the actual attempt differs from its configured method. Detailed measurements and PASS/NG outcomes are deliberately absent because they belong to Phase 2D quality evidence.

Indexes support chronological history per physical unit, process-definition history, route-step execution lookup, and status/time lookup. Referenced physical units and configuration records use restricted deletion so recorded history cannot be silently orphaned. Basic creation/update timestamps are present, while operator/user attribution remains deferred until the authentication and authorization model exists.

This subphase adds no inspection data, nonconformance/rework workflow, persistent seed data, API/UI behavior, analytics, authentication, or external machine integration.

### Phase 2D quality-inspection foundation

Phase 2D separates reusable `InspectionSpecification` configuration, actual `Inspection` events, and typed `InspectionResult` evidence. Specifications use a stable code plus positive version number; inspections reference the exact version row, so later versions do not redirect old evidence. A specification belongs to one `ProcessDefinition` and may narrow to a process-consistent `ProcessRouteStep`. It also fixes the expected result type and physical `TraceableUnitType` scope.

Numeric specifications may define independent lower/upper bounds and a stable engineering-unit code. Boolean specifications store an expected value. Categorical and visual specifications use normalized `InspectionSpecificationOption` rows with stable language-independent codes and acceptability flags. Text specifications carry no threshold configuration. No real or confidential criteria are stored.

Each completed inspection has `PASS` or `NG`, a positive attempt number, and an inspection timestamp. Its optional `ProcessExecution` must belong to the same physical unit and process definition. Retests append attempts under the same physical-unit/specification-version scope rather than replacing prior evidence. Execution lifecycle statuses remain independent from quality outcomes.

`InspectionResult` uses a constrained typed-value layout: exactly one numeric, boolean, option, or nonblank text value is permitted according to its result type. Composite foreign keys ensure that inspection type/scope/process matches its specification, the physical target matches the configured scope, and categorical/visual selections belong to the same specification and type. Indexes support histories by unit, specification, process execution, outcome, and time.

The persistence contract treats published or used specification versions and their options as immutable; changes create a new version. Because no quality service exists yet, preventing direct field mutation of used versions remains future service-layer validation. The service layer must also create the inspection and its required single result atomically and derive/verify `PASS` or `NG` against bounds, boolean expectations, or option acceptability. PostgreSQL currently enforces at most one result per inspection, but intentionally uses no trigger to require that result row. Actor attribution remains deferred until Phase 3.

This subphase adds no nonconformance, abnormal-case, action/rework, disposition, persistent seed, API/UI, analytics, authentication, or machine-integration behavior.

### Phase 2E nonconformance and action-history foundation

`DefectCategory` provides reusable active/inactive classification with a stable language-independent code. `Nonconformance` records the quality problem against one `TraceableUnit`, a unique business-facing code, category, lifecycle status, and detection/resolution/closure timestamps. Its originating `Inspection` and `ProcessExecution` are optional because manual or future process observations may also create a nonconformance; when present, composite foreign keys require them to belong to the affected unit.

`NonconformanceStatus` (`OPEN`, `IN_PROGRESS`, `RESOLVED`, `CLOSED`) describes lifecycle only. PostgreSQL requires resolution/closure timestamps appropriate to that status and chronological within the row. Final decisions are separate `DispositionHistory` events using `CONTINUE`, `CONCESSION`, `RETURN_IQC`, or `SCRAP`, so revised decisions remain auditable rather than overwriting one field. `RETURN_IQC` is only a disposition code and introduces no supplier or incoming-quality workflow.

`AbnormalCase` is an optional one-to-many escalation boundary. A simple NC can proceed through correction/retest/verification without a case, while separate escalations can be recorded independently. `ActionHistory` appends generic `CORRECTION`, `REWORK`, `REPLACEMENT`, `RETEST`, `BALANCING`, or `ESCALATION` events. An action may link to a resulting inspection or relevant unit, but measurements stay in `InspectionResult`; physical replacement relationships stay exclusively in `GenealogyRelation`.

`Verification` links an NC—and optionally one of its actions—to an existing same-unit follow-up `Inspection`. This distinguishes performing an action from verifying evidence afterward. It does not constrain the verification inspection to the originating process, leaving cross-process verification possible without encoding a rule engine.

PostgreSQL enforces unique NC/case/category codes; source evidence and follow-up inspection unit consistency; abnormal-case/action NC consistency; verification action/NC/unit consistency; nonconformance lifecycle timestamps; abnormal-case chronology; and indexes for unit/status/category/source histories, chronological actions/cases/verifications, and disposition history.

The future service layer must validate that a source inspection is `NG`, determine when an NC or escalation is required, enforce allowed lifecycle transitions and cross-row chronology, ensure verification evidence is suitable (commonly a later acceptable inspection), apply action-type-specific requirements, choose the currently effective disposition without erasing prior decisions, and attach authenticated actors. Cross-process verification requirements also remain service/configuration rules. The Phase 2D deferred rules remain unchanged: prevent mutation of used specification versions/options, atomically create inspection/result, calculate/verify outcomes, require exactly one result, and attach inspector identity later.

This subphase adds no persistent seed data, API/UI, analytics, authentication, supplier/IQC workflow, cross-process rule engine, or external machine integration.

### Phase 2F deterministic synthetic dataset

`apps/api/prisma/seed.mjs` uses the generated Prisma client and PostgreSQL adapter already selected by the project. `npm run db:seed` regenerates and compiles the client before running the seed. Fixed seed-owned UUIDs, stable codes, and fixed UTC timestamps make identities and stories reproducible. Each known row is upserted by its seed-owned ID inside one transaction; reruns reconcile only those rows and never delete, truncate, or reset unrelated data.

The intentionally small graph contains `DEMO_ALPHA` and `DEMO_BETA`, four shared generic processes, two differently ordered routes, three packs with one demo module and two demo cells each, selected component/material relationships, and one closed-old/active-new component-position history. Fourteen execution records retain chronological route linkage and actual-method snapshots. Five fictional specification codes cover numeric, boolean, categorical, visual, and text evidence; their demo limits and values are not production parameters.

The three pack stories are: a clean PASS flow with no NC; a simple NG → correction → retest → PASS → verification → CONTINUE flow with no abnormal case; and an optional escalation with abnormal case, replacement/retest action history, PASS verification, and two retained dispositions. The seed directly constructs schema-valid persistence examples. It does not enforce immutable used specifications, atomic inspection creation, calculated outcomes, exactly-one-result semantics, NG-origin/lifecycle/action/verification/effective-disposition rules, cross-process rules, or authenticated actors; those remain service-layer work.

### Phase 2G traceability query architecture

`TraceabilityModule` is an internal NestJS module with a small `TraceabilityRepository`, `TraceabilityService`, and `TraceabilityIntegrityService`. It exports reusable services for future application layers but intentionally adds no controller or public endpoint. Stable trace codes are accepted at the boundary and resolved through the unique trace-code index; UUIDs remain internal relationship identities. An unknown code throws `TraceableUnitNotFoundError` instead of returning a misleading partial view.

Forward and reverse genealogy each use one understandable recursive PostgreSQL CTE. The forward query follows `parentUnitId → childUnitId`; reverse impact tracing follows `childUnitId → parentUnitId`. Neither assumes Pack → Module → Cell or a maximum depth. Each recursion carries a UUID array path and refuses to revisit a node, so malformed cyclic data terminates safely. Prisma tagged SQL binds trace-resolved UUIDs and timestamps as parameters; trace codes are never interpolated into SQL text.

Genealogy scope is explicit. `current` includes only `removedAt IS NULL`; `historical` includes active and removed relationships. The query contract also supports an `asOf` timestamp using `installedAt <= T AND (removedAt IS NULL OR removedAt > T)`, without adding a temporal engine or changing the schema. Position history reads `GenealogyRelation` chronologically, keeping it as the sole replacement source of truth.

Process history is ordered by execution start and preserves attempts, configured route/step context, lifecycle status, and the actual execution-method snapshot. `COMPLETED` is never interpreted as quality `PASS`. Quality history independently orders inspection attempts, retains NG and later PASS events, and returns type-safe numeric, boolean, categorical, visual, or text evidence with stable option codes. NC reconstruction uses bounded Prisma relation queries to preserve source evidence, optional cases, ordered actions and linked retests, verifications, and every disposition.

The complete traceability service composes identity, genealogy, process, quality, and NC results concurrently instead of flattening one-to-many relationships into a duplicated Cartesian result. Existing indexes support trace lookup, both genealogy directions, and time-oriented histories. This correctness-focused design is verified only against the small seed; production-scale work would need measured query plans plus API pagination, depth/result limits, and possibly caching. No speculative indexes were added. A separate large synthetic production generator and load testing remain future extensions.

The integrity validator adds application-level checks that span rows and graphs: cycle absence, active hierarchy and position coherence, route/process agreement, complete matching inspection results, retained NG plus separate PASS retests, verification unit/action context, NC history coherence, and the expected old-removed/new-active `SENSOR-01` replacement. It complements rather than duplicates PostgreSQL constraints.

### Phase 2H acceptance gate

The complete Phase 2A–2G diff was reviewed from the Phase 1 baseline commit. The five additive migrations remain fully applied, unmodified during Phase 2H, and drift-free. Two consecutive final seed runs retained the same documented count vector. Live evidence and all nine integrity checks passed, followed by Prisma validation/generation/status/drift, TypeScript, lint, 7 unit tests, 10 traceability integration tests, 1 E2E health test, production build, and diff checking.

The final review found no concrete correctness, data-integrity, security, performance, maintainability, or scope issue requiring a Phase 2H fix. The repository safety audit confirmed synthetic public data, ignored private environment configuration, no embedded credentials, parameterized raw SQL, no destructive seed behavior, and no Phase 3 implementation. The user then completed every manual acceptance item recorded in `ROADMAP.md`: migration readiness, two successful seed runs, live traceability/integrity evidence, focused traceability tests, and the grouped `npm run phase2:verify` regression all passed. Phase 2 is verified complete; Phase 3 is next and remains unstarted.

### Development configuration contract

- PostgreSQL is the development relational database.
- The future API connection uses `DATABASE_URL` with the shape `postgresql://USER:PASSWORD@HOST:PORT/DATABASE`.
- `apps/api/.env.example` contains synthetic placeholders and remains trackable; real `.env` variants are ignored.
- Development database and role names must be project-specific and non-sensitive.
- Production credentials must never be committed or reused for local development.
- NestJS does not load environment files or open a database connection during startup, and health checks do not depend on database readiness.
- Phase 1D uses Prisma ORM 7.10.0 with `@prisma/adapter-pg` and the `pg` driver. The ESM client is generated to an ignored application-local directory.
- `PrismaService` initializes its client lazily from `DATABASE_URL`, so missing or unavailable PostgreSQL does not prevent the API or health endpoint from starting.
- Phase 2A provides product/process configuration, Phase 2B physical units/genealogy, Phase 2C manufacturing execution history, Phase 2D quality-inspection configuration/evidence, Phase 2E nonconformance action/decision history, Phase 2F deterministic synthetic examples, and Phase 2G internal traceability/integrity queries. Phase 2H automated regression and manual acceptance passed; Phase 2 is verified complete.

All five ordered Phase 2 migrations through `20260923040000_phase_2e_nonconformance_action_history` remain applied locally and unchanged. Prisma reported no schema drift. Phase 2G live evidence reconstructed forward Pack → Module → Cell/material traversal, reverse Cell → Module → Pack traversal, historical-only old component ancestry, chronological replacement occupants, repeated process attempts, retained NG/PASS inspections, the simple NC without escalation, and the escalated case with both dispositions. All nine integrity checks passed. Two consecutive seeds completed successfully without duplicates. Prisma format/validate/generate, migration status, no-drift comparison, API TypeScript/lint, 7 unit tests, 10 focused database-backed traceability tests, 1 E2E test, production build, and `git diff --check` passed. The user completed the Phase 2H manual acceptance, so Phase 2A through Phase 2H and Phase 2 are verified complete.

## Internationalization architecture

Internationalization is a foundation-level, cross-cutting requirement.

- Phase 1E uses `next-intl` 4.14.5 for App Router server/client message access, locale-aware navigation, routing, and future date/number formatting.
- The centralized registry contains `en`, `zh-CN`, `de`, `ko`, `ja`, `ar`, `id`, and `hi`.
- English (`en`) is canonical, default, and fallback. English uses the unprefixed canonical URL; other locales use prefixes such as `/id` and `/ar`.
- English and Bahasa Indonesia currently have complete foundation-page and metadata messages. All other declared locales intentionally load English messages until coverage is added progressively.
- The locale switcher uses `next-intl` navigation and a one-year locale cookie, avoiding global client state while preserving preference across reloads and normal navigation.
- The locale layout derives `<html lang>` and `dir` from the active locale. Arabic uses `rtl`; every other declared locale uses `ltr`.
- Page layout uses logical direction-aware styling rather than page-specific Arabic CSS.
- User-facing strings use translation resources and keys rather than component-local copy.
- Dates and numbers will use locale-aware formatting where appropriate.
- Responsive components must tolerate different translated text lengths; final Phase 1 manual acceptance verified locale switching, persistence, fallback, RTL behavior, and the targeted desktop and mobile layouts.
- Raw engineering values and identifiers stay stable and language-independent
- Domain logic uses stable codes; localized labels are presentation data
- Runtime automatic machine translation is not used.

## Testing strategy

Testing will grow progressively:

- Backend unit tests for business rules
- API and integration tests
- Valuable frontend component and interaction tests
- A small set of critical end-to-end flows

Critical future E2E candidates include trace-code search through genealogy/history, inspection entry, and an abnormal case progressing through action and required verification. Test data must remain synthetic.

## Production engineering direction

Later phases will progressively add Docker and Docker Compose, CI/CD, linting, type checking, automated tests, deployment, structured logging, useful request correlation, consistent error handling, health endpoints, security hardening, performance, and responsive polish.

These concerns must not all be forced into initial scaffolding. Kubernetes, microservices, distributed tracing stacks, and complex observability platforms remain out of scope unless future requirements justify them.
