# Synthetic Test Data and Generator Contract

All data described here is fictional portfolio simulation data. It is not copied from a manufacturer, customer, MES, specification, serial-number system, work instruction, or production record. Never add real identifiers, people, suppliers, thresholds, credentials, endpoints, or proprietary workflows.

## Data ownership

The small reference dataset remains owned exclusively by `apps/api/prisma/seed.mjs`. Its fixed `DEMO_*` configuration, 16 traceable units, and connected acceptance stories are the human-readable correctness baseline. The Phase 5G generator is separate and must never replace, rewrite, delete, or claim ownership of those rows.

Generated data uses a caller-supplied base namespace matching `SYN5G_[A-Z][A-Z0-9_]{2,23}`. Names containing `DEMO` are rejected. The resolved namespace appends the first eight uppercase hexadecimal characters of SHA-256 over the explicit seed, so different seeds remain isolated even when they share a base namespace. Public codes use that resolved namespace; internal IDs are deterministic UUID-shaped SHA-256 derivatives of contract version, resolved namespace, entity type, and ordinal.

Phase 5G-1 implements planning only. Phase 5G-2A adds a deliberately narrow persistence foundation: one deterministic generator-owned product model plus deterministic PACK units. It does not generate genealogy, process executions, inspections, nonconformances, actions, retests, verifications, or dispositions.

Phase 5G-2B extends that same guarded path to the base connected genealogy: PACK → MODULE and MODULE → CELL, COMPONENT, and MATERIAL. These are the existing schema relationships and directions; no new relationship type is introduced. All generated relationships are active installation evidence (`removedAt = null`). Replacement/removal history remains deferred with rework generation.

Phase 5G-2C adds generator-owned process configuration rather than coupling generated products to shared `DEMO_*` configuration. Each exact plan owns four definitions (`PREPARE`, `ASSEMBLE`, `VERIFY`, `RELEASE`), one version-1 route for its product, and four ordered steps using the existing MANUAL, HYBRID, AUTOMATED, and MANUAL methods. Shared reference definitions, routes, and steps are neither reused nor modified.

Phase 5G-2D adds five generator-owned PUBLISHED version-1 specifications on that owned VERIFY process. NUMERIC uses inclusive fictional bounds 10–20 and `SYN_UNIT`; BOOLEAN expects `true`; CATEGORICAL and VISUAL each own one acceptable and one unacceptable textual option; TEXT stores nonblank fictional evidence plus its explicit outcome. Planning calls the production inspection parser, request fingerprint, and server-authoritative evaluator rather than reproducing PASS/NG logic.

Phase 5G-2E adds separately created generator-owned NC lifecycles without changing inspection submission behavior. NC sources use the existing generated NG inspection and compatible first VERIFY execution for the same PACK. Existing statuses, action types, abnormal cases, verification links, and dispositions are used exactly; no schema concept or workflow state is added.

## Configuration contract

The version-1 planner accepts:

- `profile`: exactly `SMALL`, `MEDIUM`, or `LARGE`;
- `seed`: 8–64 lowercase ASCII letters, digits, period, underscore, or hyphen, beginning with a letter or digit;
- `namespace`: the safe `SYN5G_*` base described above;
- optional `packCount`: 1–25,000;
- optional `relatedVolume` overrides within the documented bounds;
- optional `dryRun` Boolean, defaulting to `true`.

Unknown fields, unsafe namespaces, malformed seeds, invalid profiles, non-integers, negative values, and excessive volumes are rejected rather than coerced.

| Profile | Packs | Modules / pack | Cells / module | Components / module | Materials / module | Rationale |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Small | 100 | 1 | 4 | 1 | 1 | Fast contract, repeatability, and integration checks. |
| Medium | 2,000 | 2 | 8 | 2 | 1 | Required representative thousands-of-packs measurement profile without making routine correctness tests depend on the largest volume. |
| Large | 10,000 | 2 | 10 | 3 | 2 | Bounded higher-volume verification after Medium behavior is understood. |

Custom values remain bounded to 25,000 packs, 1–4 modules per pack, 1–16 cells per module, 0–8 components per module, and 0–4 materials per module. These are explicit engineering safety limits, not manufacturing claims.

## Deterministic plan

`planSyntheticGeneration` is a pure function. It does not import Prisma, connect to PostgreSQL, read the current clock, modify files, or change environment variables. Its result is labelled `PLANNED_NOT_PERSISTED` and contains:

- normalized configuration and resolved namespace;
- planned pack and related-entity counts;
- estimated total records;
- deterministic clean-PASS, NG/retest, and NC/rework scenario counts;
- representative first/last public codes, first internal ID, and first timestamp;
- a versioned canonical plan fingerprint;
- an explicit statement that cleanup is not implemented.

Scenario assignment is a stable SHA-256 function of seed and pack ordinal, with a target mix of approximately 70% clean PASS, 20% NG/retest, and 10% NC/rework. Actual planned counts are returned rather than inferred from percentages. Synthetic time begins from a fixed 2026 UTC epoch plus a seed-derived bounded offset; wall-clock time and locale never affect it.

The connected-record formula reserves five typed inspections per pack, adds a separate retest inspection for non-clean scenarios, and includes the configuration, actor, submission, process, NC, action, verification, disposition, and genealogy rows actually materialized by the generator. It does not count unsupported replacement units. The exact total excludes the aggregate `traceableUnits` subtotal so unit rows are counted once.

## Rerun, collision, and partial recovery policy

An identical configuration produces the same resolved namespace, IDs, public codes, timestamps, scenario distribution, counts, and plan fingerprint.

Future persistence must classify each exact planned identity as:

- `CREATE` when no row owns the exact identity;
- `REUSE` only when internal identity, public identity, and canonical ownership fingerprint all match;
- `CONFLICT` for every incompatible existing row.

The canonical fingerprint may be recomputed from the full planned and persisted row; no schema column is required. Prefix resemblance alone is never proof of ownership. A future runner must preflight collisions before mutation and use bounded transactions. A rerun after a partial failure may reuse exact matching rows and create missing rows, but must stop on the first incompatible identity without overwriting it.

Phase 5G-2A cleanup is an explicit operation requiring the exact plan fingerprint. It regenerates every expected identity, verifies every persisted field through the canonical ownership fingerprint, refuses incomplete or incompatible plans, checks that PACK units have no dependent genealogy/process/quality/NC/action records, and checks that the product owns exactly the planned packs and no route. It then deletes exact IDs in foreign-key-safe order and batches of at most 100. It never uses reset, truncate, wildcard deletion, or a namespace-prefix delete.

Persistence and cleanup take a transaction-scoped advisory lock derived from the resolved generator namespace. This serializes compatible plans that share identities even when their bounded pack counts differ. Preflight classification and writes occur in the same transaction. A compatible partial run reuses exact matching records and creates only missing records; any ID, public-code, field, timestamp, relationship, or ownership mismatch aborts without overwrite.

The Phase 5G-2B plan fingerprint covers the base generator fingerprint plus every exact product, unit, and relationship field. Relationship ownership includes deterministic ID, parent, child, position, installation/removal interval, and timestamps. Preflight checks both the deterministic ID and the schema's `(parent, child, installedAt)` identity in batches of at most 100. Cleanup requires all planned units and edges, refuses unexpected parent/child counts or any process/quality/NC/action dependency, deletes exact edges first, then exact units, then the product.

Phase 5G-2C extends the fingerprint and preflight to every process definition, route, route step, and execution field. Executions are checked by deterministic ID and by the schema attempt identity `(unit, process, attempt)`. The namespace transaction creates configuration before units/executions and refuses any incompatible code, route version, step order/process pairing, attempt, status, method, context, or timestamp without partial commit.

Phase 5G-2D extends exact ownership to specifications, options, inspections, typed results, and submissions. Every inspection aggregate has one deterministic attempt, immutable evidence, an evaluated outcome, and a submission with the production operation/contract versions and canonical request fingerprint. A disabled generator-owned QUALITY actor supplies the required attribution without creating a browser-login credential or coupling cleanup to shared users. Preflight checks both deterministic IDs and schema identities before any quality write. Cleanup removes submissions, results, inspections, options, specifications, and the actor before the process/genealogy graph; it refuses sessions, NCs, action results, verifications, ambiguous ownership, or incomplete plans.

Phase 5G-2E extends the versioned fingerprint and exact preflight through defect categories, NC source links and lifecycle timestamps, abnormal cases, actions, resulting inspections, verifications, and dispositions. A conflict in any deterministic ID or public code refuses the lifecycle transaction. Cleanup verifies exact nested counts, refuses unexpected lifecycle events, and deletes dispositions, verifications, actions, abnormal cases, NCs, and categories before invoking the verified quality/process/genealogy cleanup path. It never selects ownership by prefix.

## Database safety

Dry-run planning requires no `DATABASE_URL` and must remain database-free.

Any future mutation entry point must receive an explicit connection string and call `assertSyntheticGeneratorMutationTarget` before Prisma construction or writes. The guard:

1. rejects a missing or malformed URL;
2. rejects the development database and every unknown database name before connecting;
3. accepts only `battery_quality_traceability_test`;
4. passes the same explicit URL to the established Phase 5F `SELECT current_database()` guard;
5. never falls back to the development `.env`.

Automated generator mutation tests must use the isolated database. No generator command may reset, truncate, reseed, clone, or broadly clean a database.

The mutation path constructs Prisma only after the explicit URL passes the guard and requires `dryRun=false`. Routine tests use `SMALL`, capped at 100 packs. Phase 5G-3A additionally permits only the exact documented `MEDIUM` defaults; custom MEDIUM and all LARGE persistence remain refused. Writes remain bounded to batches of at most 100, while ownership reads use bounded 500-row batches to keep exact preflight practical at MEDIUM scale. The focused isolated-database suite proves initial creation, zero-duplicate rerun, compatible partial recovery, incompatible public-identity refusal, cleanup confirmation and dependency refusal, full SMALL persistence, exact cleanup, unchanged reference counts, and integrity 9/9.

With the verified SMALL defaults, Phase 5G-2B persists exactly 100 PACKs, 100 MODULEs, 400 CELLs, 100 COMPONENTs, 100 MATERIALs, and 700 active genealogy relations: 800 units total. Every non-PACK unit has exactly one planned parent, every relationship endpoint belongs to the same resolved namespace, position codes are unique within their parent, and cycle detection returns no cycle. The isolated suite verifies exact rerun reuse, compatible partial recovery, unit/public-identity collision refusal, exact-relationship collision refusal without partial commit, dependency-safe cleanup, reference integrity 9/9, and zero generator rows after cleanup.

For the fixed SMALL acceptance seed, deterministic process buckets contain 68 standard packs, 22 verify-retry packs, and 10 extended multi-attempt packs. Every pack receives four ordered COMPLETED first attempts. Verify-retry packs receive a second VERIFY attempt; extended packs receive second ASSEMBLE and VERIFY attempts. This produces exactly 442 executions: 400 first attempts with their exact route step and 42 retry attempts using the schema-supported nullable route-step context. All have deterministic start/finish times and methods. `COMPLETED` is process lifecycle evidence and is not an Inspection PASS outcome.

For the fixed Phase 5G-2D SMALL acceptance seed, 77 packs have clean PASS histories and 23 have one preserved NG followed by a separate PASS retest of the same exact specification. The plan creates five specifications, four options, and 523 Inspection/InspectionResult/InspectionSubmission aggregates: 500 PASS and 23 NG. Evidence counts are 105 NUMERIC, 103 BOOLEAN, 106 CATEGORICAL, 104 VISUAL, and 105 TEXT. Exactly 273 inspections reference the compatible generated VERIFY execution; 250 retain the supported null execution context. All specifications remain version 1, attempts are scoped by unit and exact specification, and no NG creates a Nonconformance.

Of those 23 NG/retest histories, Phase 5G-2E deliberately leaves 14 without NC and creates NC for only the nine `NC_REWORK` scenario packs. The exact NC distribution is three OPEN source-only histories, three RESOLVED histories with CORRECTION → RETEST → verification → CONTINUE, and three CLOSED escalated histories with abnormal case, ESCALATION → literal REWORK → RETEST → verification, interim RETURN_IQC, and final CONTINUE. Counts are five defect categories, nine NCs, three abnormal cases, 15 actions, six verifications, and nine dispositions. Every RETEST and verification references the separate PASS attempt while the source NG remains unchanged.

## MEDIUM profile execution evidence

Phase 5G-3A verified the exact MEDIUM defaults with seed `phase5g3a-medium-seed-001` and base namespace `SYN5G_MEDIUM` in `battery_quality_traceability_test`. The resolved namespace was `SYN5G_MEDIUM-8AF75B58`; no bulk identifier list is published. The deterministic plan contained 1,378 clean-PASS packs, 417 NG/retest packs, and 205 NC/rework packs.

The materialized graph contained 2,000 PACKs, 4,000 MODULEs, 32,000 CELLs, 8,000 COMPONENTs, 4,000 MATERIALs, 48,000 genealogy relations, 8,827 process executions, five specifications, four options, and 10,622 inspection/result/submission aggregates. Inspection outcomes were 10,000 PASS and 622 NG; 5,622 inspections had execution context and 5,000 intentionally had none. Lifecycle output was five categories, 205 NCs, 68 abnormal cases, 340 actions, 136 verifications, and 204 dispositions. Including product/process/route/actor configuration, the exact non-aggregate persisted total was 139,671 rows.

Initial generation completed in 34.89 seconds with about 828 MiB peak RSS. An exact rerun created zero lifecycle rows and reused all 205 NCs in 16.62 seconds. A bounded missing-lifecycle simulation recreated exactly one NC, two actions, one verification, and one disposition in 11.19 seconds. A deliberate conflicting MEDIUM product identity was refused before any unit write and then removed by exact identity. Exact-fingerprint cleanup removed all 139,671 planned rows in dependency order; it took 1,088.02 seconds and peaked near 957 MiB RSS. Post-cleanup generator-owned counts were zero and reference integrity remained 9/9. These are readiness observations on the local reference environment, not performance targets or optimization conclusions.

## MEDIUM query measurement

Phase 5G-3B regenerated that exact plan once and retained it for the complete read-only measurement session. The reference environment was a MacBook Pro with Apple M1 Pro (8 cores), 16 GB RAM, macOS 26.6.2, Node.js 26.7.0, and PostgreSQL 17.11. Each application-path measurement used one warm-up followed by five recorded in-process service/Prisma calls; the table reports median and observed range in milliseconds. It excludes HTTP transport, authentication, and browser rendering. PostgreSQL plans were captured separately with `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` in a read-only transaction after warm-up, so their buffers were cache hits.

| Supported path | Synthetic scenario / page | Result | Service median (range) ms | Representative database execution ms |
| --- | --- | --- | ---: | ---: |
| Traceability Search | PACK prefix, page 1 × 25 | 25 of 99 | 6.493 (5.298–13.558) | 2.790 |
| Unit Detail | clean PACK | direct counts 2/4/5/0 | 18.610 (16.202–26.228) | 0.743 |
| Forward Genealogy | clean PACK, depth 3, limit 100 | 24 edges, depth 2 | 1.859 (1.698–2.500) | 0.458 |
| Reverse Genealogy | generated CELL, depth 3, limit 100 | 2 edges, depth 2 | 1.503 (1.308–6.987) | 0.120 |
| Process History | NG/retest PACK, page 1 × 2 | 2 of 5, 3 pages | 1.188 (1.142–1.379) | 0.116 |
| Quality History | NG/retest PACK, page 1 × 5 | 5 of 6, 2 pages | 1.510 (1.418–1.691) | 0.177 |
| Nonconformance History | CLOSED NC PACK, page 1 × 10 | 1 closed lifecycle | 2.767 (2.187–4.356) | 0.079 |
| Specification discovery | PACK / generated VERIFY, page 1 × 25 | 5 published v1 specifications | 1.344 (1.152–2.049) | 0.093 |
| Exact specification detail | generated NUMERIC v1 | exact typed configuration | 1.178 (1.120–1.538) | indexed identity lookup |
| Idempotency replay lookup | exact persisted submission scope | 201, attempt 1, PASS | 1.311 (1.169–2.604) | 0.062 |
| Dashboard overview | all records | 50,016 units / 10,630 inspections | 3.170 (2.789–3.360) | component plans below |

The measured application responses contained no raw UUID. Search pages 1 and 2 returned 25 rows each without overlap; Process History pages returned 2/2 of 5 without overlap; Quality History pages returned 5/1 of 6 without overlap. Forward and reverse directions, attempt order, retained NG plus later PASS, exact specification identity, closed NC lifecycle, and public opaque references matched the existing contracts.

Representative plans used the existing identity, unit-type, genealogy endpoint, per-unit history, result, NC, and idempotency indexes. Forward traversal returned 24 rows with 573 shared-buffer hits and a 30 KB in-memory quicksort; reverse traversal returned two rows with 69 hits and a 25 KB sort. History joins performed small sequential scans only on the generated configuration tables (at most ten specification or eight process-definition rows). Dashboard inventory read 50,016 `TraceableUnit_unitType_idx` entries by index-only scan in 11.344 ms. Dashboard recent activity scanned 8,841 executions and used a 26 KB top-N heapsort in 1.731 ms. These two dashboard plans are the only observed scale-wide scans worth carrying into future measurement; neither is evidence by itself for a schema or index change.

The 3B generation completed in 29.99 seconds. Exact-fingerprint cleanup removed the complete 139,671-row plan in 19.65 seconds, with about 1.03 GiB maximum RSS. Final generator-owned product, unit, specification, submission, and NC counts were zero; reference integrity remained 9/9. PostgreSQL's physical database file remained allocated after row deletion, which is expected and was not addressed with a destructive or maintenance operation.

Cleanup verifies exact expected execution counts per unit, route step, and definition; zero Inspection/NC dependants; exactly four owned steps; and exactly one owned route. It deletes executions before genealogy/units, then steps, route, definitions, and product. Any unexpected process or downstream dependent refuses cleanup.

## Curated reference scenarios

These existing reference codes remain the reviewer-friendly known-good examples:

| Trace code | Scenario |
| --- | --- |
| `PACK-DEMO-ALPHA-PASS` | Clean connected genealogy with completed process evidence and PASS numeric, Boolean, categorical, and text inspections. |
| `PACK-DEMO-ALPHA-RETEST` | Numeric NG retained beside a separate PASS retest, simple correction/retest/verification/continuation history, and historical `SENSOR-01` component replacement. |
| `PACK-DEMO-BETA-ESCALATED` | Visual NG followed by PASS, an abnormal case, escalation, component replacement, retest, verification, and retained dispositions. |
| `MODULE-DEMO-ALPHA-RETEST-01` | Module-level historical replacement view containing removed `COMP-DEMO-OLD` and active `COMP-DEMO-NEW`. |

The five published inspection configurations are `DEMO_NUMERIC_LEVEL`, `DEMO_BOOLEAN_READY`, `DEMO_CATEGORY_STATE`, `DEMO_VISUAL_STATE`, and `DEMO_TEXT_NOTE`. Passwords and reusable credentials are deliberately excluded.

### Reviewer exploration

The existing authenticated Traceability Search includes a compact **Try a fictional sample** disclosure. It presents only the three PACK scenarios above: clean PASS, retained NG with a later PASS retest, and escalated NC with rework/verification evidence. Selecting a sample fills the ordinary trace-code input; it does not run the search, navigate, change other filters, or mutate data. Review the selected code and any filters, submit the existing Search form, then open the matching Unit Detail to explore its genealogy and histories.

Authentication and the existing role-aware application shell remain required. No anonymous reviewer mode, reusable password, privileged bypass, new endpoint, or public database access is provided. The stable `DEMO_*` reference namespace is appropriate for reviewer walkthroughs. Temporary exact-owned `SYN5G_*` generator namespaces are intended for guarded test generation and measurement, not permanent sample links; the verified MEDIUM measurement dataset was exactly cleaned after measurement.

The generator profiles remain SMALL (100 packs), MEDIUM (2,000 packs), and LARGE (10,000 packs). Only the exact documented MEDIUM defaults have been persisted and measured; custom MEDIUM and all LARGE persistence remain refused. Measurements are local observations rather than performance targets. The sample affordance does not assert live fixture health, automatically choose a result, or replace manual trace-code entry.

## Phase 5G completion evidence

- Phase 5G-2D is verified: deterministic five-type inspection and Quality History generation sits on the proven process graph with exact ownership, partial recovery, collision refusal, and dependency-aware cleanup.
- Phase 5G-2E is verified: bounded NC, correction/REWORK, retest, verification, abnormal-case, and disposition histories now extend that graph without automatic NC behavior or new workflow semantics.
- Phase 5G-3A is verified: the representative MEDIUM profile was generated, rerun, partially recovered, and exactly cleaned in the isolated database without weakening ownership rules.
- Phase 5G-3B is verified: supported read paths and representative plans were measured against the retained MEDIUM session, pagination/correctness were checked, and exact cleanup restored zero generator rows with reference integrity 9/9. No target, index, cache, read-model, or query change was introduced.
- Phase 5G-4 is verified complete. Focused tests pass 20/20 and the complete database-free frontend suite passes 216/216. User-confirmed Safari acceptance passes all three samples, exact fill-only behavior, preserved filters, manual and sample Search/Unit Detail navigation, English/Indonesian guidance, Arabic RTL/LTR identifiers, keyboard/focus behavior, and the 375×812 responsive layout. Screenshot evidence shows the cards stacked vertically without visible overflow; no blocking UI defect was reported.
- `docs/LOCAL_DEVELOPMENT_AND_TESTING.md` provides the validated credential-free local setup, explicit backend environment loading, reviewer walkthrough, accepted browser checklist, and stop/restart guidance.
- Phase 5G-5 final regression reverified the explicit isolated database guard, 26/26 generator contracts, 15/15 guarded persistence/cleanup tests, 144/144 backend unit tests, 19/19 Traceability/history tests, 5/5 focused inspection HTTP tests, 79/79 sequential HTTP E2E tests, 20/20 reviewer-support tests, and 216/216 complete frontend tests. Both TypeScript checks, both linters, route generation, both production builds, scoped Phase 5G formatting, and diff hygiene pass.
- Final read-only isolated-database evidence reports zero generator-owned product, unit, specification, submission, and NC anchors; deterministic reference integrity remains 9/9. MEDIUM was not regenerated. LARGE persistence remains disabled, custom MEDIUM remains refused, and no cleanup uses namespace-prefix ownership.
- Phase 5G-5 and overall Phase 5G are verified complete. Phase 5H-0 discovery/inventory is complete, Phase 5H-1 final regression/safety and Phase 5H-2 final reconciliation are verified complete, and overall Phase 5 is verified complete.
- Final pre-commit hardening requires both the exact plan fingerprint and the literal `CLEANUP` operation at the base, quality, and NC cleanup entry points. Runtime-invalid operation values are refused with `PLAN_CONFIRMATION_MISMATCH` before Prisma construction or database access. The focused generator suite passes 30/30 and the guarded exact-owned persistence/cleanup suite passes 15/15 against `battery_quality_traceability_test`.
