# Quality Inspection Architecture and Contracts

This document is the source of truth for the Phase 5 Quality Inspection System architecture. Phase 5B defines the verified persistence boundary, and Phase 5C through Phase 5G are verified complete. Phase 5D provides the approved contract, pure utilities, transactional persistence/concurrency service, and secured HTTP adapter. Phase 5E provides the accepted QUALITY inspection-entry experience across selection, typed evidence/review, atomic submission, recovery/idempotency, authoritative result, and history navigation. Phase 5F verifies isolated cross-layer persistence/history integration and reconciles the accepted history presentation. Phase 5G provides the guarded deterministic SMALL/MEDIUM synthetic generator and accepted reviewer support; LARGE persistence remains deliberately disabled. Date-range behavior remains deferred.

## Scope and delivery sequence

Phase 5 is decomposed as follows:

- **5B — Quality Contracts & Persistence Boundary**
  - 5B-1 — Quality Architecture & Contract Design
  - 5B-2 — Persistence / Schema Implementation
  - 5B-3 — Contract / Persistence Verification & Reconciliation
- **5C — Inspection Specification Services**
  - 5C-1 — Inspection Specification Service & API Contract Design
  - 5C-1R — Contract Documentation Reconciliation
  - 5C-2 — Read & Discovery Services
  - 5C-3 — DRAFT Management & Lifecycle
  - 5C-4 — New-Version Creation & Family Concurrency
  - 5C-5 — Integration, API Acceptance & Reconciliation
- **5D — Atomic Inspection Entry API**
- **5E — Inspection Entry Experience**
  - 5E-1 — Discovery & Contract Review
  - 5E-2 — Frontend Contract Foundation
  - 5E-3 — Traceable Unit & Exact Specification Selection
  - 5E-4 — Five-Type Evidence Entry & Review
  - 5E-5 — Submission, Recovery & Result Integration
  - 5E-6 — Final Browser Acceptance & Reconciliation
- **5F — Phase 5 Integration & History Reconciliation**
- **5F-1A — Isolated PostgreSQL Test Database Provisioning** — verified complete
- **5F-1B — Cross-Layer History Integration Test** — verified complete; overall Phase 5F-1 verified complete
- **5F-2 — History Presentation & Navigation Reconciliation** — verified complete
- **5F-3 — Final Regression & Documentation Reconciliation** — verified complete; overall Phase 5F verified complete
- **5G — Public Synthetic Data & Reviewer Support**
- **5H — Final Acceptance & Reconciliation**

Phase 5G, Phase 5H-1 final regression/safety, Phase 5H-2 final reconciliation, and overall Phase 5 are verified complete; Phase 5H-0 discovery/inventory is complete and reviewed. Date-range filtering remains approved future work outside the completed Phase 5 critical path.

Phase 5F database-backed acceptance uses the separate local `battery_quality_traceability_test` database. A reusable guard connects through the command's explicit `DATABASE_URL`, executes `SELECT current_database()`, and refuses every name except that exact test target before any mutating suite may run. The development `.env` remains unchanged and is never a fallback. The isolated database owns the same eight-migration schema and deterministic reference seed, with the expected reference counts, zero users, zero inspection submissions, and integrity 9/9. Provisioning changed no application behavior and supplied the safety boundary used by Phase 5F-1B.

Phase 5F-1B integrates that same identity assertion into the actual test process before Nest startup, prefix cleanup, or fixture creation, while its package command independently runs the guard first under the same explicit `DATABASE_URL`. One isolated real-HTTP scenario submits a server-authoritative numeric PASS linked to public `DEMO_VERIFY` execution attempt 1, replays it with the same key, then appends a separate NG attempt without execution. It verifies exactly two atomic Inspection/Result/Submission sets, Quality History evidence and exact-version identity, the opaque execution reference shared with unchanged Process History, zero new Nonconformances, unchanged reference NC lifecycle and historical genealogy/replacement evidence, safe unauthenticated/non-QUALITY rejection, and UUID/inspector-free public bodies. Prefix-only cleanup restores the deterministic reference vector and integrity 9/9. The focused test passes 1/1 and directly affected suites pass 52/52; no product code or manual browser behavior changed. Overall Phase 5F-1 is verified complete, and Phase 5F-2 is next.

Phase 5F-2 reconciles the already accepted frontend history workspace without changing product behavior. The authoritative Inspection Entry result link resolves the public trace code through the localized Unit Detail route and targets the stable Quality History heading. Runtime and component evidence preserves stored exact specification code/version, inspection attempt, occurrence time, five typed evidence representations, authoritative outcome, and linked-or-null optional process execution; it also keeps NG inspection evidence distinct from a separate empty or populated Nonconformance lifecycle. Existing Process attempts and NC correction/rework/retest/verification/disposition references remain opaque and unchanged, with no automatic NC relationship implied. Focused reconciliation passes 83/83 tests, the relevant Traceability regression passes 100/100, and the full database-free frontend suite passes 213/213; route generation, TypeScript, ESLint, the webpack production build, and diff checking pass. Because this subphase changed tests and documentation only, the accepted Phase 4H/5E Safari evidence remains sufficient and no new manual acceptance is required. Phase 5F-2 is verified complete; at that checkpoint overall Phase 5F remained in progress for final closure.

Phase 5F-3 closes integration/history reconciliation through guarded regression rather than new behavior. Every mutating backend command explicitly targets `battery_quality_traceability_test` and passes the exact-name guard before the runner; the development environment is not a fallback. Phase 5-focused suites pass 114/114, authentication/security/Traceability/history suites pass 113/113, the complete backend suite passes 118/118, sequential E2E passes 79/79, and the database-free frontend suite passes 213/213. Prisma validates, all eight migrations are current, drift comparison is empty, cleanup restores zero users/submissions and the reference eight inspections/results plus five specifications, and integrity remains 9/9. Both TypeScript checks, both linters, NestJS and Next.js production builds, Next route generation, and diff checking pass. No browser-visible behavior changed, so no new Safari acceptance is required. Phase 5F-3 and overall Phase 5F are verified complete; at that checkpoint Phase 5 remained in progress for required Phase 5G and Phase 5H.

## Authorization and separation of duties

Default-deny server authorization remains authoritative. Phase 5 adds the permission `inspection-specification:manage`, assigned to `ENGINEERING`. The existing `inspection:write` permission remains assigned to `QUALITY`.

- `ENGINEERING` defines and manages inspection acceptance configuration.
- `QUALITY` records inspection evidence against published specification versions.
- `ADMIN` retains its explicitly mapped user-administration permissions and receives no implicit specification or inspection privilege.

Frontend visibility is only a usability aid. The API derives the actor and permissions from the authenticated session and never trusts a request-supplied role, permission, or actor identifier. Phase 5B-2 added the permission to the centralized vocabulary and explicit ENGINEERING bundle; Phase 5C-2 enforces the approved permissions on its read controllers.

Phase 5C uses separate authorization surfaces rather than an OR-permission guard. Management listing, detail, creation, replacement, publication, retirement, and new-version creation require `inspection-specification:manage`. Published-only inspection-entry discovery requires the existing `inspection:write`, allowing `QUALITY` to select eligible specifications without receiving management authority. No new permission is introduced, and `ADMIN` has no implicit bypass.

## Specification identity, lifecycle, and versioning

### Identity

A logical specification is identified by its stable, language-independent `code`. An immutable version is identified by `(code, version)`. The current schema already gives every version its own internal UUID, enforces uniqueness of `(code, version)`, and links each `Inspection` to the exact specification-version row through `specificationId`.

Versions are positive integers. Version allocation is scoped to the stable specification code. A changed acceptance definition is published as a new version; it never edits a previously published or retired version. Categorical and visual options belong to one exact version and cannot be reused as evidence for another version.

The minimum 5B-2 evolution does not require a separate logical-specification root table. It requires an explicit lifecycle state on each specification-version row and service/database protection consistent with the contracts below. Phase 5C treats the normalized stable code as immutable from creation. A new draft version for that logical specification must reuse the code and use a new positive version number.

All public specification-code lookup and mutation paths apply one canonicalization invariant: trim, uppercase, validate against `[A-Z0-9_-]+`, require 1–64 characters, then persist or query the normalized value. For example, `qc_voltage`, `Qc_Voltage`, and `QC_VOLTAGE` all identify `QC_VOLTAGE`. The existing `(code, version)` database uniqueness remains defense-in-depth over normalized persisted values; Phase 5C adds no case-insensitive schema migration. Tests must cover normalization and equivalent case variants.

### Lifecycle

Each specification version has one of these states:

```text
DRAFT -> PUBLISHED -> RETIRED
```

`DRAFT`:

- Editable, including its criteria and options.
- Not eligible for new inspection evidence.
- The persistence model can permit deletion only when no protected reference exists, but Phase 5C exposes no public `DELETE` endpoint. Deletion remains deferred unless a concrete product workflow later requires it.

`PUBLISHED`:

- Eligible for new inspection evidence.
- Immutable acceptance configuration, including result type, target unit type, process/route-step context, bounds, expected Boolean value, unit code, and categorical/visual options.
- Changes require a new positive version in `DRAFT`, followed by publication.

`RETIRED`:

- Not eligible for new inspection evidence.
- Remains readable for historical interpretation.
- Remains immutable and cannot be changed to reinterpret stored results.

The only normal transitions are `DRAFT -> PUBLISHED` and `PUBLISHED -> RETIRED`. A transition to the same state is rejected rather than treated as a mutation. `PUBLISHED -> DRAFT`, `RETIRED -> DRAFT`, and `RETIRED -> PUBLISHED` are illegal. A wrongly retired definition is replaced by a new version rather than reactivated. Publication must reject incomplete or type-invalid acceptance configuration: numeric requires at least one bound and ordered bounds when both exist; Boolean requires an expected value; categorical/visual requires at least one valid exact-version option; text carries no inferred acceptance criterion.

The current `isActive` Boolean could not express these semantics. Phase 5B-2 replaces it with `InspectionSpecificationLifecycle`, backfills all existing reference versions to `PUBLISHED`, removes the Boolean and its indexes, and makes `DRAFT` the default for future versions. Lifecycle is now the only persisted eligibility state.

## Inspection specification service and API contract

Phase 5C manages configuration only. It does not create inspections or results, allocate attempts, mutate quality history, create nonconformances, implement Phase 6 workflow, add date-range behavior, implement a frontend, or add the large synthetic generator.

### Public routes and authorization

Public identity is the normalized `(code, version)` pair; internal UUIDs are never route or response identifiers.

Management routes require `inspection-specification:manage`:

```text
GET  /inspection-specifications
GET  /inspection-specifications/:code/versions/:version
POST /inspection-specifications
PUT  /inspection-specifications/:code/versions/:version
POST /inspection-specifications/:code/versions/:version/publish
POST /inspection-specifications/:code/versions/:version/retire
POST /inspection-specifications/:code/versions
```

Published inspection-entry discovery routes require `inspection:write`:

```text
GET /inspection-specifications/discovery
GET /inspection-specifications/discovery/:code/versions/:version
```

Management listing returns all versions and supports only bounded, domain-justified filtering by search/code, lifecycle, result type, target unit type, and process, with one-based pagination defaulting to 25 and capped at 100. Discovery is independently bounded and can return only `PUBLISHED` versions. Both order deterministically by code ascending and version descending, with an unexposed internal tie-breaker where required. No-match and beyond-end pages are successful empty collections with accurate totals.

Exact-version detail exposes public-safe name/description, lifecycle, result type, target unit type, process context, optional public route-step context, timestamps, and a discriminated typed configuration. Numeric decimal bounds are strings rather than binary floating-point numbers. Route-step context uses its available public composite identity rather than a UUID. Categorical/visual options expose stable codes, optional descriptions, and acceptability; because the schema has no display-order field, Phase 5C returns them by option code ascending.

### DRAFT creation and replacement

Creating a new logical specification accepts a user-selected normalized technical code while the server assigns version 1 and lifecycle `DRAFT`. The server resolves public process and optional route-step identifiers, validates route-step/process consistency, controls internal IDs and timestamps, and creates the specification and any options atomically. A duplicate normalized family code is a conflict.

DRAFT editing uses full `PUT` replacement, not `PATCH`. The operation atomically replaces all mutable configuration and, for `CATEGORICAL` or `VISUAL`, the complete option set. Phase 5C exposes no individual option CRUD. Code, version, and lifecycle are not editable through replacement. `PUBLISHED` and `RETIRED` configuration and options remain immutable.

Configuration is discriminated by result type:

- `NUMERIC`: nullable decimal-string lower/upper bounds and optional unit code; publication requires at least one bound and ordered bounds when both exist.
- `BOOLEAN`: required expected Boolean; the existing database constraint also prevents an incomplete Boolean DRAFT.
- `CATEGORICAL` and `VISUAL`: no scalar criterion fields; DRAFT may have an empty option set, while publication requires at least one valid, uniquely coded, exact-version option.
- `TEXT`: no criterion or options; later inspection entry supplies explicit PASS/NG because prose does not define acceptance.

Unknown or cross-discriminator fields are rejected rather than ignored. Publication revalidates the full configuration, process, optional route step, unit type, code/version identity, and option ownership before the irreversible `DRAFT -> PUBLISHED` transition. Retirement is the irreversible `PUBLISHED -> RETIRED` transition, preserves all criteria, options, versions, and inspections, and has no reactivation path.

### Mutation concurrency and version allocation

DRAFT replacement, publication, and retirement require a strong configuration ETag through `If-Match`. Each operation uses one exact-version mutation lock, reads and validates current lifecycle/configuration under that lock, compares the current ETag, and commits atomically. Missing required `If-Match` returns `400 INVALID_REQUEST`; a stale or mismatched value returns `409 SPECIFICATION_WRITE_CONFLICT`. The ETag is an opaque digest of canonical public configuration and lifecycle and does not expose internal identity.

New-version creation accepts an exact `PUBLISHED` or `RETIRED` source under the same normalized family code; mutable DRAFT versions cannot be copy sources. It acquires a separate PostgreSQL transaction-scoped family lock derived from the namespace `inspection-specification-version:v1:<normalized-code>` using the documented deterministic SHA-256 to signed 64-bit lock-key strategy. Under that lock it allocates the next positive version, creates it as `DRAFT`, copies configuration, and creates fresh exclusively owned option rows. Existing versions, options, and inspections remain unchanged. `(code, version)` uniqueness remains defense-in-depth.

The specification-family and exact-version locks are separate from Phase 5D idempotency and inspection-attempt locks. Phase 5D submission shares the exact-version namespace for lifecycle coordination and follows the global order `idempotency -> exact-specification -> attempt`; it does not acquire the family lock. If another operation ever requires both specification locks, it acquires the family lock before the exact-version lock to avoid lock-order inversion.

### Phase 5C-2 read implementation evidence

Phase 5C-2 implements the two management GET routes and two separate published-discovery GET routes through one focused NestJS module. A shared parser normalizes every public specification-code lookup, validates positive versions and approved filters, and bounds one-based pages to a default of 25 and maximum of 100. Management listing returns every matching version; discovery forcibly adds `PUBLISHED` and omits lifecycle so DRAFT, RETIRED, and unknown exact identities share the same safe not-found response.

The Prisma repository performs one bounded relation-select query plus count for each list and one joined exact-version query for detail, avoiding per-row option/process/route lookups and inspection-history loading. Mapping returns public process and composite route-step identities, decimal strings, and exact discriminated configuration; option rows order by stable code. Impossible persisted typed shapes produce safe integrity errors rather than fabricated values. Management detail emits a deterministic strong SHA-256 ETag over canonical public mutable configuration/lifecycle content, excluding timestamps and internal identities; `If-Match` remains Phase 5C-3.

Focused parser/mapping/ETag, PostgreSQL integration, and HTTP tests verify all five result types, normalization, pagination/filtering/order, public identities, option ownership, published-only hiding, role separation, global auth errors, no UUID leakage, and read-only behavior. Phase 5C-2 adds no mutation route, schema/migration, seed change, frontend, generator, date range, analytics, or Phase 6 behavior.

### Phase 5C-3 mutation implementation evidence

Phase 5C-3 implements only `POST /inspection-specifications`, full DRAFT `PUT`, publication, and retirement. Creation always writes normalized version 1 as DRAFT and resolves public process/optional route-step identities in the same transaction as exclusively owned options. Strict discriminated parsers reject unknown and cross-type fields; numeric values honor `DECIMAL(18,6)`, Boolean DRAFTs require an expected value, and categorical/visual option codes normalize and remain unique.

Replacement, publication, and retirement acquire a transaction-scoped exact-version advisory lock derived from `inspection-specification-mutation:v1:<normalized-code>:<positive-version>`, re-read the exact version, compare its canonical strong ETag to one required strong `If-Match`, then mutate and re-read atomically. Initial creation uses `inspection-specification-version:v1:<normalized-code>` solely to serialize same-code version-1 creation; it performs no max-plus-one allocation or source copying. Both keys use SHA-256 first-64-bit signed PostgreSQL bigint vectors.

PostgreSQL concurrency and HTTP tests cover deterministic same-code conflicts, edit races, typed publication, stale preconditions, lifecycle immutability, ENGINEERING-only access, global CSRF/origin enforcement, rollback, safe errors, and public-data boundaries. Phase 5C-3 adds no schema/migration, new-version route, inspection entry, frontend, generator, date range, analytics, or Phase 6 behavior.

### Phase 5C-4 new-version implementation evidence

Phase 5C-4 implements only `POST /inspection-specifications/:code/versions`. The strict request contains one positive safe integer `sourceVersion`; clients cannot choose the target version or override copied configuration. Under the existing normalized family advisory lock, the transaction resolves that exact PUBLISHED or RETIRED source, reads the family maximum, guards PostgreSQL integer overflow, and creates `max + 1` as DRAFT without filling gaps.

The new row copies schema-backed scalar configuration and process/route-step relationships while receiving a new internal identity and timestamps. Categorical and visual options are recreated as fresh exclusively owned rows; numeric, Boolean, and text copies create no options. Source lifecycle, configuration, options, inspections, and historical relationships remain unchanged. The response reuses the public exact-version representation and canonical strong ETag.

Focused PostgreSQL tests exercise concurrent equivalent-case family allocation, gap behavior, PUBLISHED and RETIRED sources, DRAFT and unknown rejection, typed copy shapes, fresh option ownership, source immutability, and inspection-history preservation. HTTP tests cover authentication, role separation, CSRF/origin, normalized paths, strict input, safe errors, ETag, and UUID-free responses. Phase 5C-4 adds no arbitrary allocation, automatic publication/retirement, delete, inspection entry, frontend, generator, date range, analytics, or Phase 6 behavior.

### Phase 5C-5 integration and acceptance evidence

The final real-HTTP workflow proves ENGINEERING creation, management reads, strong-ETag replacement and stale rejection, publication, next-version copying, independent next-version editing/publication, retirement, immutable exact-version history, and continued management readability. QUALITY remains unable to manage specifications while receiving the complete public configuration for PUBLISHED versions; DRAFT and RETIRED discovery identities share the same public not-found response. ADMIN and PRODUCTION receive no implicit access.

Final reconciliation confirms exactly seven specification-management routes and two discovery routes, with no DELETE, PATCH, or UUID route. Real PostgreSQL tests cover all approved exact-version and family concurrency cases. The Phase 5B reference vector, restrictive history, UTC behavior, integrity 9/9, privacy, safe-error, five-type, public-reference, migration, no-drift, and full backend regressions pass. No separate manual or browser gate is required. Phase 5C is verified complete; Phase 5D subsequently adds its separate single inspection-entry route and is also verified complete.

## Typed evidence and outcome authority

Every accepted inspection creates exactly one result matching the published specification's result type.

| Result type | Required evidence | PASS/NG authority | Client `outcome` field |
| --- | --- | --- | --- |
| `NUMERIC` | Decimal value | Server compares the value with the exact version's inclusive configured lower/upper bounds. A missing bound is open-ended. | Rejected if present. |
| `BOOLEAN` | Boolean value | Server compares the value with the exact version's configured expected Boolean. | Rejected if present. |
| `CATEGORICAL` | Selected option from the exact version | Server uses that option's stored `isAcceptable`. | Rejected if present. |
| `VISUAL` | Selected option from the exact version | Server uses that option's stored `isAcceptable`. | Rejected if present. |
| `TEXT` | Nonblank text after Unicode trim, maximum 4,000 Unicode code points | Inspector explicitly supplies `PASS` or `NG`; the server validates but does not infer an outcome from prose. | Required and must be `PASS` or `NG`. |

Numeric equality at a configured bound passes. Numeric input uses an exact decimal representation and must not be evaluated through binary floating-point. An unexpected client outcome for a server-computed type is an invalid request, even if it happens to match the computed value; rejecting it prevents ambiguous authority.

## Inspection time model

`inspectedAt` and `createdAt` have different meanings:

- `inspectedAt` is when the inspection occurred. The client supplies a timezone-qualified ISO 8601 instant containing `Z` or an explicit numeric offset. The API strictly validates its syntax and calendar value, normalizes it to an absolute instant, and persists it in `timestamptz`.
- `createdAt` is when the system accepted/persisted the record. It is controlled by the server/database, is never authoritative client input, and is stored as an absolute UTC instant.

The shared Prisma PostgreSQL adapter continues to establish a UTC session for every project-owned connection. Neither timestamp may depend on PostgreSQL session-local interpretation.

To tolerate ordinary client clock skew while rejecting clearly future evidence, `inspectedAt` may be at most five minutes later than the server's transaction-time reference. There is no generic past-age limit: legitimate delayed entry must remain possible. The server must not compare `inspectedAt` to `TraceableUnit.createdAt`, because that field is persistence metadata and is not a manufacturing-birth timestamp. Context-specific chronology may be validated only where existing evidence gives it an unambiguous meaning.

## Actor attribution and user lifecycle

Every new Phase 5 inspection must retain a required relationship conceptually equivalent to `inspectorUserId -> User.id`. The application derives it exclusively from the authenticated session inside the write operation. A request body cannot select or override the inspector.

Attribution records the user identity, not a snapshot of the user's current role. Later username, active-state, or role changes do not rewrite the historical relationship. User deactivation prevents future authenticated work but does not remove earlier attribution.

The current user lifecycle is deactivation through `isActive`; no user-deletion workflow exists. Sessions already reference users with restrictive deletion, and manufacturing evidence is intentionally retained. Phase 5B-2 adds nullable `inspectorUserId` with `ON DELETE RESTRICT`. `CASCADE` would destroy evidence and `SET NULL` would permit later deletion to erase known attribution.

The existing synthetic reference inspections predate users and must not be falsely attributed. The column remains nullable only for those legacy/reference rows, while every new Phase 5 write requires a non-null authenticated inspector in the application transaction. API history represents missing legacy attribution explicitly rather than inventing an actor. A later migration may make the column database-required only if every retained legacy row has a truthful synthetic system attribution established by an approved data policy.

## Atomic inspection submission

Phase 5D-2 implements only the pure boundary beneath this future submission: strict normalized request and Idempotency-Key parsers, exact decimal canonicalization/comparison, Unicode-safe TEXT validation, timezone-qualified instant normalization, deterministic five-type outcome evaluation, canonical SHA-256 request fingerprints, and versioned attempt/idempotency advisory-lock keys. Constants fix `inspection.submit`, operation version 1, response-contract version 1, and the approved lock order `idempotency -> exact-specification -> attempt`. No PostgreSQL lock, transaction, Inspection/Result/Submission write, replay, or HTTP endpoint is implemented at this checkpoint.

Phase 5D-3 implements the transactional service beneath the HTTP adapter. One PostgreSQL transaction acquires the three approved locks in order, resolves replay/conflict, coordinates PUBLISHED lifecycle with Phase 5C, validates public context and transaction time, allocates the next exact-version attempt, evaluates typed evidence, creates Inspection plus exactly one Result, persists the successful Submission, and reconstructs a UUID-free response. Matching retries replay durably; failed transactions leave no submission or consumed attempt. Real PostgreSQL concurrency covers identical/conflicting keys, independent-key attempt streams, retirement races, and rollback/retry. This service remains the sole production write path used by Phase 5D-4.

Phase 5D-4 exposes that service through exactly one production route, `POST /inspections`. The controller requires `inspection:write`, receives its actor only from the authenticated session, uses the verified strict body and `Idempotency-Key` parsers, relies on the global CSRF/origin guards, and delegates all business and persistence behavior to Phase 5D-3. Initial success and exact replay both return status 201 with the same UUID-free logical representation. Real HTTP tests cover the role matrix, transport security, all five evidence variants, server-authoritative outcomes, timestamp/context failures, user-scoped replay/conflict, attribution, quality-history readback, and the explicit no-automatic-NC boundary.

Phase 5D-5 final reconciliation verifies the single-route inventory, strict role and transport-security matrix, all five typed contracts, exact-specification lifecycle coordination, idempotency and attempt concurrency, rollback/retry, atomic Inspection/Result/Submission invariants, inspector attribution, UTC transaction-time handling, quality-history integration, privacy, and safe errors. The deterministic reference vector remains unchanged, all nine integrity checks pass, and the UTC reference instant remains epoch `1768118400`. Complete focused and backend regression, eight-migration/no-drift verification, TypeScript, type-aware lint, and production build pass. Overall Phase 5D is verified complete; Phase 5E is next and no Phase 5E behavior is implemented here.

## Inspection entry experience foundation

Phase 5E-1 approves one progressive responsive QUALITY workspace ordered Unit, Specification, Evidence, Review, Result. Specification selection is explicit because multiple PUBLISHED versions may coexist. Discovery identifies matching published specifications but does not replace authoritative submission-time compatibility checks. Optional execution uses the existing public process-history identity, and VISUAL evidence remains configured option selection rather than image upload.

Phase 5E-2 implements the frontend foundation only. Strict types and runtime validators cover discovery summaries/details, pagination, all five request evidence discriminators, and the UUID-free inspection response. The submission client preserves exact decimal strings, sends the caller-owned case-sensitive `Idempotency-Key`, in-memory CSRF token, credentialed cookie request, and no-store policy, and safely separates approved public errors, transport failure, and malformed success responses. No UI invokes submission yet.

The state foundation distinguishes draft, reviewing, submitting, outcome-uncertain, succeeded, and failed. A logical request is frozen when finalized; retry retains its key and semantic change creates a new logical submission. Uncertain outcomes use bounded versioned session storage containing only the public envelope, key, timestamp, schema version, and a one-way binding to the current authenticated account context. Invalid, expired, cross-account, successful, abandoned, logged-out, or session-invalidated recovery is rejected or cleared. Ordinary locale draft handoff is separate and transient in memory. English and Indonesian messages are complete; other registered locales retain English fallback and Arabic retains RTL. At the 5E-2 checkpoint the shell exposed only a permission-gated foundation placeholder and no selection, evidence, submission, or result interface.

Phase 5E-3 replaces that placeholder with the first functional QUALITY workspace. Exact public trace-code lookup confirms unit type, direct product model, and existing process/quality counts. Published discovery is filtered by the confirmed unit type and optionally by code/name, result type, and process code; server pagination and every exact published version remain visible. Selection is always an explicit `(code, version)` choice. The exact detail presents public process/route context and all five schema-backed criteria forms without computing an outcome.

Optional execution selection reads the confirmed unit's paginated process history and exposes only matching public process identity plus route code/version/step when the selected specification is route-specific. `ProcessExecution.attemptNumber` is labelled as a process attempt and remains separate from the future inspection attempt. No execution is the default. Unit change invalidates specification, criteria, execution, and downstream evidence context; request generations plus abort signals prevent superseded asynchronous responses from restoring stale state. The UI does not call `POST /inspections`, generate an idempotency key, or alter uncertain-submission recovery.

Automated component acceptance covers normalization, validation, unit errors, reset/races, discovery filters/pagination/empty state, coexisting versions, exact detail, five criteria types, execution filtering/pagination, Indonesian, RTL isolation, keyboard controls, role navigation, and absence of submission. Real-browser QUALITY/role, desktop/mobile, locale/RTL, and keyboard/focus acceptance remains required.

Phase 5E-4 adds typed evidence drafts and a non-submitting review. NUMERIC remains an exact string and is checked against the backend-compatible decimal grammar and `DECIMAL(18,6)` representation without JavaScript number conversion. BOOLEAN requires an explicit observation. CATEGORICAL and VISUAL are restricted to exact-version option codes. TEXT requires Unicode-trimmed nonblank content, at most 4,000 code points, and explicit PASS/NG inspector input. The occurrence editor validates local calendar input and serializes an explicit UTC ISO instant; PostgreSQL remains authoritative for the five-minute future rule. Review presents the selected public context and evidence without predicting non-TEXT outcome.

Evidence is tied to the confirmed unit and exact specification. Unit/specification changes clear dependent evidence and review, execution changes preserve evidence while invalidating review, and evidence/time changes invalidate review. Locale remount uses a one-use in-memory handoff bound to a one-way authenticated-account digest; restoration re-resolves public unit/specification/execution state and rejects incompatible typed evidence or option ownership. It is separate from and never overwrites uncertain-submission recovery. English and Indonesian evidence/review copy is complete, registered fallback locales remain English, and Arabic remains RTL. Automated tests pass; required browser acceptance for 5E-3 and 5E-4 remains pending.

Phase 5E-5 connects only the validated review to the existing secured `POST /inspections` client. It freezes the public envelope, creates one idempotency key per logical inspection, writes bounded account-isolated recovery before transport, prevents duplicate submission, and preserves identical envelope/key semantics for explicit retry after a network, timeout, malformed-success, or unclassified server uncertainty. A recognized `INSPECTION_WRITE_CONFLICT` retains the frozen envelope/key for explicit retry. Known deterministic public rejections—including the transaction-rollback `INSPECTION_PERSISTENCE_ERROR` contract—clear the resolved recovery record while preserving editable evidence. Confirmed initial success or replay clears recovery and displays only the runtime-validated authoritative public response; PASS/NG is never computed by the frontend.

The result view exposes public unit/specification/process/execution identity, attempt, timestamps, typed evidence, and server-confirmed outcome. TEXT labels inspector input separately. Existing traceability navigation opens the unit's quality-history section, while Inspect Again clears evidence/time/review and starts a fresh logical key without changing the selected public context. Frontend submission/recovery and complete regression pass. Phase 5E-6A subsequently reconfirmed the real HTTP/PostgreSQL boundary without changing the verified Phase 5D backend contract. Per user decision, all Phase 5E browser gates are deferred to 5E-6.

Phase 5E-6A established that the existing Homebrew PostgreSQL 17 cluster was already live: its PID file, postmaster/children, exact data-directory use, localhost listeners, and `/tmp/.s.PGSQL.5432` socket all agree. The earlier in-sandbox connectivity result was caused by denied local networking, so no PID or database file was removed. An approved local connection confirmed PostgreSQL 17.11, `battery_quality_traceability_dev`, and `battery_quality_app`. The synthetic prefix-isolated real HTTP suite passes 5/5, covering the complete security, five-type, replay/conflict, safe-error, attribution, and quality-history boundary. Focused frontend inspection tests pass 51/51 and the full frontend suite remains 203/203; route type generation, TypeScript, ESLint, and the webpack production build pass. The standard Turbopack build remains constrained by denied temporary port binding. Manual acceptance remains deferred.

Phase 5E-6B reuses the deterministic reference seed without adding or changing fixtures. The primary browser unit is `PACK-DEMO-ALPHA-RETEST`; it is a PACK with public `DEMO_VERIFY` process attempts 1 and 2 plus `DEMO_RELEASE` attempt 1. This supports an omitted execution and an explicitly compatible execution while keeping process attempt separate from inspection attempt. `PACK-DEMO-ALPHA-PASS` and `PACK-DEMO-BETA-ESCALATED` remain additional public history scenarios.

Phase 5E-6 manual acceptance exposed a transport-only defect: the frontend correctly sent the required `Idempotency-Key`, but the NestJS CORS request-header allowlist omitted it, so the browser rejected the otherwise successful OPTIONS preflight before sending `POST /inspections`. The allowlist now includes `Idempotency-Key`, and a database-free browser-realistic NestJS regression verifies the configured frontend origin, credentials, POST, `Content-Type`, `X-CSRF-Token`, and `Idempotency-Key`. Inspection business logic, idempotency semantics, recovery state, and acceptance data remain unchanged. Manual acceptance remains pending and must resume only after the running API has loaded the corrected CORS configuration.

Phase 5E-6 Test D3 manually confirms a normal VISUAL submission, the matching server-authoritative PASS response, inspection attempt 6, and one observed attempt after a rapid double-click. Current database-free verification passes 12/12 backend contract and 43/43 focused frontend tests: the finalized envelope is frozen, duplicate submission is suppressed, uncertain network or malformed-success outcomes retain the original envelope/key, refresh restores only the bound account's unresolved submission, and explicit retry clears recovery after the authoritative response. The existing isolated PostgreSQL service and HTTP suites cover one durable result on identical same-key replay, `IDEMPOTENCY_CONFLICT` for a changed fingerprint, and advisory-lock serialization of concurrent duplicates; they were not rerun against the active manual-acceptance database. Controlled browser same-key lost-response and refresh recovery remain pending.

Phase 5E-6 Test D4 manually confirms the permission-driven browser boundary: QUALITY can see and enter Inspection Entry; PRODUCTION, ENGINEERING, and ADMIN see neither its navigation item nor a usable workspace at the direct localized route. The production `POST /inspections` controller declares `inspection:write`, which the centralized backend matrix grants only to QUALITY; ADMIN has no implicit bypass. Current database-free verification passes 18/18 backend permission/inspection-contract tests and 47/47 frontend shell/workspace tests. The previously verified real HTTP suite establishes unauthenticated 401 and non-QUALITY 403 before controller persistence. It was not rerun against the active manual-acceptance database, and no inspection or authentication record changed during D4.

The Phase 5E-6 accessibility investigation confirms Revision 5 as a focus-visibility styling gap rather than a keyboard reachability failure: Result type is a native select with `outline-none` plus a two-pixel blue ring at 25% opacity, matching nearby field mechanics but providing weak Safari contrast. Revision 6 is application-caused rather than native radio behavior: successful detail loading explicitly moves focus from the selected radio to the programmatically focusable criteria heading, and the browser scroll follows that focus movement. The stable keyed radio inputs are not replaced by the criteria render; the explicit heading focus interrupts the native Arrow-key sequence. Characterization coverage passes 30/30. No production change is made at this checkpoint; future correction should strengthen the select's visible focus and leave focus in the specification radio group while exact criteria update, then pass targeted Safari keyboard, scroll, mobile, and Arabic RTL acceptance.

Phase 5E-6 Test D6.4 accepts the authentication-data protection checkpoint while leaving the overall browser gate open. Manual D6.1-D6.3 evidence confirms safe UI content, safe unknown-unit errors, logout, and protected-page redirection. Code and focused database-free tests confirm digest-only opaque sessions, eight-hour absolute expiry, inactive/revoked/expired rejection, server-side logout revocation, matching cookie clearing, in-memory-only CSRF state, frontend state/recovery cleanup, and authentication/origin/CSRF/permission ordering before `POST /inspections` persistence. The cookie is host-only, `HttpOnly`, `SameSite=Lax`, `Path=/`, non-`Secure` for local HTTP development, and `Secure` in production. Focused verification passes 10/10 backend session/permission tests and 21/21 frontend authentication/inspection-client tests. Existing prefix-isolated E2E coverage proves durable revocation and pre-persistence authorization rejection; it was not rerun against the active acceptance database. Deferred UI revisions 1-6 and all unrelated Phase 5E-6 manual gates remain pending.

Phase 5E-6 deferred UI Batch 1 implements Revisions 1 and 2 only. The Result Type discovery select now has the same explicit 44px box sizing, text metrics, and zero vertical padding used by the established picker controls, preserving its native select semantics, filters, responsive grid, and bidi behavior. Inspection occurrence time replaces native `datetime-local` with the established segmented `DD/MM/YYYY, HH:mm` interaction and synchronized year/month/day/time chooser. It retains the existing local calendar validation and `Date.toISOString()` conversion, accepts transient legacy draft values during restoration, keeps technical editing LTR inside RTL layouts, and does not change the request or backend future-time contract. Clearing a date/time segment invalidates the draft and blocks review until the picker value is corrected. Focused tests pass 38/38 and the complete frontend suite passes 206/206, with TypeScript, ESLint, and the webpack production build passing. Both revisions remain manual-Safari pending; Revisions 3-6 and the remaining Phase 5E-6 gates are unchanged.

Phase 5E-6 deferred UI Batch 2 implements Revision 3 without changing submission or backend contracts. Ordinary unsent workspace state now uses its own bounded, versioned `sessionStorage` record containing only public editable context and the existing one-way account binding. Restoration treats storage as untrusted, rejects malformed/cross-account shapes, and re-fetches authoritative unit, published discovery, exact specification, and process execution evidence before accepting specification-owned evidence or reconstructing review. A partial trace/filter draft remains editable and requires normal confirmation. Logout, session invalidation, and confirmed success clear this ordinary draft. The separate unresolved-submission record remains authoritative for its frozen envelope and idempotency key; draft persistence never reads, replaces, clears, retries, submits, or converts it. Focused tests pass 58/58 and the complete frontend suite passes 210/210, with TypeScript, ESLint, and the webpack production build passing. Revision 3 remains manual-Safari pending; Revisions 4-6 and all other Phase 5E-6 gates remain open.

Phase 5E-6 deferred UI Batch 3 implements Revisions 4-6 without changing inspection contracts, persistence, or submission state. Trace identifiers use LTR bidi isolation and preserve their exact text while `<wbr>` opportunities after existing hyphens prefer segment-boundary wrapping on narrow RTL layouts. Result Type retains its native select and fixed 44px sizing with an opaque blue focus border/ring. Exact-version selection no longer programmatically focuses the criteria heading after asynchronous detail resolution; focus remains on the selected radio while the exact criteria update. Focused tests pass 51/51 and the full frontend suite passes 211/211; route generation, TypeScript no-emit, ESLint, and the webpack production build pass. Required Safari verification remains pending for approximately 375px Arabic RTL wrapping, visible select focus, native radio Arrow-key traversal, and absence of criteria-driven scroll jumps. Phase 5E-6 and Phase 5E remain in progress.

The Phase 5E-6 final automated readiness check records D7 and D8 as automated-ready but still Safari-pending. Existing deterministic coverage confirms Revisions 1-6, optional execution selection, review invalidation without evidence loss, Inspect Again key rotation, account-bound draft persistence, logout/account isolation, and frozen same-key uncertain recovery after network or malformed-success outcomes. D8.4 is strengthened to assert the combined PACK discovery filters `level` + `NUMERIC` + `DEMO_VERIFY` and the expected sole visible result `DEMO_NUMERIC_LEVEL` v1, with the prior unrelated result absent. The affected workspace file passes 33/33 tests; a fresh database-free run passes all 211/211 frontend tests, TypeScript no-emit, ESLint, route generation, and the webpack production build. No backend contract or database evidence changed. The consolidated Safari interaction session and a separate controlled lost-response/recovery session remain required; neither Phase 5E-6 nor Phase 5E is complete.

Safari Session A supplies user-reported browser PASS evidence for exact trace validation, the combined D8.4 filter, the Result Type height and visible keyboard focus, specification-radio Arrow-key traversal without unwanted scroll, the segmented occurrence-time editor, optional no-execution/default behavior with distinguishable `DEMO_VERIFY` attempts 1/2, and navigation-away/return draft restoration. At approximately 375px, Arabic RTL preserved LTR ordering and full trace-code visibility without visible overflow; preferred hyphen-boundary wrapping remains only partially verified because the observation does not establish that wrapping actually occurred. Account-bound ordinary-draft isolation remains deterministic automated evidence rather than a manual account-switch observation. Earlier D6 evidence verifies logout and protected-page/session behavior, but not cross-account draft restoration.

Safari Session B exercised controlled lost-response recovery with `PACK-DEMO-ALPHA-RETEST` and `DEMO_TEXT_NOTE` v1. Network recorded the initial POST as HTTP 201 while the application displayed unresolved submission; refresh restored the frozen recovery; explicit retry displayed the authoritative PASS result at inspection attempt 4; and a later refresh returned to the initial form without the recovery panel. The user subsequently reported that the Quality History duplicate-prevention comparison passed. This is user-confirmed manual evidence rather than an independently queried database result; combined with the existing isolated PostgreSQL replay/concurrency suite, it closes the same-key lost-response gate.

The final Phase 5E evidence audit treats complementary evidence according to risk rather than requiring repeated UI actions. Revision 4's deterministic LTR/exact-value/hyphen-`<wbr>` test plus the required-width Safari direction/visibility/no-overflow observation are sufficient; forced wrapping below the acceptance viewport is optional. Account-bound draft rejection and logout clearing are deterministic storage/security behavior covered by focused tests and supported by D6 manual logout protection. Optional execution selection passed in Safari while frontend request and real HTTP service tests cover propagation/compatibility. Inspect Again key rotation is deterministic and directly tested. Repeating these through new inspection submissions is unnecessary. The only mandatory manual evidence gap is Indonesian Inspection Entry presentation with preservation of an unsent draft across the locale switch. Phase 5E-6 and Phase 5E remain in progress only for that non-submitting locale check.

Final Safari acceptance closes that last gap. The user confirmed that a QUALITY session at `/en/inspections` retained the confirmed `PACK-DEMO-ALPHA-RETEST` unit, exact `DEMO_NUMERIC_LEVEL` v1 selection, valid evidence, and occurrence time while switching to Indonesian, rendered the Indonesian presentation, and did not submit an inspection. This is user-confirmed manual PASS evidence. With the previously reconciled five-type, authoritative-result, history, RBAC/security, responsive/RTL, accessibility, draft, idempotency, controlled lost-response, duplicate-prevention, and recovery evidence, no mandatory Phase 5E acceptance gap remains. Phase 5E-6 and overall Phase 5E are VERIFIED COMPLETE. Phase 5F integration/history reconciliation is also VERIFIED COMPLETE; at that checkpoint Phase 5 remained in progress for Phase 5G and Phase 5H.

The exact PUBLISHED five-type matrix is: `DEMO_NUMERIC_LEVEL` v1 with inclusive decimal-string bounds 10–20 and unit `DEMO_UNIT`; `DEMO_BOOLEAN_READY` v1 with expected true; `DEMO_CATEGORY_STATE` v1 with options `READY` and `REVIEW`; `DEMO_VISUAL_STATE` v1 with textual options `CLEAR` and `DEMO_MARK`; and `DEMO_TEXT_NOTE` v1 with nonblank text up to 4,000 code points plus explicit inspector PASS/NG. Every specification targets PACK and uses `DEMO_VERIFY` or `DEMO_RELEASE`. The active fictional `accept_quality` account exists, but its password is deliberately neither seeded nor documented.

Automated readiness passes 61/61 inspection-specification tests, 8/8 history HTTP tests, 15/15 traceability-detail tests, and 19/19 traceability/integrity tests. The reference counts remain 2 products, 4 processes, 2 routes, 8 steps, 16 units, 13 genealogy relations, 14 executions, 5 specifications, 4 options, 8 inspections, and 8 results. Zero submissions and zero temporary test users/specifications remain; readiness created no inspection. Manual browser acceptance remains pending.

One application operation and one database transaction perform:

```text
validate request envelope and Idempotency-Key
-> resolve authenticated actor and permission
-> acquire idempotency serialization lock and resolve any replay
-> resolve traceable unit
-> resolve exact PUBLISHED specification version
-> validate unit/process/route/execution context
-> acquire attempt-stream advisory lock
-> allocate the next attempt
-> evaluate or validate typed evidence and outcome
-> create Inspection
-> create exactly one matching InspectionResult
-> create/complete the idempotency record
-> commit
```

Any failure rolls back the inspection, result, idempotency record, and attempt allocation. There is no partial inspection, orphan result, or consumed attempt. History is append-only: an NG attempt followed by a passing retest remains two rows. Phase 5 does not automatically create a `Nonconformance` from every NG.

## Attempt allocation and concurrency

The current database uniqueness constraint establishes the logical attempt stream as:

```text
traceable unit + exact specification version
```

In schema terms this is `(traceableUnitId, specificationId)`, with `attemptNumber` unique inside that stream. Process execution is context, not part of attempt identity; adding it would allow duplicate attempt 1 values for the same unit/specification history.

Before reading the current maximum and inserting the next attempt, the transaction acquires a PostgreSQL transaction-scoped advisory lock derived deterministically from the two internal UUIDs. The recommended strategy is a namespaced SHA-256 digest of a versioned canonical byte sequence such as `inspection-attempt:v1:<unit-uuid>:<specification-version-uuid>`, with the first 64 bits interpreted consistently as a signed PostgreSQL `bigint` lock key. This does not use JavaScript hashing. UUID canonicalization and byte order must be fixed and covered by test vectors.

A 64-bit advisory key has a theoretical collision risk, so the existing unique constraint remains defense-in-depth. A uniqueness conflict after locking is treated as a bounded write conflict rather than evidence that duplicate attempts are acceptable. The lock is transaction-scoped and releases automatically on commit or rollback. The operation acquires the idempotency lock before the attempt lock consistently to avoid lock-order inversions.

## Idempotency

Inspection submission requires the conventional `Idempotency-Key` request header.

### Key contract

- The key is opaque, case-sensitive ASCII, 16-128 characters, matching `[A-Za-z0-9._:-]+`.
- A UUID is recommended but not required.
- Scope is authenticated user plus inspection-submission operation plus key.
- Keys are never logged as credentials or exposed in unrelated responses.

### Persistence and fingerprint

Phase 5B-2 adds the dedicated `InspectionSubmission` persistence record with its internal identity, actor user ID, operation name/version, key, SHA-256 request fingerprint, linked inspection ID, response-contract version, original success status, and server timestamps. The scoped key and linked inspection are unique. Future submission logic creates it in the same transaction as the inspection and result.

The fingerprint is computed from a versioned canonical server representation after syntactic normalization and before mutable database-derived outcome evaluation. It includes the normalized trace code, exact specification code/version, optional public execution context, normalized `inspectedAt` instant, discriminated typed evidence, and the explicit outcome only for `TEXT`. It excludes authentication/session material and the idempotency key itself. Canonicalization rules and digest test vectors must be fixed before 5D.

### Replay and conflicts

- Same scoped key plus same fingerprint: return the original success status and semantically identical response without creating another inspection or attempt. The replay uses the linked stored inspection/result and the recorded response-contract version; it does not re-evaluate the outcome under newer configuration. A response header may identify a replay, but the public body remains the original resource representation.
- Same scoped key plus different fingerprint: return an idempotency conflict.
- Concurrent uses of one scoped key: serialize using a transaction-scoped advisory lock derived from a separate namespace plus actor, operation, and key; one transaction writes and the other replays or conflicts after observing the committed record.
- Failed/rolled-back transaction: no completed idempotency record remains, so a retry may execute normally.

Idempotency records are retained for at least the lifetime of their linked inspection. This provides durable duplicate prevention rather than a short retry window. Deleting an inspection remains outside the append-oriented Phase 5 contract. Response reconstruction failures are safe internal errors and must not create a second attempt.

## Minimum contextual consistency rules

The application must enforce the existing domain relationships without adding a generic rules engine:

1. Resolve the unit by normalized trace code; never accept a client internal UUID.
2. Resolve one exact specification by stable code and positive version.
3. Require that version to be `PUBLISHED` at submission time.
4. Require the unit's persisted type to equal the specification target unit type.
5. Use the specification's process definition as authoritative; do not accept a contradictory process identifier.
6. If the specification has a route step, that step must still reference the same process definition; publication validates this configuration.
7. Optional execution context is supplied publicly as process code plus positive execution attempt number within the selected unit, not as an internal UUID or the existing one-way opaque read reference. The resolved execution must belong to the same traceable unit and process definition.
8. If the specification is route-step-specific and an execution is supplied, that execution must carry the exact same route step; a null or different execution route step is incompatible. A specification without a route-step may accept a same-unit/same-process execution regardless of its route-step context.
9. Result discriminator and populated evidence field must exactly match the specification result type.
10. Categorical/visual options must belong to the exact specification-version row and matching result type.
11. Numeric, Boolean, categorical, and visual outcomes are server-computed; only text accepts an explicit outcome.
12. Attempt allocation follows the locked unit/exact-version stream.

Phase 5 does not infer product configuration through genealogy, enforce a universal route, create an NC automatically, or implement Phase 6 disposition rules.

## Public error contract

Errors use a stable public code and safe message. Validation details may identify public field names and stable reason codes, but never Prisma/SQL details, stack traces, internal UUIDs, advisory keys, or request fingerprints.

| HTTP | Public code | Meaning |
| --- | --- | --- |
| `400` | `INVALID_REQUEST` | Malformed fields, timestamp, version, Idempotency-Key, or unexpected outcome field. |
| `400` | `INVALID_TYPED_RESULT` | Evidence discriminator/value is invalid for the resolved specification. |
| `401` | `UNAUTHENTICATED` | No valid active authenticated session; this is the established global transport-auth contract. |
| `403` | `FORBIDDEN` | Actor lacks the declared permission; this is the established global transport-authorization contract. |
| `404` | `TRACE_UNIT_NOT_FOUND` | Well-formed trace code is unknown. |
| `404` | `INSPECTION_SPECIFICATION_NOT_FOUND` | Well-formed specification code/version is unknown. |
| `409` | `INSPECTION_SPECIFICATION_NOT_PUBLISHED` | The exact version exists but is draft or retired. |
| `409` | `INVALID_SPECIFICATION_LIFECYCLE_TRANSITION` | Requested lifecycle transition is illegal. |
| `409` | `INCOMPATIBLE_INSPECTION_CONTEXT` | Unit, process, route-step, execution, or option ownership conflicts. |
| `409` | `SPECIFICATION_CODE_CONFLICT` | A normalized specification family code already exists. |
| `409` | `SPECIFICATION_WRITE_CONFLICT` | A required specification ETag is stale or a bounded concurrent mutation could not be completed safely. |
| `409` | `IDEMPOTENCY_CONFLICT` | Same scoped key was used for a different canonical request. |
| `409` | `INSPECTION_WRITE_CONFLICT` | A bounded concurrent-write conflict remains after the service's safe retry policy. |
| `500` | `INSPECTION_PERSISTENCE_ERROR` | Unexpected persistence/integrity failure with no internal detail. |

An unavailable dependency may use `503` only when the application can reliably distinguish transient unavailability from an internal failure. Each implementing subphase owns safe controller translation and any bounded retry policy for its operations.

`UNAUTHENTICATED` and `FORBIDDEN` supersede the previously planned `AUTHENTICATION_REQUIRED` and `PERMISSION_DENIED` names. They are global transport-security errors, distinct from specification and inspection domain errors; Phase 5 does not rename the established authentication/RBAC contract.

## Phase 5B verification evidence

Phase 5B-1 through 5B-3 are verified complete. Migration `20261006000000_phase_5b2_quality_persistence` applied without reset and remains drift-free. Catalog inspection confirms exact lifecycle values/default/backfill, removal of specification `isActive`, positive version and code/version uniqueness, nullable restrictive inspector attribution, restrictive submission relationships, idempotency checks/scope, and retained attempt uniqueness.

Repeated deterministic seed execution retained all reference identifiers and the documented count vector, including five published specifications and eight honestly unattributed inspections with eight matching results. Focused persistence/RBAC tests, broader backend regression, all nine integrity checks, Prisma UTC-session verification, and epoch `1768118400` for `2026-01-11T08:00:00Z` passed. No Phase 5 controller, service, endpoint, UI, generator, date range, analytics, or Phase 6 behavior entered Phase 5B.

## Phase 5G and performance sequencing

Phase 5G preserves the small deterministic reference seed and adds a separate configurable deterministic generator capable of thousands of fictional packs with associated module/cell/component/material genealogy and representative process, quality, NG/NC, rework, and retest evidence. Generated namespaces do not collide with or replace reference fixtures.

Phase 5G-1 establishes the generator contract without persisting data. Strict Small/Medium/Large defaults plan 100/2,000/10,000 packs, custom plans remain capped at 25,000, and related unit volumes have explicit bounds. A lowercase explicit seed and safe non-`DEMO` `SYN5G_*` namespace feed stable SHA-256 namespace, ID, timestamp, scenario, count, and plan-fingerprint derivation. Pure dry-run planning is labelled as unpersisted and performs no database, file, clock, locale, or environment I/O. Future writes must pass the same explicit `battery_quality_traceability_test` URL through the Phase 5F live identity guard. Exact canonical identity/fingerprint comparison—not a prefix alone—governs create/reuse/conflict and future partial recovery; cleanup remains unimplemented. Focused tests pass 21/21 and affected pure regression passes 33/33, with TypeScript, type-aware lint, build, and diff checking passing. No reference fixture, schema, migration, or database row changed.

Phase 5G-2D materializes deterministic Quality History without changing inspection semantics. Five generator-owned PUBLISHED version-1 specifications cover NUMERIC, BOOLEAN, CATEGORICAL, VISUAL, and TEXT; the production request parser, canonical fingerprint, and evaluator produce every immutable outcome. The fixed 100-pack acceptance plan creates 523 atomic inspection/result/submission aggregates (500 PASS, 23 NG), preserves every NG when a separate attempt-2 PASS retest follows, supports both compatible VERIFY execution references and null context, and creates no Nonconformance. Exact ownership preflight, rerun reuse, compatible partial recovery, collision refusal, dependency-aware cleanup, public Quality History mapping, and reference integrity 9/9 are verified only against `battery_quality_traceability_test`. The guarded generator suite passes 11/11, directly affected Phase 5 contracts pass 132/132, cross-layer history passes 1/1, sequential HTTP E2E passes 79/79, generator unit tests pass 25/25, and the complete backend unit suite passes 143/143.

Phase 5G-2E adds deterministic NC history while preserving the rule that NG and NC are distinct. Of 23 NG/retest packs, only nine explicitly selected scenario packs receive NCs; three remain OPEN, three are RESOLVED after correction/retest/verification, and three are CLOSED after escalation, literal REWORK, separate PASS retest, verification, and supported dispositions. Original NG results are immutable, process completion is not interpreted as PASS, and no production workflow behavior changes. Exact lifecycle ownership, partial recovery, collision refusal, public Nonconformance History, dependency-safe cleanup, and integrity 9/9 are verified against the isolated test database. The guarded generator suite passes 15/15, focused affected suites pass 148/148, sequential HTTP E2E passes 79/79, and the complete backend unit suite passes 143/143.

`docs/SYNTHETIC_TEST_DATA.md` documents curated known-good identifiers and scenarios rather than dumping generated identifiers. The authenticated Traceability Search includes the accepted unobtrusive sample-code affordance for three stable fictional reference stories.

No latency target or speculative index is adopted in 5B. Phase 5G generated the exact representative MEDIUM profile, measured supported reads on the documented reference environment, and captured read-only `EXPLAIN (ANALYZE, BUFFERS)` evidence before cleanup. The observed indexed paths and bounded dashboard scans did not justify a production query, index, cache, or read-model change.

Phase 5G-5 final verification passes 26/26 generator contracts, 15/15 guarded persistence tests, 144/144 backend unit tests, 19/19 Traceability/history tests, 5/5 focused inspection HTTP tests, 79/79 sequential HTTP E2E tests, 20/20 reviewer-support tests, and 216/216 complete frontend tests. The live exact-name guard precedes every database-backed command; final generator anchor counts are zero and reference integrity remains 9/9. TypeScript, linters, route generation, production builds, scoped Phase 5G formatting, and diff hygiene pass. Phase 5G-4's user-confirmed Safari evidence remains valid because final reconciliation changes no browser behavior. Phase 5H-1 reverified the complete closure gates and Phase 5H-2 reconciled the final inventory and documentation; overall Phase 5 is verified complete.

## Deferred date-range contract

From/to filtering remains an approved future requirement, primarily for the analytics phase and potentially for event histories when measured evidence justifies it. The preferred API parameters are timezone-qualified absolute ISO `from` and `to`, with half-open event semantics:

```text
eventTime >= from AND eventTime < to
```

Genealogy remains a separate relationship question with Current, Historical evidence, and As-of modes. Event ranges must never replace or overload genealogy As-of semantics.
