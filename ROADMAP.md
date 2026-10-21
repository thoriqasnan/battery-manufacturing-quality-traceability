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

**Status: VERIFIED COMPLETE**

- Inspection specifications
- Inspection entry
- Typed measurements
- PASS/NG history

### Phase 5A — Discovery & Scope

**Status: COMPLETE / REVIEWED**

- Inspected the verified Phase 4 architecture and repository-defined Phase 5 scope without modifying implementation or data.
- Classified the approved synthetic-data, reviewer-experience, date-range, and performance directions and proposed the user-approved Phase 5 decomposition below.

### Phase 5B — Quality Contracts & Persistence Boundary

**Status: VERIFIED COMPLETE**

#### Phase 5B-1 — Quality Architecture & Contract Design

**Status: VERIFIED COMPLETE**

- Defined the authoritative specification lifecycle, versioning, typed PASS/NG authority, inspection occurrence/persistence times, actor attribution, atomic write, attempt concurrency, idempotency, contextual validation, public errors, and performance sequencing in `docs/QUALITY_INSPECTION.md`.
- Confirmed the separation of duties: `ENGINEERING` will receive the new explicit `inspection-specification:manage` permission; `QUALITY` retains `inspection:write`; `ADMIN` receives no implicit bypass.
- No schema, migration, backend/frontend implementation, seed, dependency, generated artifact, or database state changed in this documentation-only subphase.

#### Phase 5B-2 — Persistence / Schema Implementation

**Status: VERIFIED COMPLETE**

- Added `DRAFT`, `PUBLISHED`, and `RETIRED` specification lifecycle persistence, backfilled the five reference versions to `PUBLISHED`, made `DRAFT` the future default, and removed specification `isActive` plus its indexes so lifecycle has one source of truth.
- Added nullable legacy-compatible `Inspection.inspectorUserId -> User.id` with restrictive deletion and no fake attribution; added contract-bounded `InspectionSubmission` persistence with scoped idempotency uniqueness, fixed SHA-256 fingerprint shape, one-to-one inspection linkage, successful response metadata, timestamps, and restrictive user/inspection foreign keys.
- Added `inspection-specification:manage` to the centralized permission vocabulary and only the `ENGINEERING` bundle. `QUALITY` retains `inspection:write`; `ADMIN` retains no domain bypass.
- Migration `20261006000000_phase_5b2_quality_persistence` applied without reset. Prisma reports eight migrations current and no schema drift. Two seed runs remained deterministic, all five specifications are published, all eight legacy inspections remain unattributed, all nine integrity checks pass, and the UTC fixture still maps `2026-01-11T08:00:00Z` to epoch `1768118400`.
- Verification passed 6 focused persistence tests, 10 authorization tests, 23 authentication tests, 7 user-persistence tests, 19 traceability tests, 15 detail/history tests, 5 dashboard tests, 62 E2E tests, 67 unit tests, TypeScript, type-aware lint, production build, and diff hygiene. This persistence-only subphase has no meaningful browser/manual gate.

#### Phase 5B-3 — Contract / Persistence Verification & Reconciliation

**Status: VERIFIED COMPLETE**

- Reviewed the complete accumulated Phase 5B-1/5B-2 diff against `docs/QUALITY_INSPECTION.md`, the applied migration, live PostgreSQL catalog, deterministic seed, permission matrix, public route inventory, focused persistence tests, and existing traceability/UTC architecture. No production defect required a source, schema, migration, seed, or test correction.
- Catalog evidence confirmed exactly `DRAFT`, `PUBLISHED`, and `RETIRED`; a `DRAFT` future default; no specification `isActive`; five published reference versions; nullable inspector attribution; restrictive inspector/submission foreign keys; six idempotency checks; scoped and one-inspection uniqueness; and retained specification-version and attempt-stream uniqueness.
- Two additional seed runs completed without duplicates and retained the documented count vector: 2 products, 4 processes, 2 routes/8 steps, 16 units, 13 genealogy relations, 14 executions, 5 specifications/4 options, 8 inspections/results, 2 NCs, 1 abnormal case, 5 actions, 2 verifications, and 3 dispositions. All legacy inspections remain unattributed.
- Final verification passed 6 focused persistence tests, 10 authorization tests, 23 authentication tests, 7 user-persistence tests, 19 traceability tests, 15 detail/history tests, 5 dashboard tests, 62 sequential E2E tests, 67 unit tests, Prisma format/validate/generate, migration status/no drift, TypeScript, type-aware lint, production build, all 9 integrity checks, UTC Prisma-session coverage, and epoch `1768118400` for `2026-01-11T08:00:00Z`.
- Public-data, secret, route-inventory, and scope review found no confidential content or credential. Phase 5B remains verified complete and its persistence boundary passes the completed Phase 5C regression.

### Phase 5C — Inspection Specification Services

**Status: VERIFIED COMPLETE**

#### Phase 5C-1 — Inspection Specification Service & API Contract Design

**Status: APPROVED / COMPLETE**

- Approved separate authorization surfaces: ENGINEERING management uses `inspection-specification:manage`; QUALITY published-only discovery uses `inspection:write`; no OR-permission guard, new permission, or implicit ADMIN bypass is introduced.
- Approved stable public `(code, version)` identity and code normalization (`trim -> uppercase -> [A-Z0-9_-]+`, 1–64 characters) without public UUIDs or a case-insensitive schema migration.
- Approved bounded management list/exact detail, bounded PUBLISHED-only discovery, version-1 DRAFT creation, full DRAFT `PUT` replacement, atomic categorical/visual option-set replacement, publication, retirement, and immutable-version copying into a new DRAFT.
- Approved exact-version mutation locking plus strong ETag/`If-Match` for replacement/publication/retirement, and a distinct transaction-scoped family advisory lock for concurrent next-version allocation. These locks are separate from future Phase 5D inspection locks.
- Approved no public DELETE, option ordering by code ascending, decimal-string API values, publication completeness checks, irreversible lifecycle transitions, and no inspection entry, frontend, NC automation, Phase 6 workflow, date ranges, or large generator in Phase 5C.
- Reconciled transport errors with the implemented global contract: `401 UNAUTHENTICATED` and `403 FORBIDDEN`; the earlier planned authentication/permission names are superseded without a cross-cutting guard migration.

#### Phase 5C-1R — Contract Documentation Reconciliation

**Status: COMPLETE**

- Recorded the approved service/API, authorization, lifecycle, validation, option, concurrency, normalization, error, and delivery contracts in `docs/QUALITY_INSPECTION.md` and this roadmap without adding production code, schema, migration, endpoint, test, UI, or database mutation.

#### Phase 5C-2 — Read & Discovery Services

**Status: VERIFIED COMPLETE**

- Implemented bounded ENGINEERING management listing/exact-version detail and separate bounded QUALITY PUBLISHED-only discovery with public `(code, version)` identity, shared normalization, typed configuration, decimal strings, public process/route-step identity, deterministic option/code/version ordering, safe errors, and no UUID exposure.
- Management list supports only the approved query/lifecycle/result-type/target-unit/process filters; discovery forcibly constrains lifecycle to `PUBLISHED`, returns every published version, omits lifecycle, and makes hidden DRAFT/RETIRED exact versions indistinguishable from unknown identities.
- Management detail emits a deterministic strong canonical ETag without adding `If-Match` mutation behavior. Bounded Prisma relation selects avoid N+1 reads and never load inspection history.
- Verification passed 40 focused unit/PostgreSQL/HTTP tests, 10 authorization, 23 authentication, 7 user-persistence, 12 quality-persistence, 19 traceability, 24 search, 15 detail/genealogy, 5 dashboard, 94 full unit tests, 69 sequential E2E tests, Prisma validation, TypeScript, type-aware lint, and production build. One traceability run transiently exceeded its existing five-second timeout; its isolated rerun passed 19/19.
- No separate manual acceptance is required because the complete read-only HTTP, RBAC, pagination, ETag, typed-shape, hidden-lifecycle, database, and privacy contracts are deterministically covered.

#### Phase 5C-3 — DRAFT Management & Lifecycle

**Status: VERIFIED COMPLETE**

- Implemented version-1 DRAFT creation, complete DRAFT `PUT`/option-set replacement, publication, retirement, exact-version ETag concurrency, lifecycle immutability, safe transactions/errors, ENGINEERING-only RBAC, and unchanged global CSRF/origin enforcement.
- Public process and optional composite route-step identities resolve server-side; strict discriminated validation covers all five result types, normalized codes/options, exact decimals, publication completeness, and safe public errors without UUID or persistence leakage.
- Transaction-scoped SHA-256-to-signed-bigint advisory locks serialize exact-version mutation. Initial same-code creation uses the future-compatible family namespace only to make version-1 creation deterministic; no new-version endpoint or allocation behavior exists.
- Verification passed 53 focused unit/PostgreSQL/HTTP tests, including real concurrent create and edit races; broader regression passed 15 quality-persistence, 23 authentication, 10 authorization, 7 user-persistence, 19 traceability, 24 search, 15 detail/genealogy, 5 dashboard, 102 full unit, and 71 sequential E2E tests, plus Prisma validation, TypeScript, type-aware lint, and production build.
- Automated PostgreSQL concurrency and HTTP security/lifecycle evidence fully cover acceptance; no separate manual gate is required.

#### Phase 5C-4 — New-Version Creation & Family Concurrency

**Status: VERIFIED COMPLETE**

- Implemented ENGINEERING-only `POST /inspection-specifications/:code/versions` with strict exact-source selection, PUBLISHED/RETIRED copying, DRAFT-source rejection, and server-controlled `max + 1` DRAFT allocation without filling gaps.
- Reused the family-scoped SHA-256-to-signed-bigint advisory lock shared with version-1 creation. Concurrent equivalent-case paths serialize and create distinct sequential versions; database uniqueness remains defense-in-depth.
- Scalar configuration is copied faithfully; categorical/visual options receive fresh exclusive ownership. Source lifecycle/configuration/options and existing inspection relationships remain unchanged, and the response includes a fresh strong ETag.
- Verification passed 60 focused tests, 19 quality-persistence, 23 authentication, 10 authorization, 7 user-persistence, 19 traceability, 24 search, 15 detail/genealogy, 5 dashboard, 104 full unit, and 72 sequential E2E tests, plus Prisma validation, TypeScript, type-aware lint, and production build.
- Automated PostgreSQL concurrency and HTTP security/history evidence fully cover acceptance; no separate manual gate is required.

#### Phase 5C-5 — Integration, API Acceptance & Reconciliation

**Status: VERIFIED COMPLETE**

- Completed the real-HTTP ENGINEERING workflow across create, read, ETag replacement, stale rejection, publication, immutable-source version copying, next-version modification/publication, older-version retirement, and independent exact-version reads.
- Completed QUALITY published-only discovery acceptance plus ENGINEERING/QUALITY/ADMIN/PRODUCTION separation, unauthenticated behavior, CSRF/origin enforcement, strong ETag rejection cases, lifecycle immutability, privacy, safe-error, route-inventory, and scope review.
- Reconfirmed real PostgreSQL concurrency for equivalent normalized creation, exact-version edits, edit/publish races, family allocation, and equivalent-case family paths. Reference counts remain `2/4/2/8/16/13/14/5/4/8/8/2/1/5/2/3`; integrity is valid at 9/9 and UTC epoch evidence remains `1768118400`.
- Final verification passed 61 focused Phase 5C tests, 19 Phase 5B persistence tests, 23 authentication, 10 authorization, 7 user-persistence, 19 traceability/UTC, 24 search, 15 detail/genealogy, 5 dashboard, 104 full unit, and 73 sequential E2E tests. Prisma format/validate/generate, eight-migration status, no drift, TypeScript, type-aware lint, production build, and diff checks passed.
- Phase 5C has no frontend; the automated cross-role HTTP and PostgreSQL acceptance evidence satisfies the gate without a browser or manual smoke.

### Phase 5D — Atomic Inspection Entry API

**Status: VERIFIED COMPLETE**

#### Phase 5D-1 — Atomic Inspection Entry API Contract Review

**Status: APPROVED / COMPLETE**

- Approved one future `POST /inspections` contract with normalized public unit/specification identities, optional public execution context, strict discriminated evidence, durable `Idempotency-Key`, server-authoritative outcomes, and atomic Inspection/Result/Submission persistence.
- Approved lock order is idempotency, exact-specification lifecycle/mutation, then inspection-attempt.

#### Phase 5D-2 — Inspection Request, Evaluation, Fingerprint & Lock Utilities

**Status: VERIFIED COMPLETE**

- Implemented pure strict request and Idempotency-Key parsing, shared public-code normalization, exact `DECIMAL(18,6)` canonicalization/comparison, Unicode-safe TEXT validation, timezone-qualified instant normalization, and deterministic five-type PASS/NG evaluation.
- Implemented versioned canonical SHA-256 request fingerprints plus deterministic attempt/idempotency advisory-lock inputs and signed-bigint keys. The approved global lock order is represented explicitly; no database lock is acquired.
- Verification passed 12 focused utility tests, 61 Phase 5C tests, 19 quality-persistence, 23 authentication, 10 authorization, and 116 backend unit tests, plus TypeScript, type-aware lint, and production build.
- Added no controller, production persistence, transaction orchestration, schema/migration, frontend, NC behavior, generator, date range, analytics, or Phase 6 work.

#### Phase 5D-3 — Atomic Inspection Persistence & Concurrency

**Status: VERIFIED COMPLETE**

- Implemented one transactional inspection-entry service consuming the authenticated actor, validated key, and parsed request. It acquires idempotency, exact-specification, and attempt locks in the approved order, validates PostgreSQL transaction time and context, and persists Inspection, exactly one typed Result, and Submission atomically.
- Durable matching replay reconstructs the original public-safe logical response without another attempt; differing same-key fingerprints return a safe conflict. Server outcome evaluation, inspector attribution, optional execution context, max-plus-one attempts, and PUBLISHED lifecycle coordination reuse verified Phase 5 utilities.
- Real PostgreSQL tests cover all five result types, PASS/NG, exact decimals, attribution, execution/context/lifecycle failures, transaction-time limits, replay/conflict, identical and different-key concurrency, gap allocation, retirement races, rollback/retry, exactly-one-result behavior, and absence of automatic NC creation.
- Verification passed 20 focused tests, 27 quality-persistence tests, 61 Phase 5C tests, 23 authentication, 10 authorization, 7 user-persistence, 19 traceability/UTC, 24 search, 15 detail/genealogy, 5 dashboard, 116 backend unit, and 73 existing E2E tests, plus Prisma validation, TypeScript, type-aware lint, and production build.
- Added no HTTP endpoint, schema/migration, frontend, generator, date range, analytics, Phase 5E, or Phase 6 behavior.

#### Phase 5D-4 — Inspection HTTP Endpoint & Security Integration

**Status: VERIFIED COMPLETE**

- Added the single `POST /inspections` adapter with `inspection:write`, server-session actor attribution, the verified request and `Idempotency-Key` parsers, existing global CSRF/origin enforcement, direct delegation to the Phase 5D-3 service, and safe public error translation.
- Real Nest HTTP/PostgreSQL acceptance covers the exact role matrix, CSRF/origin failures, all five strict evidence forms, PASS/NG authority, timestamp validation, replay/conflict and user-scoped keys, lifecycle/context failures, inspector attribution, quality-history visibility, UUID-free responses, and no automatic NC creation.
- Added no alternate mutation route, controller persistence logic, schema/migration, frontend, generator, date range, analytics, Phase 5E, or Phase 6 behavior.

#### Phase 5D-5 — Inspection Entry Integration, Acceptance & Reconciliation

**Status: VERIFIED COMPLETE**

- Reconciled the complete Phase 5D route, permission, lifecycle, concurrency, idempotency, history, privacy, and safe-error evidence without adding production behavior.
- Final verification passed 20 focused utility/service tests, 5 focused real-HTTP acceptance tests, 61 Phase 5C tests, 27 quality-persistence tests, 23 authentication, 10 authorization, 7 user-persistence, 19 traceability/UTC, 24 search, 15 detail/genealogy, 8 quality-history HTTP, 5 dashboard, 116 backend unit, and 78 sequential E2E tests.
- Prisma format/validate/generate, eight-migration status, no drift, TypeScript, type-aware lint, production build, the complete deterministic reference vector, UTC epoch `1768118400`, all nine integrity checks, and diff checking pass.
- Automated real HTTP plus PostgreSQL concurrency/readback evidence satisfies acceptance; no browser or manual smoke is required.

### Phase 5E — Inspection Entry Experience

**Status: VERIFIED COMPLETE**

#### Phase 5E-1 — Inspection Entry Experience Discovery & Contract Review

**Status: APPROVED / COMPLETE**

- Approved one progressive responsive QUALITY workspace: Unit, Specification, Evidence, Review, Result. Exact specification-version choice remains explicit, discovery results are matching published specifications rather than guaranteed unit-instance eligibility, optional execution selection reuses public process history, and VISUAL uses configured options rather than upload.
- Confirmed the existing App Router, permission-driven shell, in-memory CSRF/session architecture, `next-intl` fallback, traceability/history clients, and backend Phase 5C/5D contracts are the implementation boundaries.

#### Phase 5E-2 — Frontend Contract Foundation

**Status: VERIFIED COMPLETE**

- Added strict typed/runtime-validated clients for published specification discovery/detail and `POST /inspections`, preserving public identifiers, pagination, exact-version multiplicity, decimal strings, caller-owned `Idempotency-Key`, credentials, CSRF, safe public errors, and 401 session invalidation.
- Added a six-state submission foundation with a frozen logical request, same-key retry, semantic-change key rotation, pending duplicate/edit prevention, bounded versioned `sessionStorage` recovery for uncertain outcomes, one-way authenticated-account isolation, logout cleanup, and a separate transient locale draft handoff.
- Added complete English/Indonesian `InspectionEntry` messages with registered-locale English fallback, retained Arabic RTL, and integrated only a permission-gated minimal Inspections workspace foundation into the existing shell.
- Verification passed 16 focused contract/state/localization tests and the complete 166-test frontend suite, plus Next route type generation, TypeScript no-emit, ESLint, production build, and diff checking. No submission UI or Phase 5E-3 behavior was introduced.

#### Phase 5E-3 — Traceable Unit & Exact Specification Selection

**Status: VERIFIED COMPLETE**

- Replaced the foundation placeholder with one progressive QUALITY workspace for exact trace-code confirmation, public unit identity/history counts, unit-type-filtered published specification discovery, optional code/name/result/process filters, server pagination, explicit `(code, version)` selection, exact-version criteria, and optional process-history execution selection.
- Preserves coexisting published versions without automatic latest selection. Discovery is explicitly described as matching unit type rather than guaranteed instance eligibility; final context validation remains server-authoritative.
- Displays all five exact configuration types, inclusive numeric bounds, Boolean expectation, categorical/visual option acceptability, TEXT requirements, public process/route context, and filtered public execution attempts without calculating PASS/NG or exposing an inspection submission action.
- Request generations and abort signals prevent stale unit, discovery, detail, or execution responses from restoring superseded context. Changing unit clears specification, detail, execution, and future evidence boundaries without touching uncertain-submission recovery.
- Automated verification passes 41 focused inspection/client/shell/localization tests and the complete 178-test frontend suite, plus route type generation, TypeScript no-emit, ESLint, production build, and diff checking. Required real-browser desktop/mobile/keyboard/locale acceptance remains pending.
- Phase 5E-4 resolves the earlier locale-remount limitation with a one-use, memory-only, account-bound public draft handoff that revalidates the unit, exact specification, option ownership, and execution before restoring selection or evidence.

#### Phase 5E-4 — Five-Type Evidence Entry & Review

**Status: VERIFIED COMPLETE**

- Added specification-owned evidence drafts for all five result types. NUMERIC preserves exact decimal strings and validates the backend-compatible `DECIMAL(18,6)` boundary; BOOLEAN has an explicit unselected state; CATEGORICAL and VISUAL accept only exact-version configured option codes; TEXT requires trimmed nonblank evidence, at most 4,000 Unicode code points, and an explicit inspector PASS/NG input.
- Added an occurrence-time editor that validates local calendar input and serializes it to an explicit UTC ISO instant without imposing the server's authoritative transaction-time future limit. Added a non-submitting review that presents public unit/specification/execution context and entered evidence without predicting authoritative non-TEXT outcomes.
- Unit/specification changes clear dependent evidence and review; execution changes preserve evidence but invalidate review; evidence or time changes invalidate review. Uncertain-submission recovery remains independent and untouched.
- Locale changes use a transient one-use handoff bound to a one-way authenticated-account digest. Restoration re-fetches and runtime-validates public state before accepting compatible evidence and never stores credentials, CSRF material, UUIDs, or recovery data.
- Focused and full frontend automated verification, route generation, TypeScript, ESLint, production build, and diff checking passed. Real-browser five-type, timestamp/review, invalidation, locale, responsive, RTL, and keyboard/focus acceptance remains pending together with the 5E-3 browser gate.

#### Phase 5E-5 — Submission, Result & History Integration

**Status: VERIFIED COMPLETE**

- Connected only a valid reviewed draft to the existing runtime-validated `POST /inspections` client. The authenticated shell supplies the in-memory CSRF token; the client retains credentialed cookies and safe 401 invalidation. The UI never calculates an outcome.
- Finalization freezes the public request and creates one caller-owned idempotency key. A bounded, account-bound recovery record is written before transport. Duplicate submission is locked while pending; network interruption, timeout, or malformed success remains outcome-uncertain and exposes only explicit same-envelope/same-key retry or warned abandonment.
- Confirmed initial success and durable replay share the same authoritative result presentation and clear recovery. The result exposes only public unit/specification/process/execution identity, inspection attempt, timestamps, persisted evidence, and server-confirmed PASS/NG. TEXT distinguishes inspector input from confirmed outcome.
- Added existing-route quality-history navigation and an explicit Inspect Again transition that retains selected context, clears evidence/time/review, and guarantees a fresh logical idempotency key.
- Focused submission/recovery tests and the complete 201-test frontend suite pass, together with route type generation, TypeScript, ESLint, and production build. Fresh real HTTP/PostgreSQL verification is pending because the configured local PostgreSQL service was unavailable at `localhost:5432`; the already-verified Phase 5D backend was not changed.
- Per user decision, all 5E-3/5E-4/5E-5 manual browser acceptance is batched into Phase 5E-6.

#### Phase 5E-6 — Final Browser Acceptance & Reconciliation

**Status: VERIFIED COMPLETE**

##### Phase 5E-6A — Automated Integration Readiness & Final Pre-Acceptance Review

**Status: AUTOMATED INTEGRATION VERIFIED**

- The safety recheck found the established Homebrew PostgreSQL 17 cluster already live: the PID file matches the running postmaster, active child processes use the exact data directory, TCP listeners exist on both localhost families, and `/tmp/.s.PGSQL.5432` is active. The earlier in-sandbox `pg_isready` failure was caused by the managed environment denying local socket connections. No PID or database file was removed, and no start, reset, credential, configuration, migration, or data-recovery action was needed.
- An approved local-connect check confirms PostgreSQL 17.11, database `battery_quality_traceability_dev`, and role `battery_quality_app`. The prefix-isolated synthetic HTTP harness passed 5/5 real NestJS/PostgreSQL cases covering authentication/RBAC, origin/CSRF/idempotency input, five typed submissions and authoritative outcomes, replay/conflict and user scope, safe lifecycle/context errors, authenticated attribution, and quality-history readback.
- Recovery reconciliation fixed one approved-contract defect: `INSPECTION_WRITE_CONFLICT` now retains the frozen request/key for explicit same-key retry, and network, malformed-success, or unclassified server failures remain outcome-uncertain. Known transactional rejection codes, including `INSPECTION_PERSISTENCE_ERROR`, remain deterministic and clear the resolved recovery record.
- Focused inspection frontend verification passes 51/51 tests; the previously completed full frontend suite remains 203/203, with route type generation, TypeScript no-emit, ESLint, and the webpack production build passing. The default Turbopack build remains environment-limited by denied temporary port binding. All 5E manual browser acceptance remains intentionally deferred to Phase 5E-6.

##### Phase 5E-6B — Acceptance Data Readiness

**Status: AUTOMATED ACCEPTANCE DATA READY**

- The existing deterministic reference seed already supplies the complete browser matrix, so no fixture or application change was needed. `PACK-DEMO-ALPHA-RETEST` is the primary reusable PACK: it has public `DEMO_VERIFY` attempts 1/2 and `DEMO_RELEASE` attempt 1, allowing both null-execution and compatible-execution acceptance without confusing process attempts with inspection attempts.
- Five PUBLISHED exact versions are available: `DEMO_NUMERIC_LEVEL` v1 (`10`–`20` `DEMO_UNIT`), `DEMO_BOOLEAN_READY` v1 (expected true), `DEMO_CATEGORY_STATE` v1 (`READY`/`REVIEW`), `DEMO_VISUAL_STATE` v1 (`CLEAR`/`DEMO_MARK`), and `DEMO_TEXT_NOTE` v1 (nonblank text plus inspector PASS/NG). All target PACK and use the matching public verification or release process.
- The active fictional `accept_quality` account is present for browser acceptance; its password remains intentionally outside tracked files and documentation. Existing temporary HTTP-test accounts are prefix-isolated and cleaned after use.
- Real verification passed 61/61 inspection-specification tests, 8/8 history HTTP tests, 15/15 traceability-detail tests, and 19/19 traceability/integrity tests. Final counts remain the deterministic `2/4/2/8/16/13/14/5/4/8/8` reference vector, with zero InspectionSubmission rows and zero temporary users/specifications; no inspection was submitted during readiness verification.
- Phase 5E remains in progress. The consolidated ordinary and controlled-network browser acceptance matrix is ready but was not executed.
- Phase 5E-6 manual acceptance found a blocking CORS preflight defect before the inspection POST reached NestJS: the frontend's required `Idempotency-Key` was absent from the API request-header allowlist. The minimal transport fix adds that header and shares the production CORS options with a database-free, browser-realistic OPTIONS regression covering the exact frontend origin, credentials, POST, `Content-Type`, `X-CSRF-Token`, and `Idempotency-Key`. Focused CORS tests pass 5/5 and the pure inspection-entry contract tests pass 12/12; type-aware lint and the NestJS production build pass. The unresolved browser recovery record and database remain untouched. Phase 5E stays in progress pending API reload and resumed manual acceptance.
- Phase 5E-6 Test D3 manually confirms one `DEMO_VISUAL_STATE` v1 `CLEAR` submission returned the authoritative PASS result at inspection attempt 6 and that a rapid double-click produced only one observed attempt. Database-free D3 verification passes 12/12 backend contract tests, 43/43 focused frontend API/state/workspace tests, and the unchanged 203/203 full frontend suite; route type generation, TypeScript, ESLint, and the webpack production build pass. Existing isolated PostgreSQL and HTTP tests already cover durable same-key replay, different-payload conflict, and concurrent duplicate serialization, but were not rerun because the active manual-acceptance database must remain untouched. Controlled same-key lost-response/refresh recovery remains a manual acceptance gate, so neither Phase 5E-6 nor Phase 5E is complete.
- Phase 5E-6 Test D4 manually confirms that QUALITY sees and can open Inspection Entry, while PRODUCTION, ENGINEERING, and ADMIN neither see its navigation item nor obtain the workspace through the direct localized URL. The backend controller requires `inspection:write`; the centralized role matrix grants it only to QUALITY and has no ADMIN bypass. Current database-free verification passes 18/18 backend permission/inspection-contract tests and 47/47 shell/workspace tests. The existing real HTTP inspection suite already covers unauthenticated 401 and ENGINEERING/ADMIN/PRODUCTION 403 before persistence; it was not rerun because its fixtures write temporary rows to the active manual-acceptance database. Test D4 is accepted without changing application code or data, while all unrelated Phase 5E manual gates remain pending.
- Phase 5E-6 accessibility investigation records two implementation revisions without applying them. Revision 5 finds that Result type remains keyboard-focusable and uses the same two-pixel focus utility pattern as adjacent fields, but its blue ring is only 25% opacity; Safari's native select presentation can make that indicator insufficiently distinct. Revision 6 identifies an application focus-management defect: after each specification detail resolves, the workspace explicitly focuses the newly rendered criteria heading, moving focus out of the native radio group and causing the observed scroll; subsequent ArrowDown therefore cannot advance the group. Two characterization tests now protect the evidence and the focused workspace suite passes 30/30. The minimal future corrections are a stronger non-translucent select focus treatment and preservation of radio focus while criteria updates, followed by targeted Safari keyboard, scroll, responsive, and RTL retesting. Phase 5E-6 remains in progress.
- Phase 5E-6 Test D6.4 verifies the authentication-data boundary without touching the active acceptance database. The server stores only a digest of each opaque session token, rejects missing, invalid, expired, revoked, and inactive-user sessions, revokes the server row on logout, and clears the host-only `HttpOnly`, `SameSite=Lax`, `Path=/` cookie with matching production `Secure` scope. Unsafe inspection writes remain ordered behind authentication, exact-origin/session-bound CSRF validation, and the QUALITY-only `inspection:write` permission. Focused database-free verification passes 10/10 backend session/permission tests and 21/21 frontend authentication/inspection-client tests; a new cookie regression covers development `Secure=false` and production logout clearing. The existing isolated E2E evidence covers durable revocation and rejection before persistence, but was not rerun against the active manual-acceptance database. D6.1-D6.4 are accepted; Phase 5E-6 remains in progress with all unrelated manual gates and deferred revisions 1-6 preserved.
- Phase 5E-6 deferred UI Batch 1 implements Revisions 1 and 2 without changing backend or persistence contracts. Result Type now uses the same fixed 44px box model, typography, and vertical padding contract as the adjacent discovery controls. Inspection occurrence time now uses the established Genealogy-style segmented `DD/MM/YYYY, HH:mm` editor and synchronized bounded chooser instead of native `datetime-local`, while retaining local-wall-clock validation, explicit UTC serialization, locale-aware month names, keyboard focus/Escape behavior, responsive layout, and LTR-isolated technical editing within RTL pages. Clearing a segment invalidates the timestamp and blocks review; correcting or changing it restores the existing review/payload flow. Focused verification passes 38/38 and the full frontend suite passes 206/206; TypeScript, ESLint, and the webpack production build pass. Revisions 1 and 2 are implemented and automated-verified, but Safari desktop/mobile/RTL/keyboard acceptance remains pending; Revisions 3-6 remain unimplemented.
- Phase 5E-6 deferred UI Batch 2 implements Revision 3 only. A bounded versioned ordinary-draft record in `sessionStorage` preserves safe public trace input, confirmed context identity, discovery filters, exact specification, optional execution, typed evidence, occurrence time, and review state across top-level workspace unmount/remount. It is bound to the existing one-way authenticated-account digest, validated as untrusted input, and conservatively re-resolves unit, discovery, exact specification, option ownership, and execution context before restoring editable state. Logout/session invalidation and confirmed success clear the ordinary draft. Its key and lifecycle remain completely separate from the frozen uncertain-submission record; restoration neither generates an idempotency key nor submits, retries, clears, or rewrites recovery. Focused verification passes 58/58 and the full frontend suite passes 210/210; TypeScript, ESLint, and the webpack production build pass. Revision 3 is implemented and automated-verified but Safari navigation acceptance remains pending; Revisions 4-6 remain unimplemented.
- Phase 5E-6 deferred UI Batch 3 implements Revisions 4-6 only. Public trace codes now remain LTR-isolated in RTL layouts and include zero-width browser wrap opportunities after existing hyphens, preserving the exact identifier while preferring segment boundaries and retaining overflow protection. The Result Type native select keeps its Revision 1 dimensions and now uses an opaque two-pixel blue focus ring plus matching focus border. Exact-specification detail loading no longer transfers focus to the criteria heading, so the selected native radio retains focus while criteria update and no application-authored focus scroll occurs. Focused verification passes 51/51 and the complete frontend suite passes 211/211; route generation, TypeScript no-emit, ESLint, and the webpack production build pass. Revisions 4-6 are implemented and automated-verified, while Safari mobile RTL wrapping, select focus visibility, native radio Arrow-key navigation, and scroll behavior remain manual-acceptance pending. Phase 5E-6 and Phase 5E remain in progress.
- Phase 5E-6 final automated readiness records D7 and D8 as automated-ready only; no Safari PASS is claimed. Revisions 1-6 retain focused regression coverage, and the workflow suite covers optional process execution, Inspect Again with a fresh logical key, account-bound ordinary-draft restoration, logout/account isolation, and separate same-key uncertain-submission recovery. D8.4 now deterministically verifies the combined PACK discovery request `query=level`, `resultType=NUMERIC`, and `processCode=DEMO_VERIFY`, rendering exactly `DEMO_NUMERIC_LEVEL` v1 and removing the prior unrelated result. The affected workspace test passes 33/33; the freshly rerun database-free frontend suite passes 211/211, with TypeScript no-emit, ESLint, route generation, and the webpack production build passing. Consolidated Safari UI/interaction acceptance and the separate controlled lost-response/recovery session remain pending, so Phase 5E-6 and Phase 5E remain in progress.
- Safari Session A now user-confirms exact trace validation for `PACK-DEMO-ALPHA-RETEST`; the combined `level` + `NUMERIC` + `DEMO_VERIFY` discovery result; Revision 1 control height; Revision 5 visible keyboard focus; Revision 6 native radio Arrow-key navigation without the prior scroll jump; Revision 2 segmented occurrence-time editing; optional execution default plus distinct `DEMO_VERIFY` process attempts 1/2; and Revision 3 navigation-away/return draft restoration. The approximately 375px Arabic RTL observation confirms LTR identifier ordering, full visibility, and no visible overflow, but does not establish preferred hyphen-boundary wrapping unless an actual wrap is observed. Draft cross-account isolation also remains automated-only; the earlier D6 logout evidence verifies authentication/session protection, not a manual cross-account draft-restoration attempt.
- Safari Session B confirms a controlled successful `POST /inspections` response was withheld from the application after Network recorded HTTP 201, the UI entered unresolved recovery, refresh restored that recovery, explicit retry returned the authoritative `DEMO_TEXT_NOTE` v1 PASS result at inspection attempt 4, and a later refresh no longer restored recovery. The user subsequently confirmed through Quality History that duplicate prevention passed for the recovered attempt. This is recorded as user-reported manual PASS, not independent database verification. Together with isolated PostgreSQL idempotency coverage, it closes the lost-response/replay gate.
- The final evidence audit removes redundant manual retests. Revision 4 is accepted from deterministic exact-value/LTR/`<wbr>` coverage plus Safari confirmation of correct direction, full visibility, and no overflow at approximately 375px; an artificially narrower wrap is optional. Revision 3 account isolation/logout, selected-execution request propagation, and Inspect Again key rotation are deterministic security/state contracts already covered by focused tests, while Safari separately passed navigation restoration, logout protection, and execution selection. No further inspection submission is required for those items. The sole mandatory manual gap is Indonesian Inspection Entry presentation and locale handoff; it can be verified with an unsent draft. Phase 5E-6 and Phase 5E remain in progress only for that consolidated locale check.
- Final Safari acceptance user-confirms the Indonesian locale gate: a QUALITY user confirmed `PACK-DEMO-ALPHA-RETEST`, selected `DEMO_NUMERIC_LEVEL` v1, entered valid unsent evidence and occurrence time, switched from English to Indonesian, and observed the Indonesian presentation with the draft preserved and no inspection submission. This closes the last mandatory manual gap. All Phase 5E-1 through 5E-6 contract, automated integration, security, recovery/idempotency, responsive/RTL/accessibility, localization, and browser gates now have sufficient evidence. Phase 5E-6 and overall Phase 5E are VERIFIED COMPLETE. At that checkpoint Phase 5F was next; it is now also verified complete below.

### Phase 5F — Phase 5 Integration & History Reconciliation

**Status: VERIFIED COMPLETE**

#### Phase 5F-1A — Isolated PostgreSQL Test Database Provisioning

**Status: VERIFIED COMPLETE**

- Provisioned the separate local `battery_quality_traceability_test` database without cloning, resetting, reseeding, or otherwise changing `battery_quality_traceability_dev`. The existing `battery_quality_app` role owns both databases, while every integration command receives an explicit test-only `DATABASE_URL`.
- Added a reusable pre-test identity guard that queries `current_database()` and accepts only the exact isolated database name. It passed against the test database and safely rejected the development database before mutation.
- Applied the existing eight migrations and deterministic reference seed only to the isolated target. Prisma reports the schema current; the expected `2/4/2/8/16/13/14/5/4/8/8` reference vector, zero users, zero submission rows, and integrity `9/9` are present.
- Read-only comparison confirmed the active development acceptance database retained its existing inspection/submission counts and `accept_quality` account. No Phase 5F integration test was run in this provisioning subphase.

#### Phase 5F-1B — Cross-Layer History Integration Test

**Status: VERIFIED COMPLETE**

- Added one guarded real-HTTP/PostgreSQL scenario that authenticates QUALITY, rejects unauthenticated and PRODUCTION writes before persistence, submits PASS evidence with an exact process execution, replays it with the same key, and submits a separate NG attempt without execution context.
- The scenario proves atomic Inspection/Result/Submission persistence, authoritative outcomes, exact specification/version and occurrence-time preservation, sequential attempts, Quality History readback without duplicates, Process History reference consistency and immutability, no automatic Nonconformance, unchanged reference NC lifecycle history, and unchanged historical genealogy/replacement evidence.
- Database identity protection is inside the test process before Nest startup or fixture cleanup, in addition to the guarded package command. Direct execution therefore cannot mutate a database unless `current_database()` is exactly `battery_quality_traceability_test`.
- The focused scenario passes 1/1. Directly affected inspection persistence, inspection HTTP, history HTTP, and traceability/integrity suites pass 52/52, for 53/53 tests across seven files. Cleanup removes every test-prefixed unit, specification, inspection/result/submission, execution, session, and user; the deterministic reference vector and integrity 9/9 remain unchanged.
- TypeScript no-emit, type-aware lint, NestJS production build, and diff checking pass. No production code, schema, migration, public contract, feature, or manual browser behavior changed.

At the Phase 5F-1 checkpoint, overall Phase 5F-1 was **VERIFIED COMPLETE** and Phase 5F-2 was next. Phase 5F-2 and Phase 5F-3 are now also verified complete below.

#### Phase 5F-2 — History Presentation & Navigation Reconciliation

**Status: VERIFIED COMPLETE**

- Reconciled the existing Inspection Entry result handoff with the localized Unit Detail route and the stable `#quality-history-title` destination. The link carries the public trace code only; it adds no route, internal identifier, or alternate history path.
- Focused frontend evidence now explicitly covers exact historical specification code/version, inspection attempt, occurrence timestamp, numeric decimal text/unit, all five evidence discriminators, linked and null optional process-execution context, and the separation of an NG inspection from an empty Nonconformance history.
- Existing Phase 4H coverage continues to prove independent Process, Quality, and Nonconformance loading; bounded pagination and filters; loading/empty/error/Retry states; sibling failure isolation; retained NC action/retest/verification/disposition evidence; localization, RTL, keyboard, focus, and responsive presentation. Historical values remain rendered from their stored public response and are not re-evaluated against a newer specification.
- Focused inspection/history reconciliation passes 83/83 tests; the relevant Traceability regression passes 100/100; and the complete database-free frontend suite passes 213/213. Route generation, TypeScript no-emit, ESLint, the webpack production build, and diff checking pass.
- No production UI, API contract, route, database, or browser-visible behavior changed. Existing Phase 4H and Phase 5E Safari evidence therefore remains applicable and no additional manual acceptance is required.

#### Phase 5F-3 — Final Regression & Documentation Reconciliation

**Status: VERIFIED COMPLETE**

- Every database-mutating command used an explicit local `battery_quality_traceability_test` URL and passed the exact-name identity guard before its test runner. The development `.env` remained unchanged and was never used as a fallback.
- Phase 5-focused backend regression passes 114/114 tests. Authentication, authorization, CSRF/security, Traceability, genealogy, and history regression passes 113/113. The complete backend suite passes 118/118 and the sequential backend E2E suite passes 79/79.
- Prisma validation passes; all eight migrations are applied; schema-drift comparison reports no difference. Post-test cleanup returns the isolated database to zero users and submissions, eight inspections/results, five specifications, the deterministic reference fixture vector, and integrity 9/9.
- The complete database-free frontend suite passes 213/213. Backend and frontend TypeScript checks, type-aware Oxlint, ESLint, NestJS build, Next.js route generation, the webpack production build, and diff checking pass.
- No production code, public contract, schema, migration, database record, or browser-visible behavior changed during closure. Existing Phase 4H and Phase 5E Safari acceptance remains applicable; no additional manual acceptance is required.

Overall Phase 5F is **VERIFIED COMPLETE**. Phase 5G is also verified complete below. Overall Phase 5 remains **IN PROGRESS** for Phase 5H.

### Phase 5G — Public Synthetic Data & Reviewer Support

**Status: VERIFIED COMPLETE**

- Preserve the small deterministic reference seed.
- Add a separate configurable deterministic large synthetic generator capable of thousands of fictional packs and related genealogy/history evidence.
- Add `docs/SYNTHETIC_TEST_DATA.md` with curated known-good scenarios and an unobtrusive Traceability Search sample-code affordance.
- Generate at least a representative Medium profile before establishing measured performance targets or indexes.

#### Phase 5G-0 — Public Synthetic Data & Reviewer Support Discovery

**Status: COMPLETE / REVIEWED**

- Confirmed that Phase 5G must preserve the small reference seed while adding a separate thousands-capable deterministic generator, curated reviewer guidance, one unobtrusive Traceability Search sample-code affordance, and Medium-profile measurement before optimization.
- Confirmed that no generator, generated namespace, Medium profile, reviewer data guide, or sample-code affordance existed at discovery. Date ranges, analytics, anonymous access, new APIs, schema redesign, and speculative indexes remain outside this phase.

#### Phase 5G-1 — Generator Contract & Safety Foundation

**Status: VERIFIED COMPLETE**

- Added a versioned pure generator contract with strict `SMALL`, `MEDIUM`, and `LARGE` profiles, explicit lowercase deterministic seeds, unmistakable `SYN5G_*` namespaces, bounded pack/relationship overrides, and dry-run planning that performs no I/O.
- Fixed profile defaults at 100, 2,000, and 10,000 packs, with a hard custom maximum of 25,000 and documented bounded related volumes. The Medium profile satisfies the required thousands-of-packs baseline; Large remains bounded higher-volume evidence rather than an unbounded load command.
- SHA-256-derived resolved namespaces, UUID-shaped internal identities, public codes, timestamps, scenario selection, exact planned counts, and canonical plan fingerprints are stable across wall-clock and locale changes. Different seeds receive different resolved namespaces.
- Established exact identity/fingerprint ownership classification for create/reuse/conflict. Partial reruns may reuse only canonically matching rows; incompatible identities must stop without overwrite. Cleanup is explicitly unimplemented and future cleanup may use only verified exact plan identities, never reset/truncate or prefix-only deletion.
- Generator mutation safety accepts only an explicit `battery_quality_traceability_test` URL and passes that same URL to the established live identity guard. Missing, malformed, development, and unknown targets are rejected before verification; dry-run planning never connects.
- Focused generator tests pass 21/21 and the affected pure inspection/safety regression passes 33/33. TypeScript no-emit, type-aware Oxlint, NestJS production build, and diff checking pass. No database, Prisma schema, migration, reference fixture, production behavior, or Medium/Large dataset changed.
- Added `docs/SYNTHETIC_TEST_DATA.md` with the fictional-data boundary, configuration and deterministic ownership contracts, safety policy, curated existing trace scenarios, and remaining implementation gates.

Phase 5G-2 is next / not started. Overall Phase 5G and Phase 5 remain in progress.

#### Phase 5G-2A — Guarded Persistence & Ownership Foundation

**Status: VERIFIED COMPLETE**

- Added the minimal persisted subset: one deterministic generator-owned product model and bounded SMALL-profile PACK units only. No genealogy, process, inspection, NC, rework, retest, verification, disposition, Medium, or Large data is generated.
- Mutation functions require an explicit `battery_quality_traceability_test` URL, execute the established live identity guard before Prisma construction, use that same URL, and never fall back to development configuration.
- Resolved-namespace advisory locking and in-transaction preflight classify deterministic IDs, public codes, canonical fields, timestamps, and relationships before bounded creation. Exact reruns reuse without duplicates; compatible partial rows are reused; any incompatible identity refuses the whole transaction without overwrite.
- Explicit cleanup requires the exact plan fingerprint, complete exact ownership, no PACK dependants, no product route, and no extra product-owned pack. It deletes only regenerated exact IDs in dependency-safe 100-row batches and exposes no prefix, truncate, reset, or reseed operation.
- The isolated PostgreSQL suite passes 5/5, including a full 100-pack SMALL cycle. Cleanup restores zero generated products/units, preserves two reference products and 16 reference units, and retains integrity 9/9. Database-free generator contract and persistence-boundary tests pass 25/25; complete backend regression, TypeScript, type-aware lint, NestJS build, and diff hygiene pass.

Phase 5G-2B is next / not started. Overall Phase 5G and Phase 5 remain in progress.

#### Phase 5G-2B — Connected Genealogy Generation

**Status: VERIFIED COMPLETE**

- Extended the single guarded persistence path to deterministic MODULE, CELL, COMPONENT, MATERIAL, and active genealogy rows using only the existing `TraceableUnit` and `GenealogyRelation` models. Relationship direction is PACK→MODULE and MODULE→CELL/COMPONENT/MATERIAL.
- The SMALL defaults create exactly 100 packs, 100 modules, 400 cells, 100 components, 100 materials, and 700 relations. Every non-pack has one planned parent, positions are parent-local, all endpoints are plan-owned, and cycle detection reports none.
- Versioned ownership covers every exact product, unit, and relationship field. Bounded in-transaction preflight checks IDs, public trace codes, composite relationship identities, positions, intervals, and timestamps before writing units then edges. Exact reruns create nothing; compatible partial graphs recover missing rows; unit or edge conflicts refuse without partial commit.
- Explicit cleanup verifies the complete plan, exact expected parent/child counts, absence of downstream process/quality/NC/action dependencies, no product route or extra pack, and the plan fingerprint. It deletes exact edges before exact units and the product, with no prefix deletion or broad operation.
- Guarded isolated PostgreSQL tests pass 6/6, existing traceability passes 19/19, and detail/genealogy passes 15/15. The database returns to zero generated product/unit/relation rows, reference counts remain unchanged, and integrity passes 9/9. Database-free generator tests, full backend regression, TypeScript, type-aware lint, NestJS build, formatting, and diff hygiene pass.

Phase 5G-2C is next / not started. Overall Phase 5G and Phase 5 remain in progress.

#### Phase 5G-2C — Deterministic Process History Generation

**Status: VERIFIED COMPLETE**

- Added generator-owned PREPARE, ASSEMBLE, VERIFY, and RELEASE definitions, one product-bound version-1 route, and four ordered route steps. This avoids coupling generated products to or mutating the shared reference process configuration.
- The fixed SMALL acceptance seed deterministically yields 68 standard, 22 verify-retry, and 10 extended multi-attempt packs. It creates 442 COMPLETED PACK executions: 400 route-linked first attempts and 42 schema-supported nullable-route retry attempts, with stable methods, attempts, and timestamps. Process completion is not treated as Inspection PASS.
- Versioned ownership and bounded preflight cover exact configuration identities/fields plus execution ID and `(unit, process, attempt)` identity. Exact rerun creates nothing; partial configuration/execution recovery reuses exact rows; conflicting execution history refuses without overwrite or partial commit.
- Cleanup verifies complete ownership, expected execution counts per unit/step/definition, no Inspection/NC dependants, one exact route and four exact steps, then deletes executions, genealogy/units, steps, route, definitions, and product in foreign-key-safe order.
- Guarded isolated persistence tests pass 7/7, Process History HTTP contracts pass 8/8, traceability passes 19/19, and detail/genealogy passes 15/15. Cleanup restores zero generated process/graph rows, preserves all reference fixtures, and retains integrity 9/9. Database-free generator tests, full backend regression, TypeScript, type-aware lint, NestJS build, formatting, and diff hygiene pass.

Phase 5G-2C is **VERIFIED COMPLETE**.

#### Phase 5G-2D — Deterministic Inspection & Quality History Generation

- Added five separate generator-owned, PUBLISHED version-1 specifications on the owned VERIFY process: NUMERIC, BOOLEAN, CATEGORICAL, VISUAL, and TEXT. The exact plan also owns four categorical/visual options and a disabled, non-login QUALITY attribution actor; no shared `DEMO_*` configuration or account is reused.
- Inspection evidence is planned through the production parser, fingerprint, and evaluation utilities. Each aggregate atomically persists one immutable Inspection, one typed InspectionResult, and one InspectionSubmission. Attempts are unit/specification scoped, optional execution links use the generated VERIFY attempts, and later PASS retests never rewrite prior NG evidence.
- For the fixed 100-pack 2D acceptance seed, the exact output is five specifications, four options, 523 inspection/result/submission aggregates, 500 PASS and 23 NG. Type counts are 105 NUMERIC, 103 BOOLEAN, 106 CATEGORICAL, 104 VISUAL, and 105 TEXT; 273 inspections have process context and 250 intentionally have none. No Nonconformance is created.
- Exact ownership preflight covers specification identity/configuration, options, inspection attempt identity, typed results, submissions, timestamps, and canonical fingerprints. Reruns reuse every row, compatible missing aggregates recover, incompatible identities refuse before quality writes, and cleanup refuses unexpected sessions or downstream NC/action/verification dependencies.
- The guarded isolated PostgreSQL generator suite passes 11/11. Existing quality persistence, specification, inspection service/HTTP, and Traceability suites pass 132/132; the cross-layer history contract passes 1/1 and sequential HTTP E2E passes 79/79. Cleanup restores zero generated quality/process/genealogy rows, preserves the reference data, and retains deterministic integrity 9/9.

Phase 5G-2D is **VERIFIED COMPLETE**.

#### Phase 5G-2E — Deterministic Nonconformance & Rework Lifecycle Generation

- Added a generator-owned lifecycle layer using only the existing `OPEN`, `RESOLVED`, and `CLOSED` statuses; supported inspection/process sources; existing abnormal-case, action, verification, and disposition models; and existing public Nonconformance History contracts. Production inspection behavior remains unchanged and NG still does not automatically create NC.
- The fixed 100-pack acceptance seed yields 77 clean packs without NC, 14 NG/retest packs without NC, and nine separately created NC histories: three OPEN, three RESOLVED correction/retest cases, and three CLOSED escalated REWORK/retest cases.
- The exact plan creates five defect categories, nine NCs, three abnormal cases, 15 actions (three CORRECTION, three literal REWORK, six RETEST, three ESCALATION), six PASS-retest verifications, and nine dispositions (six CONTINUE, three RETURN_IQC). Original NG inspections remain immutable and every retest/verification references the separate PASS attempt.
- Exact ownership preflight covers every source, relationship, lifecycle field, timestamp, event, and public identity. Reruns create no duplicates, compatible missing lifecycles recover without rewriting retained history, conflicts refuse before lifecycle writes, and cleanup refuses unexpected dependent events before deleting exact rows in foreign-key order.
- The guarded generator suite passes 15/15, focused affected regressions pass 148/148, sequential HTTP E2E passes 79/79, and the complete backend unit suite passes 143/143. Cleanup restores zero generator-owned rows, preserves reference fixtures, and retains integrity 9/9.

Phase 5G-2E is **VERIFIED COMPLETE**.

#### Phase 5G-3A — MEDIUM Profile Readiness & Guarded Execution

**Status: VERIFIED COMPLETE**

- Enabled only the exact documented MEDIUM defaults: 2,000 PACKs, two MODULEs per pack, eight CELLs per module, two COMPONENTs per module, and one MATERIAL per module. Custom MEDIUM and LARGE persistence remain refused.
- Corrected the pure planner's materialized-count contract to exclude unsupported replacement units and include the configuration, actor, submission, and category rows actually persisted. The deterministic MEDIUM plan contains 139,671 non-aggregate rows, including 50,000 units, 48,000 genealogy relations, 8,827 executions, 10,622 inspection/result/submission aggregates, and 205 NC lifecycles.
- Preserved the live isolated-database guard, same-URL Prisma connection, advisory locking, canonical ownership/collision preflight, 100-row writes, and exact-fingerprint cleanup. Bounded 500-row ownership reads and MEDIUM transaction timeouts make preflight and cleanup possible without weakening ownership.
- Controlled execution in `battery_quality_traceability_test` matched every expected count. Generation completed in 34.89 seconds; exact rerun created no duplicates; a bounded lifecycle gap recovered exactly its missing records; a deliberate conflicting MEDIUM product identity was refused before unit writes; exact cleanup removed all 139,671 rows. Generator-owned residuals are zero and reference integrity remains 9/9.
- Generator contract tests pass 26/26, guarded persistence tests pass 15/15, and traceability/process/quality/NC regression passes 19/19. TypeScript, type-aware lint, NestJS build, formatting, and diff hygiene pass.

Phase 5G-3 remains **IN PROGRESS**. Phase 5G-3B measured query evidence is next / not started. Overall Phase 5G and Phase 5 remain in progress.

#### Phase 5G-3B — MEDIUM Profile Query Measurement

**Status: VERIFIED COMPLETE**

- Regenerated the exact 139,671-row MEDIUM plan once in the guarded isolated database and retained it for the complete read-only session. Measurements used one warm-up plus five service/Prisma repetitions on a documented Apple M1 Pro / 16 GB / PostgreSQL 17.11 environment.
- Verified Traceability Search, Unit Detail, forward/reverse bounded genealogy, paginated Process/Quality/NC History, specification discovery/detail, exact idempotency replay lookup, and dashboard aggregation. Median service times ranged from 1.178–18.610 ms except the independently measured replay lookup at 1.311 ms; pagination was stable and public responses exposed no UUID.
- Read-only `EXPLAIN (ANALYZE, BUFFERS)` evidence showed indexed unit, genealogy, per-unit history, and idempotency access. Dashboard inventory scanned 50,016 unit-type index entries in 11.344 ms; dashboard recent activity sequentially scanned 8,841 executions with a 26 KB top-N sort in 1.731 ms. No measurement justifies a speculative index or query change in this subphase.
- Exact cleanup removed all 139,671 generated rows in 19.65 seconds. Final generator-owned product, unit, specification, submission, and NC counts are zero; reference integrity remains 9/9.
- Generator and guarded persistence tests pass 41/41; Traceability Search, detail, and history regression passes 58/58; TypeScript, type-aware lint, NestJS build, formatting, and diff hygiene pass.

Phase 5G-3B is **VERIFIED COMPLETE**. Overall Phase 5G-3 is **VERIFIED COMPLETE**. Overall Phase 5G and Phase 5 remain in progress.

#### Phase 5G-4 — Reviewer Guidance & Sample-Code Affordance

**Status: VERIFIED COMPLETE**

- Added one compact, collapsed fictional-sample affordance to the existing authenticated Traceability Search. It offers the stable reference codes `PACK-DEMO-ALPHA-PASS`, `PACK-DEMO-ALPHA-RETEST`, and `PACK-DEMO-BETA-ESCALATED` with evidence-backed Clean PASS, NG/retest, and escalated NC/rework descriptions.
- Selecting a sample only fills the existing trace-code field. It does not search, navigate, mutate data, clear the unit-type/product-model filters, expose credentials/internal identifiers, or introduce a second workflow, route, API, or authentication mode.
- English and Indonesian reviewer copy is complete. Other registered locales retain the established English fallback; Arabic retains RTL layout while sample identifiers use exact LTR isolation and bounded hyphen-aware wrapping.
- Focused Traceability Search verification passes 20/20 and the complete database-free frontend suite passes 216/216. Next route generation, TypeScript no-emit, ESLint, the webpack production build, and diff hygiene pass.
- User-confirmed Safari acceptance passes the compact disclosure and all three curated scenarios; exact sample filling without automatic search/navigation; preservation of unit-type and product-model filters; Search and Unit Detail navigation including the escalated-NC story; and unchanged manual trace-code entry/search.
- English and Indonesian guidance, Arabic RTL with LTR-isolated identifiers, keyboard Tab/Enter operation with visible focus, and the responsive 375×812 layout pass. A supplied screenshot confirms the three sample cards stack vertically without visible overflow, and no blocking UI defect was reported.
- Added and validated `docs/LOCAL_DEVELOPMENT_AND_TESTING.md` plus concise README links. The guide records dependency and PostgreSQL readiness checks, safe ignored environment setup, explicit backend environment loading, frontend startup, health/login diagnostics, curated reviewer navigation, the accepted Safari checklist, and safe stop/restart procedures without publishing credentials.

Phase 5G-4 is **VERIFIED COMPLETE**. Overall Phase 5G and Phase 5 remain **IN PROGRESS**.

#### Phase 5G-5 — Final Phase 5G Reconciliation

**Status: VERIFIED COMPLETE**

- Reconciled the complete Phase 5G contract: deterministic SMALL/MEDIUM planning and persistence, disabled LARGE persistence, namespace/fingerprint ownership, collision refusal, idempotent rerun, partial recovery, exact dependency-aware cleanup, connected genealogy/process/quality/NC history, measured MEDIUM reads, reviewer samples, and local-development guidance.
- The explicit live guard confirmed `battery_quality_traceability_test` before every database-backed command. Guarded SMALL persistence passes 15/15 and cleans its exact plan; final read-only counts show zero `SYN5G_*` product, unit, specification, submission, and NC anchors. The unchanged reference evidence passes integrity 9/9. The development database was not targeted, and MEDIUM was not regenerated.
- Generator contracts pass 26/26; complete backend unit regression passes 144/144; Traceability/genealogy/history passes 19/19; focused inspection HTTP passes 5/5; sequential HTTP E2E passes 79/79; focused reviewer support passes 20/20; and the complete frontend suite passes 216/216.
- Backend and frontend TypeScript, type-aware Oxlint, ESLint, route generation, NestJS/Next.js production builds, Phase 5G generator formatting, and diff hygiene pass. A repository-wide backend Prettier audit still reports 53 pre-existing generated/unrelated files; no Phase 5G generator file is among them, and no unrelated formatting rewrite was made.
- Security review confirms no database-guard fallback, prefix-only cleanup, unrelated deletion, automatic production NC behavior, new unauthorized route/API, credential disclosure, public UUID exposure, RBAC weakening, schema change, or production-query modification from Phase 5G.
- Phase 5G-4 Safari acceptance remains applicable because Phase 5G-5 changes documentation only and introduces no browser-visible behavior.

Phase 5G-5 and overall Phase 5G are **VERIFIED COMPLETE**. Overall Phase 5 remains **IN PROGRESS**. Phase 5H-0 discovery/inventory is now complete and reviewed below.

### Phase 5H — Final Acceptance & Reconciliation

**Status: VERIFIED COMPLETE**

#### Phase 5H-0 — Final Acceptance Discovery & Inventory

**Status: COMPLETE / REVIEWED**

- Confirmed that Phase 5A discovery is complete/reviewed and Phase 5B through Phase 5G are verified complete. Phase 5E and Phase 5G-4 contain the required user-confirmed Safari evidence; backend-only, contract, database-safety, test-only, measurement, and documentation checkpoints require no separate browser gate.
- Consolidated evidence covers schema/migration and deterministic-reference integrity; specification lifecycle and concurrency; atomic five-type inspection entry, idempotency, security, recovery, and Quality History; integrated Process/Quality/NC/Traceability presentation; isolated cross-layer PostgreSQL verification; deterministic SMALL/MEDIUM generation, exact ownership/cleanup, measured reads; and accepted reviewer guidance.
- No mandatory manual acceptance remains unless Phase 5H introduces an unexpected browser-visible correction. Already accepted Safari flows must not be repeated without a demonstrated regression.
- Reviewed the accumulated dirty tree: 32 tracked files and 59 untracked files map to the documented Phase 5 quality schema/API, guarded database/test/generator infrastructure, inspection frontend/recovery, reviewer support, and source-of-truth documentation. No generated build output, log, cache, temporary file, secret, or unrelated feature change was identified. Staging remains empty and the committed baseline remains `73b0e14f4aa41949d68e2862984526643ed2bdd1`.
- Final closure still requires one Phase-wide guarded regression/security/diff audit and a final documentation/status reconciliation. Repository-wide backend Prettier currently reports historical generated/unrelated formatting debt; Phase 5G-owned files pass scoped formatting, so Phase 5H must report rather than silently rewrite unrelated files.
- Reconciled stale current-status statements that still described Phase 5 as contract-only or Phase 5H as not started. Historical checkpoint statements remain intact. Final security evidence still requires the Phase 5H-1 full-diff secret/privacy/RBAC/database-guard audit.

#### Phase 5H-1 — Final Phase 5 Regression & Safety Audit

**Status: VERIFIED COMPLETE**

- The minimum non-duplicative final regression passes: generator contracts 26/26, complete backend unit tests 144/144, guarded synthetic persistence/cleanup 15/15, sequential HTTP E2E 79/79, focused specification tests 61/61, focused quality persistence tests 27/27, and the complete database-free frontend suite 216/216.
- Every database-backed command received the same explicit isolated URL and passed the live exact-name guard for `battery_quality_traceability_test` before Prisma or test execution. Prisma validates, all eight migrations are current, schema drift is empty, final generator anchor counts are zero, and deterministic reference integrity passes 9/9. No migration, reset, truncate, reseed, MEDIUM regeneration, or development-database access occurred.
- Backend and frontend TypeScript, type-aware Oxlint, ESLint, route generation, NestJS/Next.js webpack production builds, expanded Phase 5-owned formatting, and `git diff --check` pass. The expanded formatting audit found and corrected style only in two Phase 5 quality test files; their guarded suites were rerun successfully, with no production or browser-visible behavior change.
- Full tracked/untracked security and scope review found no credential or environment-file inclusion, database-guard bypass, prefix-only/destructive generator cleanup, automatic production NC behavior, authentication/RBAC/session/CSRF/CORS weakening, idempotency/concurrency regression, public UUID/private-data exposure, unintended anonymous route, unsafe migration/schema drift, generated artifact, or unrelated feature. Documented connection strings contain placeholders only.
- The non-failing PostgreSQL client concurrent-query deprecation warning remains a future dependency/test-harness maintenance risk. Accepted Phase 5E and Phase 5G-4 Safari evidence remains sufficient because this checkpoint changed no browser-visible behavior.

#### Phase 5H-2 — Final Documentation, Change Inventory & Phase 5 Closure

**Status: VERIFIED COMPLETE**

- Reconciled all current Phase 5 status statements while preserving historical checkpoints and their exact evidence. Phase 5A is complete/reviewed; Phase 5B through Phase 5G and Phase 5H-1 are verified complete; all required Phase 5E and Phase 5G-4 Safari gates are accepted; and no manual gate remains.
- Final inventory covers 32 tracked modifications and 59 untracked additions across the quality schema/migration, backend specification/inspection services, security/CORS/idempotency, Inspection Entry frontend, deterministic generator, reviewer support, tests/fixtures, and documentation. There are no deletions, staged files, unexpected files, generated artifacts, committed environments, or out-of-scope features.
- Final documentation/link/exclusion/secret and diff-hygiene checks pass. Phase 5H-1 already established the exact isolated-database guard, zero generator anchors, reference integrity 9/9, current eight-migration schema with no drift, complete automated regression, and no unresolved security or database blocker.
- The final pre-commit review found one runtime-only cleanup confirmation gap: the quality and NC cleanup layers checked the exact plan fingerprint but relied on TypeScript for the literal `CLEANUP` operation. Both layers now enforce the operation and fingerprint before Prisma construction or database access, using the established `PLAN_CONFIRMATION_MISMATCH` refusal. Database-free regression coverage rejects wrong, missing, and malformed operations plus wrong fingerprints; 30/30 generator contract/unit tests and all 15/15 guarded persistence/cleanup integration tests pass against the exact isolated database.
- The accumulated tree is ready for a separately authorized full-Phase-5 staging and local commit checkpoint. No staging, commit, push, or remote modification occurred during Phase 5H.

Phase 5H-2, overall Phase 5H, and overall Phase 5 are **VERIFIED COMPLETE**. Phase 6 — Nonconformance & Rework remains the next documented roadmap phase and is **PLANNED / NOT STARTED**.

Approved From → To event filtering remains deferred from the Phase 5 critical path. Its preferred future contract uses timezone-qualified `from`/`to` instants and half-open `[from, to)` semantics. Genealogy Current/Historical/As-of semantics remain separate.

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
