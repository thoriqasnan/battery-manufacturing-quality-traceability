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

Phase 2A through Phase 2H and Phase 2 are **VERIFIED COMPLETE**. Phase 3 is **VERIFIED COMPLETE**.

## Phase 3 — Authentication & RBAC

**Status: VERIFIED COMPLETE**

### Phase 3A — Auth/RBAC Architecture & Contracts

**Status: VERIFIED COMPLETE**

- Authentication and authorization are separate boundaries: authentication resolves a synthetic user from a revocable server-side session; authorization evaluates explicit permissions for that user.
- Selected a server-managed opaque session carried in a secure, HTTP-only cookie, with explicit CSRF protection for state-changing requests. No bearer credential is exposed to browser JavaScript.
- Defined conceptual login, logout, current-session, unauthenticated, and forbidden contracts without adding endpoints or implementation code.
- Defined the minimal `ADMIN`, `QUALITY`, `PRODUCTION`, and `ENGINEERING` role bundles, NestJS guard/policy enforcement, frontend auth states, and actor-attribution expectations.
- Reconciled architecture, domain, security, roadmap, and project-status documentation. No user schema, credential, authentication transport, guard, or UI was implemented.

Acceptance criteria met:

- [x] The repository and Phase 2 deferred actor responsibilities were reviewed.
- [x] Authentication, session transport, CSRF, revocation/logout, RBAC, error, frontend-state, and auditability contracts are explicit.
- [x] Permission boundaries cover only the Phase 3–7 MVP capabilities already on the roadmap.
- [x] The public synthetic-data boundary and password/secrets principles are preserved.
- [x] Source-of-truth documents recorded Phase 3A as complete, Phase 3 as in progress, and Phase 3B as the next subphase at the Phase 3A gate.
- [x] Documentation/repository checks and a focused diff review passed.

### Phase 3B — User/Role Persistence Foundation

**Status: VERIFIED COMPLETE**

- Added the minimal `User` persistence model with UUID identity, unique normalized synthetic username, required hash-only `passwordHash`, fixed `UserRole`, active/disabled state, and audit timestamps.
- Represented `ADMIN`, `QUALITY`, `PRODUCTION`, and `ENGINEERING` as a PostgreSQL/Prisma enum because Phase 3A defines one stable role bundle per user; no dynamic IAM, ACL, permission, or role-administration tables were added.
- Added and applied additive migration `20260924000000_phase_3b_user_role_persistence` without changing the five Phase 2 migrations or domain tables.
- Added four focused database-backed tests for all role values, active/disabled persistence, username uniqueness/format, and nonblank hash storage. Tests create only temporary synthetic rows and remove them; no user or credential fixture was seeded.
- Prisma format/validate/generate, six-migration status, no schema drift, TypeScript, lint, 7 unit tests, 4 user-persistence tests, 10 traceability tests, 1 E2E test, production build, and `git diff --check` passed.

No manual acceptance is required for this persistence-only subphase. Phase 3B itself added no login, hashing/verification behavior, sessions, cookies, CSRF, authentication/RBAC guards, actor foreign keys, or frontend authentication; Phase 3C subsequently added only password hashing and credential verification.

### Phase 3C — Password Authentication

**Status: VERIFIED COMPLETE**

- Added a centralized password-hash service using maintained `argon2` 0.45.1 with Argon2id, 19 MiB memory, two iterations, one lane, a 32-byte hash, and library-generated salts stored in the self-contained PHC string.
- Added a server-side password policy of 12–128 Unicode code points with no arbitrary character-composition rules; all-whitespace passwords are rejected.
- Added minimal credential authentication that normalizes usernames, validates the stored hash, rejects inactive users, returns only UUID/username/role/active identity, and exposes no password hash.
- Unknown usernames, incorrect passwords, and inactive accounts use the same `INVALID_CREDENTIALS` failure. Unknown usernames perform verification against a process-local random dummy Argon2id hash to reduce obvious account-enumeration timing differences.
- Added current-parameter rehash detection for a future successful-authentication/credential-update path without introducing sessions or hidden persistence writes in this subphase.
- Added 12 focused hashing, policy, and credential-authentication tests using temporary fictional users with complete cleanup. No permanent account or reusable plaintext credential was seeded.
- Prisma format/validate/generate, six-migration status, no schema drift, TypeScript, lint, 14 unit tests, 4 user-persistence tests, 12 authentication tests, 10 traceability tests, 1 E2E test, production build, and `git diff --check` passed.

No manual acceptance is required because Phase 3C exposes no endpoint or UI. Phase 3C itself added no sessions, cookies, CSRF, logout/revocation, transport error mapping, authorization guards, or frontend authentication; Phases 3D and 3E subsequently implemented the backend transport and authorization boundaries.

### Phase 3D — Session/Auth Transport

**Status: VERIFIED COMPLETE**

- Added revocable `Session` persistence with UUID identity, owning user, unique SHA-256 token digest, creation/absolute-expiration timestamps, optional revocation timestamp, lifecycle checks, and lookup/cleanup indexes.
- Added 256-bit cryptographically random opaque session tokens. Only their digest is persisted; raw tokens exist only at the server/cookie boundary and are never returned in JSON or logged.
- Implemented an eight-hour absolute lifetime with no sliding renewal. Expired, revoked, unknown, and inactive-user sessions resolve as `UNAUTHENTICATED`.
- Implemented `POST /auth/login`, `GET /auth/session`, and idempotent `POST /auth/logout`. Login returns safe user/session metadata, current-session returns safe identity plus CSRF material, and logout revokes the row and clears the cookie.
- Centralized a host-only `bmqt_session` cookie using `HttpOnly`, `SameSite=Lax`, `Path=/`, matching expiry/Max-Age, and `Secure` in production; no `Domain` attribute is set.
- Added session-bound CSRF tokens derived with HMAC-SHA-256 from the session UUID and environment-only `AUTH_CSRF_SECRET`. Authenticated unsafe requests require the token in `X-CSRF-Token` plus an exact configured `Origin` match.
- Updated exact-origin CORS for credentialed `GET`/`POST` requests and the CSRF header. No production origin or usable secret is hard-coded.
- Added 3 security-primitive unit tests and 9 HTTP lifecycle tests covering digest-only persistence, login/cookies, current-session failures, expiration/revocation, inactive users, logout, origin enforcement, and missing/wrong/cross-session CSRF tokens. Temporary fictional users/sessions are removed.
- Prisma format/validate/generate, seven-migration status, no schema drift, TypeScript, lint, 17 unit tests, 4 user-persistence tests, 15 authentication tests, 9 auth-transport tests, 10 traceability tests, 10 E2E tests, production build, and `git diff --check` passed.

No additional manual gate is required for Phase 3D. Browser cookie behavior remains part of the final Phase 3I manual acceptance. Phase 3D itself added no domain permission metadata or RBAC guards; Phase 3E subsequently implemented those backend authorization boundaries.

### Phase 3E — RBAC Authorization

**Status: VERIFIED COMPLETE**

- Added ten stable permissions matching the Phase 3A roadmap boundary and a centralized, immutable `UserRole` → permission mapping. No dynamic ACL/IAM persistence or speculative feature permission was introduced.
- `ADMIN` explicitly receives dashboard/traceability read plus user administration only; it has no automatic domain-operation bypass.
- Added global ordered NestJS guards for authenticated-session resolution, CSRF/origin enforcement on protected unsafe methods, and permission evaluation. Explicit `@Public()` metadata is required to bypass the protected pipeline.
- Protected handlers without explicit permission metadata are denied by default. Missing/invalid session state returns `401 UNAUTHENTICATED`; authenticated users lacking policy return `403 FORBIDDEN`.
- Added a typed authenticated actor context containing only UUID, normalized username, role, and active state. Password/session/CSRF internals are not exposed downstream.
- Added 6 permission-matrix tests and 10 focused authorization E2E tests proving all role bundles, explicit ADMIN limits, default deny, safe actor delivery, session failure states, CSRF/origin ordering, and rejection of client-supplied role claims.
- Fixed the existing auth-transport E2E count assertion to scope itself to its own synthetic fixtures so parallel E2E suites remain isolated.
- Prisma validation/generation, seven-migration status, no schema drift, TypeScript, lint, 23 unit tests, 4 user-persistence tests, 21 authentication tests, 9 auth-transport tests, 10 authorization tests, 10 traceability tests, 20 E2E tests, production build, and `git diff --check` passed.

No manual acceptance is required because Phase 3E adds backend infrastructure and test-only authorization surfaces rather than production domain endpoints. Phase 3F subsequently added frontend authentication without changing the backend security contract.

### Phase 3F — Frontend Authentication

**Status: VERIFIED COMPLETE**

- Implemented the selected modern industrial enterprise SaaS login direction with a balanced desktop split, dark navy CSS-generated technical panel, cool-white authentication workspace, restrained blue interaction color, and semantic green reserved for active/healthy state.
- Added responsive single-column mobile behavior, real `next-intl` locale switching, Arabic/RTL-safe logical layout, visible labels, 48px form controls, keyboard submission, accessible generic errors, reduced-motion-aware bootstrap progress, and a value-preserving Show/Hide password control.
- Added explicit `BOOTSTRAPPING`, `AUTHENTICATED`, `UNAUTHENTICATED`, and recoverable unexpected-error states. Protected content stays hidden until `GET /auth/session` resolves; `401` becomes unauthenticated while network/5xx/unexpected failures remain recoverable rather than being treated as logout.
- Added credentialed `POST /auth/login`, `GET /auth/session`, and CSRF-protected `POST /auth/logout` calls through a validated frontend API boundary. The browser-managed `bmqt_session` cookie is never read by JavaScript.
- Kept the returned CSRF token only in React memory and added a reusable `X-CSRF-Token` header helper for authenticated unsafe requests. Passwords, session credentials, and CSRF material are never persisted in local/session storage or URLs.
- Added only a minimal authenticated workspace transition with safe username/role display and logout. Role-aware navigation, forbidden-state application routing, and the full shell remain Phase 3G; backend authorization remains authoritative.
- Added a minimal Vitest/jsdom/Testing Library setup and 11 focused tests covering bootstrap visibility and outcomes, refresh recovery, successful/generic-failure/network-failure login, hidden/show/hide password behavior, logout with in-memory CSRF, storage non-use, localized semantics, and responsive structure.
- Frontend lint, Next route type generation, TypeScript, 11 auth tests, and webpack production build passed. Backend/Prisma regression passed with seven migrations current, no drift, 23 unit tests, 4 persistence tests, 21 authentication tests, 9 auth-transport tests, 10 authorization tests, 10 traceability tests, 20 E2E tests, lint/typecheck/build, and Prisma format/validate/generate.

Phase 3I manual browser acceptance passed the Phase 3F login, invalid-credential, password-visibility, refresh-persistence, logout, post-logout refresh, responsive presentation, locale, RTL, and keyboard interaction checks.

### Phase 3G — Role-aware UI

**Status: VERIFIED COMPLETE**

- Implemented the approved modern industrial enterprise SaaS application shell with a deep-navy persistent desktop sidebar, restrained top context bar, cool-neutral content workspace, shared authenticated page layout, and consistent lightweight icons.
- Organized navigation into Overview, Operations, Quality, Engineering, and Administration. Visibility comes only from the authenticated session user's server-established role and a frontend mirror of Phase 3E permissions; it is usability behavior, not authorization enforcement.
- Preserved explicit role boundaries: `ADMIN` sees Overview, Traceability, and Users without domain-mutation links; `QUALITY`, `PRODUCTION`, and `ENGINEERING` receive only their mapped destinations. Client-controlled URL/query/storage claims cannot grant links.
- Added localized workspace routes behind the Phase 3F bootstrap gate, `aria-current` active states, and restrained unavailable/future-phase states without fake metrics, charts, records, forms, or API responses.
- Integrated safe username/role presentation, the real locale switcher, and the existing credentialed CSRF-protected server logout. No UUID, cookie, session, password, CSRF, or security metadata is rendered or persisted.
- Added a responsive RTL-safe mobile drawer with 44px targets, initial focus, contained Tab navigation, Escape/backdrop/visible-close behavior, focus restoration, scroll locking, and reduced-motion treatment.
- Added 9 shell tests across all four roles, untrusted claims, active navigation, mobile keyboard behavior, localization, identity safety, logout access, and absence of fake metrics. Together with 13 Phase 3F authentication tests, 22 frontend tests pass; type generation, TypeScript, lint, and production build also pass.

Phase 3I manual browser acceptance passed the desktop shell, all four role-specific navigation sets, unauthorized-link absence, responsive transition, mobile drawer close/backdrop/Escape behavior, locale continuity, Arabic RTL structure, and keyboard interaction checks.

### Phase 3H — Security/Integration Hardening

**Status: VERIFIED COMPLETE**

- Completed a route-security inventory: `GET /health` is explicitly `PUBLIC`; `POST /auth/login`, `GET /auth/session`, and `POST /auth/logout` are explicit auth-contract special cases; test-only protected routes prove `AUTHENTICATED + PERMISSION` behavior. No production route is accidentally unclassified or exposes Phase 4 domain behavior.
- Added a minimal login-specific fixed-window limiter enabled only in production: 10 attempts per client address per minute, generic `429 TOO_MANY_ATTEMPTS`, bounded process-local storage, no username-dependent behavior, and deterministic disabled behavior in local/test environments. It is appropriate for the current single-instance portfolio deployment; a multi-instance deployment requires shared edge/gateway limiting and reviewed trusted-proxy configuration.
- Added explicit API and frontend security-header baselines: content-type sniffing prevention, frame denial plus CSP `frame-ancestors`, no-referrer policy, restricted browser capabilities, and conservative CSP base/object restrictions. The frontend CSP intentionally does not invent deployment script/connect hosts or block required Next.js runtime behavior. HSTS remains a TLS-termination/deployment responsibility and must be enabled only by the HTTPS production boundary.
- Added a Phase 3H integrated E2E flow covering login, cookie/session creation, current-session bootstrap, protected permission read, CSRF-protected unsafe write, logout/revocation, and subsequent rejection. Fresh successful logins produce independent session and CSRF values; concurrent sessions remain permitted by the documented architecture.
- Reverified token digest-only persistence, 256-bit entropy, server expiry/revocation/inactive-user checks, host-only cookie scope, production `Secure`, aligned expiry/Max-Age, session-bound constant-time CSRF checks, exact origins, restricted credentialed CORS, generic credential failures, Argon2id policy, safe actor output, default deny, ADMIN limits, and distinct `401`/permission `403`/security `403` contracts.
- Confirmed fixture-owned test cleanup and prefix-scoped count assertions. Seven additive migrations are current with no drift; Phase 2 remains intact and temporary Phase 3H users/sessions are removed.
- Dependency review found four backend high advisories confined to Prisma CLI/tooling transitive paths (`deepmerge-ts` and unused MySQL tooling). npm proposes a breaking Prisma 7→6 downgrade, so no unsafe fix was applied; PostgreSQL application runtime does not use the affected MySQL path. The two frontend moderate Vitest/mocker development advisories had a compatible fix, so Vitest was updated to 4.1.11 and the frontend audit now reports zero vulnerabilities.
- Full verification passed: frontend 22 tests plus type generation, TypeScript, lint, and build; backend Prisma format/validate/generate/status/no-drift, TypeScript, lint, 25 unit tests, 4 persistence tests, 23 authentication tests, 9 transport tests, 10 authorization tests, 4 hardening tests, 10 traceability tests, 24 E2E tests, and production build.

Phase 3H required no separate manual gate. Its security and integration evidence was rechecked as part of the final Phase 3 gate, while the assigned browser, cookie, responsive, keyboard, locale, RTL, and role-visibility checks passed in Phase 3I.

### Phase 3I — Manual Acceptance & Final Reconciliation

**Status: VERIFIED COMPLETE**

The user-operated Phase 3I browser session produced the following acceptance evidence:

#### Login

- [x] Initial loading/bootstrap state is clear and protected shell content does not flicker.
- [x] Login appearance matches the approved modern industrial enterprise SaaS direction.
- [x] Username/password interaction and keyboard submission work.
- [x] Show/Hide preserves the password value and remains keyboard accessible.
- [x] Invalid credentials show the generic localized failure state.
- [x] Valid synthetic credentials reach the authenticated shell.

#### Session

- [x] Refresh restores the authenticated session through the server.
- [x] Logout revokes the session and returns to login.
- [x] Refresh after logout remains logged out.
- [x] Automated transport and integration tests cover expired, invalid, and revoked sessions without requiring unsafe manual database manipulation.

#### Role-aware UI

- [x] ADMIN shows Overview, Traceability, and Users only.
- [x] QUALITY shows Overview, Traceability, Inspections, and Nonconformance.
- [x] PRODUCTION shows Overview, Traceability, Production, and Nonconformance.
- [x] ENGINEERING shows Overview, Traceability, and Actions.
- [x] Automated bootstrap and routing tests confirm unauthenticated workspace navigation does not expose the shell.

#### Responsive and interaction

- [x] Desktop sidebar width, spacing, typography, contrast, active state, and focus state match the approved direction.
- [x] Tablet/narrow layout has no observed horizontal scrolling or squeezed desktop sidebar.
- [x] Mobile drawer opens and closes by button, backdrop, and Escape; its keyboard behavior and role-aware navigation were accepted.

#### Internationalization and RTL

- [x] English renders and navigates correctly.
- [x] Bahasa Indonesia auth and shell copy render correctly.
- [x] Japanese uses the intentional English fallback without structural breakage.
- [x] Arabic uses the intentional English fallback and applies RTL safely without observed overflow or collision.

#### Final Phase 3 gate

- [x] Real-browser login, refresh, logout, and post-logout behavior are accepted; automated transport tests verify cookie attributes and server revocation.
- [x] Role visibility matches the expected mapping and remains UX rather than backend security.
- [x] No reusable credentials, secrets, real identities, or proprietary manufacturing information entered Git or acceptance evidence.

The favicon uses an original opaque deep-navy BQ mark in `apps/web/src/app/favicon.ico`, with embedded 16, 32, and 48 pixel images. The asset, App Router integration, direct Safari rendering, response MIME type, and production-build inclusion passed. Safari continued to show its generated/cached localhost “L” tab glyph even though no such asset or metadata exists in the repository; this is non-blocking local-origin behavior and favicon tab rendering must be rechecked on the eventual deployment domain.

Manual acceptance, final automated regression, and source-of-truth reconciliation passed. Phase 3A through Phase 3I and Phase 3 are **VERIFIED COMPLETE**.

## Phase 4 — Manufacturing Dashboard & Traceability

**Status: VERIFIED COMPLETE — 4A–4J VERIFIED COMPLETE**

Phase 4 is read-oriented and its hero capability is unified unit traceability, not generic dashboard charts. The governing design and REST/UX contracts are in [`docs/DASHBOARD_TRACEABILITY.md`](docs/DASHBOARD_TRACEABILITY.md).

### Phase 4A — Dashboard & Traceability UX / Read Contracts

**Status: VERIFIED COMPLETE**

- Grounded the design in the actual normalized unit/genealogy, process-execution, typed inspection, nonconformance, authorization and locale models.
- Defined the one-trace-code journey from any pack, module, cell, component or material, including bounded descendant and ancestor traversal.
- Kept genealogy, process, quality and nonconformance meanings distinct; current, removed, historical and as-of relationships are explicit.
- Selected a hybrid read API: lightweight detail/availability shell plus independently paged genealogy and history resources.
- Defined evidence-backed overview metrics, deterministic search/filter/pagination, stable empty/error semantics, authorization, performance bounds, responsive/accessibility behavior and the public synthetic-data boundary.
- Rejected a fabricated unit status, ungrounded KPIs/trends and eager whole-graph rendering. No endpoint, schema, production query or UI was implemented.

### Phase 4B — Backend Dashboard Read Models

**Status: VERIFIED COMPLETE**

- Added authenticated `GET /dashboard/overview` with explicit API read-model types and backend-enforced `dashboard:view`; the existing role matrix and explicit ADMIN limits are unchanged.
- Added set-based database aggregates for all traceable-unit types, packs by product model, in-progress executions, all-record inspection outcomes, and open/in-progress NC lifecycle states.
- Added a maximum-ten recent process-execution list ordered by `startedAt DESC`, `attemptNumber DESC`, and internal ID only as a deterministic unexposed tie-breaker.
- Empty databases produce successful, ordered zero counts and empty arrays. Quality declares `ALL_RECORDS`; successful zero counts mean no persisted rows, while database failures remain errors rather than fabricated data.
- Added focused unit/E2E coverage for empty semantics, database-derived seed evidence, deterministic bounds/order, authentication, permission metadata/policy, and private/internal-field exclusion.
- TypeScript, lint, 5 dashboard tests, 10 authorization tests, 27 backend E2E tests, production build, Phase 2 traceability integrity regression, privacy review, fixture cleanup, and diff checking passed.

### Phase 4C — Traceability Search API

**Status: VERIFIED COMPLETE**

- Added authenticated `GET /traceability`, protected by `traceability:view`, with explicit query and response read models and stable `INVALID_REQUEST` validation errors.
- Added trimmed uppercase exact/prefix trace-code search, blank browse mode, direct `unitType` and direct product-model-code filters, 1-based pagination (25 default, 100 maximum), exact-first ranking, and deterministic trace-code/internal-ID ordering without exposing IDs.
- Product-model filtering intentionally follows only the nullable direct `TraceableUnit.productModel` relationship. Under the database constraint this returns packs and performs no inferred genealogy traversal.
- Search rows expose trace code, unit type, nullable direct product model, persistence creation time, nullable latest directly recorded activity time, and exact/prefix/null match context. No unit/quality status, current process, parent/pack inference, raw Prisma object, or internal key is returned.
- Page activity is computed with three bounded group aggregates rather than N+1 queries. Exact/count/page selection stays in PostgreSQL and never loads the full collection into Node.
- PostgreSQL plans on the 16-unit seed reasonably chose sub-millisecond sequential scans; the existing unique trace-code index supports exact index-only lookup and ordered prefix scanning when index paths are considered. Product code used its unique index. No schema, migration, or speculative index was added.
- All 24 focused parser/E2E tests passed, covering authorization metadata, normalization, exact/prefix/no-substring behavior, filters, browse, bounds, deterministic ordering, empty pages, errors, and privacy.
- Final verification passed: TypeScript, lint, 10 traceability/integrity tests, 10 authorization tests, 5 dashboard tests, 39 sequential isolated E2E tests, production build, fixture cleanup, privacy review, and diff checking. The general E2E runner is intentionally file-sequential so temporary database fixtures cannot alter another suite's global aggregate assertions.

### Phase 4D — Unit Detail & Genealogy API

**Status: VERIFIED COMPLETE**

- Added normalized authenticated `GET /traceability/:traceCode` identity/section-count and `GET /traceability/:traceCode/genealogy` reads, both protected by `traceability:view` with stable malformed/not-found errors.
- Unit detail exposes only direct persisted identity plus exact direct genealogy, process, inspection, and NC record counts; zero counts never imply status, PASS, or completion.
- Added parameterized recursive ancestor/descendant reads with `current`, `historical`, and `asOf` scopes; depth defaults to 1 and is capped at 8, while edge pages default to 50 and cap at 100.
- Added stable ordering, opaque scope-bound cursors, direct parent/child counts for progressive disclosure, explicit edge/depth partial reasons, hashed opaque relation references, and no internal UUID exposure.
- Traversal records visited UUID paths, emits `CYCLE_PATH_SKIPPED`, and terminates corrupt cyclic paths rather than looping or presenting them as clean evidence.
- Verified current/removed history and exact point-in-time semantics: `installedAt <= at AND (removedAt IS NULL OR removedAt > at)`.
- PostgreSQL plans on the 16-unit seed completed root lookup and bounded ancestor/descendant CTEs below one millisecond. Existing trace-code and both directional genealogy indexes remain appropriate; no schema/migration/index change was justified.
- All 15 focused database-backed tests passed, including normalized detail, section counts, both directions/depths, maximum depth, scope/time boundaries, isolated units, 101-edge pagination, cursor scoping, deterministic order, explicit cycle handling, authorization, errors, and privacy.
- Final regression passed: TypeScript, lint, 10 Phase 2 traceability/integrity tests, 5 dashboard tests, 24 search tests, 10 authorization tests, 54 sequential backend E2E tests, production build, test-fixture cleanup, public-data/privacy review, and diff checking.

### Phase 4E — Overview Dashboard UI

**Status: VERIFIED COMPLETE**

- Replaced the Overview readiness placeholder with a responsive operational dashboard that consumes only authenticated `GET /dashboard/overview` evidence.
- Added a prominent Trace a Unit action whose controlled value immediately normalizes typed and pasted input to uppercase, then preserves the public trim and 1–128 safe-character validation contract for navigation. The Overview includes complete inventory/product/process/quality/nonconformance summaries and bounded recent activity without client-derived KPIs, trends, charts, yield, or throughput.
- Added explicit loading, recoverable error, forbidden, zero, empty, and unavailable-evidence states; a dashboard `401` invalidates the existing in-memory session.
- Added complete English and Indonesian dashboard copy, locale-aware number/time formatting, registered-locale English fallback compatibility, logical RTL-safe layout, semantic headings/lists/definitions, textual status meaning, visible focus, and mobile stacking. Mixed-direction technical values are isolated; the generated label and locale-formatted timestamp use separate bidi runs. The narrow header preserves the complete current context while retaining a labelled, keyboard-accessible, 44px-high compact locale selector.
- Final automated verification passed 5 focused dashboard backend tests, 10 authorization tests, all 54 sequential backend E2E tests, 43 relevant frontend tests, backend/frontend TypeScript and lint, both production builds, and `git diff --check`.
- Manual Safari acceptance passed lowercase/mixed-case typing and paste normalization, unchanged uppercase and invalid-character/query behavior, coherent Arabic RTL generated time/trace codes/KPI values at mobile and wider widths, and the complete `OVERVIEW` / `Overview` context with a usable locale selector at approximately 375×812 without observed overlap or horizontal overflow. English fallback remains intentional for untranslated Arabic Phase 4E copy.

### Phase 4F — Traceability Search UI

**Status: VERIFIED COMPLETE**

- Replaced the shell placeholder with authenticated, runtime-validated consumption of the verified Phase 4C `GET /traceability` contract. Blank criteria perform bounded persisted browse; optional controlled trace-code and product-model inputs canonicalize typing/paste to uppercase.
- Added exact/prefix search, unit-type and direct product-model filters, fixed 25-row numbered pagination, URL initialization/canonicalization, Clear-to-browse, browser-history restoration, loading/forbidden/retry/invalid/empty/page-past-end states, and responsive persisted-evidence record cards without invented unit status or inferred model ancestry.
- True zero totals retain the query/filter context and accessible no-match message while omitting pagination. Normal one-page and multi-page behavior is unchanged.
- Added complete English and Indonesian copy with intentional English fallback for other registered locales. Trace/model codes remain isolated LTR values; locale-formatted timestamps are atomic non-wrapping auto-direction bidi runs for Arabic RTL safety.
- Added `/[locale]/traceability/[traceCode]` as an authenticated non-404 destination for result links. It preserves shell/Traceability context and shows only the selected isolated code plus a localized “Unit detail is coming next” message. It does not fetch Phase 4D detail/genealogy and is not Phase 4G implementation.
- Final verification passed 30 focused frontend tests, all 62 frontend regression tests, 24 Phase 4C parser/E2E tests, frontend TypeScript and ESLint, the webpack production build with the nested route present, and `git diff --check`.
- Manual Safari acceptance passed the 16-unit persisted browse, Overview deep link, uppercase typing/paste, exact/prefix search, supported filters and direct-model semantics, URL Clear/Back behavior, zero-result correction, nested destination, English/Indonesian/fallback presentation, 375×812 responsive behavior, and Arabic RTL identifiers and timestamps at mobile and wider widths.

### Phase 4G — Unit Detail & Genealogy UI

**Status: VERIFIED COMPLETE**

- Replaced the nested trace-code placeholder with authenticated, runtime-validated Unit Detail backed by the Phase 4D detail and genealogy APIs. It renders persisted identity, direct product context, recorded/updated times, and direct evidence-availability counts without inventing health, completion, PASS/NG, or inherited product context.
- Added independently loaded bounded ancestor and direct-child evidence with related-unit links, cursor continuation, explicit empty/partial/cycle states, and direction-specific retry behavior. Current, historical, and point-in-time scopes preserve installed/removed evidence and the inclusive-install/exclusive-removal temporal contract.
- Added URL-addressable scope and timezone-qualified as-of state. The application-controlled `DD/MM/YYYY, HH:mm` editor provides semantic Day/Month/Year/Hour/Minute segments, valid auto-advance, calendar clamping, a synchronized bounded chooser, and no native Safari datetime picker.
- Scope and as-of query transitions preserve viewport position while retaining push/Back/Forward semantics. Locale changes retain the full investigation query and use a bounded transient in-memory viewport handoff across the root locale-layout remount; no persistent browser storage or document reload is used.
- Added a compact Search another traceable unit action that reuses Phase 4F canonical uppercase validation and URL-driven search rather than duplicating search behavior.
- English and Indonesian copy, intentional fallback locales, Arabic RTL with LTR-isolated technical values, bidi-isolated timestamps, keyboard semantics, and the responsive 375×812 card layout passed manual Safari acceptance.
- Final frontend verification passed 64 focused tests, all 96 frontend regression tests, TypeScript, ESLint, the webpack production build with the dynamic nested route, and `git diff --check`. Manual acceptance passed identity/counts, current/historical/as-of genealogy, replacement evidence, related-unit traversal, URL/history behavior, segmented date/time UX, locale/scope viewport preservation, quick search, mobile, localization, and RTL.

### Phase 4H–4J

- **4H — Process, Quality & Nonconformance History API/UI:** VERIFIED COMPLETE
  - **4H-1 — Backend Public History Contracts:** VERIFIED COMPLETE. Defines bounded query/response contracts, strict discriminated inspection evidence, separate NC lifecycle/history aggregates, explicit nested partial metadata, deterministic opaque references, and future repository ordering. At that checkpoint no history endpoint was operational.
  - **4H-2 — Bounded Repository & Service Reads:** VERIFIED COMPLETE. Direct-unit database reads use bounded count/page queries, deterministic ordering, strict typed evidence mapping, 100-record nested NC caps with truthful partial metadata, and consistent opaque cross-references. At that checkpoint no controller route was registered.
  - **4H-3 — Controller & HTTP Exposure:** VERIFIED COMPLETE. Three bounded authenticated GET endpoints expose direct-unit process, typed quality, and NC aggregate evidence through the verified contracts. They preserve canonical trace/error semantics, opaque cross-references, safe integrity-failure responses, and passed database-backed HTTP E2E verification. All legitimate roles currently hold `traceability:view`; route metadata and 401 behavior were verified without fabricating a denied role, while the shared authorization suite continues to prove real 403 enforcement.
  - **4H-4 — Frontend Typed History Client & Runtime Validation:** VERIFIED COMPLETE. Adds bounded authenticated clients for all three history APIs, exact successful-response validation, strict typed quality evidence, NC nested-count invariants, opaque-reference validation, and safe public error-code preservation. Malformed successful responses fail rather than becoming empty evidence; at that checkpoint the clients were not yet integrated into Unit Detail.
  - **4H-5 — Process + Quality History UI:** VERIFIED COMPLETE. Unit Detail now shows independently loaded and paginated direct-unit manufacturing and inspection evidence. Process lifecycle remains neutral; Quality preserves explicit PASS/NG and numeric, Boolean, categorical, visual, and text evidence. All/PASS/NG filtering, truthful empty/error states, section-local retry, safe integrity failure, localization, RTL, responsive cards, genealogy independence, and the accepted Quick Search typography revisions passed automated and browser acceptance.
  - **4H-6 — Nonconformance History UI:** VERIFIED COMPLETE. Unit Detail now shows independently loaded, paginated, direct-unit NC evidence with current lifecycle filtering; separate abnormal-case, action, verification, and disposition disclosures; truthful partial metadata; opaque source references; related-unit navigation; and safe empty/error/Retry states. Manual acceptance passed the simple and escalated fixtures, direct-empty units, Genealogy independence, localization/RTL, keyboard-native disclosure behavior, and 375×812 responsiveness. A transient locale handoff preserves the exact disclosure combination across locale subtree remounts without persistent storage or focus hijacking.
  - **4H-7 — Integration Verification / Failure Isolation:** VERIFIED COMPLETE. Integration discovery found no production defect, so production code remained unchanged. Deterministic component tests prove section-local NC failure and Retry behavior, safe NC integrity-error presentation, and preservation of populated Process, Quality, and NC siblings when another history request fails. This test-only scope required no additional browser acceptance because the underlying browser behavior passed manual acceptance in 4H-5 and 4H-6; no destructive error injection was performed.
- **4I — Integration / Responsive / Accessibility:** VERIFIED COMPLETE. Integration review preserved the existing semantic, keyboard, focus, locale, RTL/bidi, and independently loaded evidence architecture. Traceability Search now keeps its filter form stacked through unsafe intermediate widths before activating the bounded four-column layout at `xl`; Overview renders process `COMPLETED` as neutral lifecycle evidence rather than green PASS/health evidence. Manual acceptance then found and verified the minimal Revision 1 correction that likewise delays Unit Detail Quick Search's horizontal composition, prose cap, and fixed form width until `xl`. English intermediate widths, Arabic RTL intermediate widths, and wide-desktop Quick Search passed targeted browser acceptance without clipping or horizontal overflow. Final broad browser, assistive-technology, and privacy acceptance remains 4J.
- **4J — Manual Acceptance & Final Reconciliation:** VERIFIED COMPLETE. Final browser acceptance passed the English integrated hero journey, genealogy scope/URL and Back/Forward restoration, Arabic RTL locale remount with exact disclosure-state preservation and related-unit navigation, responsive and keyboard-visible accessibility checks, and public-data/privacy sanity. Corrected as-of acceptance used the direct replacement root `MODULE-DEMO-ALPHA-RETEST-01`: Jakarta local `11/01/2026 17:00` serialized to `2026-01-11T10:00:00.000Z` and showed both cells plus `COMP-DEMO-OLD`, while `19:00` serialized to `12:00Z` and showed both cells plus `COMP-DEMO-NEW`. The pack directly owns only the module at depth one.
  - Investigation found a genuine absolute-time boundary defect: the installed PostgreSQL adapter emitted timezone-less Date parameters that the former `Asia/Jakarta` session interpreted seven hours earlier. A shared `PrismaPg` factory now establishes UTC for every project-owned runtime/seed connection. Database-side epoch coverage proves `2026-01-11T08:00:00Z` persists as epoch `1768118400` and remains correct through upsert/update.
  - The local deterministic development database was reconciled once through `npm run db:seed`, without reset or manual patching. All reference UTC timestamps, fixed parent/child/position identities, unique relationships, and nine integrity checks passed. The frontend local-wall-clock-to-qualified-ISO behavior and inclusive-install/exclusive-removal predicate remained unchanged.
  - Final backend/frontend regression, builds, type checks, lint, public portfolio/confidentiality review, source-of-truth reconciliation, and diff hygiene passed. Phase 4 is **VERIFIED COMPLETE**.

## Phase 5 — Quality Inspection System

**Status: NEXT / NOT STARTED**

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
