# Dashboard and Traceability Read Design

**Phase:** 4A — Dashboard & Traceability UX / Read Contracts

**Status:** Phase 4A–4J and overall Phase 4 VERIFIED COMPLETE; Phase 5 VERIFIED COMPLETE

This document is the Phase 4 source of truth for dashboard and traceability read behavior. It is grounded in the current Prisma schema, Phase 2 traceability queries and deterministic synthetic seed. It defines contracts; it does not add controllers, production endpoints, DTOs, queries, or UI implementation.

## Design principle and boundary

> One trace code should provide a unified traceability view across unit genealogy/material history, manufacturing process history, and available quality/nonconformance context—without duplicating or fabricating records.

Any `PACK`, `MODULE`, `CELL`, `COMPONENT`, or `MATERIAL` trace code is a valid starting point. Descendant traversal answers what a unit contains or contained; ancestor traversal answers where a unit belongs or belonged when relationship evidence exists. Missing evidence is rendered as unavailable or an empty collection, never synthesized to complete a story.

Phase 4 is read-oriented. Phase 5 owns inspection-entry workflow and Phase 6 owns nonconformance/rework workflow. Phase 4 must not mutate those records or infer policy decisions that are not persisted. It retains the Phase 3 authenticated shell and visual system.

## Repository facts that constrain the design

- `TraceableUnit.traceCode` is globally unique and limited to 128 database characters. A unit has a type and timestamps; only `PACK` may and must reference a `ProductModel`. There is no unit lifecycle/status field.
- `GenealogyRelation` is the evidence for parent/child membership. `installedAt`, nullable `removedAt`, and optional `positionCode` distinguish current, removed, and position history. Both parent and child lookup directions are indexed.
- PostgreSQL prevents direct self-parenting, invalid relation chronology, more than one active direct parent per child, and more than one active occupant of a named parent position. It does not prove that the entire graph is acyclic. Existing recursive CTEs carry a visited UUID path so malformed cycles terminate.
- `ProcessExecution` records process definition, optional route-step context, actual execution-method snapshot, attempt, lifecycle status, and timestamps. It does not carry PASS/NG.
- `Inspection` references an exact specification/version and contains outcome, attempt, process context and time. `InspectionResult` holds typed evidence. Quality outcome must remain separate from execution status.
- `Nonconformance` may reference a source inspection and/or execution. Cases, actions, verification inspections and dispositions are independent ordered evidence. No NC is not equivalent to PASS.
- Existing internal queries already provide identity, recursive forward/reverse genealogy, position history, process history, typed quality history and NC reconstruction. They are correctness-oriented and unbounded for the small seed, and expose no controller.
- The deterministic seed contains 16 units, 13 relations, 14 executions, 8 inspections/results and 2 NCs across fictional `DEMO_ALPHA` / `DEMO_BETA` stories. It supports honest examples, but old fixed timestamps mean “today” metrics could legitimately be empty.

## Hero user journey

1. From Overview or Traceability, the authenticated user enters one synthetic trace code, for example `PACK-DEMO-ALPHA-PASS` or `CELL-DEMO-ALPHA-PASS-01`.
2. The client trims and normalizes the candidate, requests search, and gives an exact trace-code match first. An exact match can open the unit detail directly; otherwise the user selects from deterministic prefix results.
3. Unit Detail first renders persisted identity and section availability/count metadata. It never labels a unit with an invented overall status.
4. The Genealogy tab shows the selected unit, its ancestor context, and one descendant level. A user expands a node or follows a trace code to continue. Current relationships are the default; historical/as-of views explicitly label removed or time-scoped relationships.
5. Process History, Quality History and Nonconformance load independently when selected. Each displays only its own semantics and preserves attempts and timestamps.
6. From any related node, source inspection, execution, retest or related unit, the user may follow the persisted link without copied records. A cell/component/material search can therefore reach one or more evidenced historical ancestors and packs.
7. If a section has no records, the UI says so. If a bounded genealogy response is incomplete, it says that more evidence is available and offers expansion/loading; it never implies completeness.

## Primary UX surfaces

### A. Overview dashboard

Overview is an operational entry point, not an analytics showcase. Its first action is a prominent **Trace a Unit** input. Supporting cards and lists use the evidence-backed metrics below and link to filtered traceability views where useful.

The initial responsive composition is:

- trace search;
- compact inventory counts (total and by unit type);
- in-progress process count and a recent-process list;
- inspection outcome counts across the explicitly labelled persisted-record scope;
- open/in-progress nonconformance counts;
- pack count by product model.

The implemented Overview displays the server generation time and “all records” inspection scope. It shows no percentages, trends, yield, throughput, targets, forecasts or production-volume claims. A returned zero remains visible evidence; an unavailable quality aggregate renders an explicit unavailable message rather than zero.

From/to filtering is an approved future event/analytics requirement but is not part of the Phase 5 critical path. Its preferred contract uses timezone-qualified absolute `from` and `to` instants with half-open `[from, to)` semantics. Shared presets and dashboard analytics filtering primarily belong to the later analytics phase unless measured Phase 5 evidence requires earlier history filtering. This event-range contract must not replace or overload genealogy Current, Historical evidence, or As-of semantics.

### B. Traceability search

Search covers every `TraceableUnitType`. Results contain only trace code, type, nullable product-model identity, persisted `createdAt`, and a nullable `lastActivityAt` calculated as the greatest persisted timestamp among that unit's process executions, inspections, and nonconformances. `lastActivityAt: null` means no such activity exists. It is not a current process or unit status.

Filters are `unitType` and product-model code. Product model is meaningful only for packs under the current schema; filtering by it therefore returns matching packs and does not infer a model for descendant units. No lifecycle/status filter is offered.

An absent/blank query means browse mode and returns the first page, rather than fake suggestions or an error. A nonblank query is normalized by Unicode trim and ASCII uppercase, must be 1–128 characters, and accepts only `A-Z`, `0-9`, hyphen and underscore for the Phase 4 public contract. Search is prefix matching; a globally unique exact match is ranked first. Substring/fuzzy search is deferred because it is not justified by the current identifiers or indexes.

Results order by exact-match rank, then `traceCode ASC`, then internal UUID only as an opaque tie-breaker. The UUID is not returned. Default page size is 25, maximum 100. Page numbers are 1-based; a page beyond the final page returns `200`, an empty `items` array and correct pagination metadata. Filters use stable codes, not localized labels.

### C. Unit detail and genealogy

The five-tab model matches the schema:

1. **Overview** — trace code, unit type, nullable product model, `createdAt`, `updatedAt`, and section availability/counts.
2. **Genealogy** — ancestors, direct/expanded descendants, installed/removed interval, position and current/historical state.
3. **Process History** — chronological execution attempts and configuration context.
4. **Quality History** — chronological inspections, exact specification version, outcome and typed evidence.
5. **Nonconformance** — NC identity/lifecycle, defect category, linked origin, cases, actions, verifications and dispositions already modeled.

Tabs are links or equivalent keyboard-operable controls with route-addressable state. Identity remains visible while tab content loads. Counts indicate records, not quality or completeness. Overview may show “No records” for a section but must not copy its full history.

## Genealogy contract

### Relationship meaning

- `current`: `removedAt` is null.
- `historical`: all matching relation rows, including current and removed.
- `asOf`: `installedAt <= at` and (`removedAt` is null or `removedAt > at`).
- Historical traversal is an evidence lineage, not a claim that every returned edge was active at the same instant. Use `asOf` for a coherent time slice.
- A removed relation is displayed with both installation and removal times and a “Removed” label. It remains navigable evidence.
- Ancestors and descendants use the same relation rows; direction is traversal perspective, not a second relationship.
- A unit can have different historical parents. The UI must not collapse them into one current breadcrumb.

### Progressive disclosure and bounds

- Initial detail load requests current ancestors up to depth 8 and current descendants at depth 1. Ancestors render as context paths; children render as an expandable semantic tree/list.
- Expanding a node requests one further descendant level rooted at that node. Selecting a node updates the selected context and exposes “Open unit detail”; it does not silently replace the page's root identity.
- Historical mode initially requests direct relations at depth 1 so replacement evidence is apparent without expanding an entire historical graph.
- API depth is an integer from 1–8; default is 1. Each response returns at most 100 edges; default is 50. Expansion/lazy loading uses an opaque cursor scoped to root, direction, scope, `at`, depth and ordering.
- Stable edge order is `depth ASC`, `installedAt ASC`, related `traceCode ASC`, `relationId ASC`.
- Responses include `pageInfo.hasNextPage`, nullable `endCursor`, `returnedEdgeCount`, `requestedDepth`, `reachedDepth`, and `isPartial`. `isPartial` is true when count/depth bounds or cycle protection prevent a completeness claim.
- If a visited-node guard encounters a cycle, traversal stops that path, `isPartial` is true, and `integrityWarnings` contains a stable `CYCLE_PATH_SKIPPED` code without database detail. The UI shows a restrained integrity warning and preserves returned evidence.
- The current database invariants make one active direct parent the normal case, but the response uses arrays because historical/as-of evidence and integrity anomalies can create multiple paths.

No graph library is selected in 4A. A semantic nested list/tree with disclosure buttons, relationship metadata and CSS connectors is sufficient and more accessible. A library may be reconsidered only after implemented interaction/scale evidence shows that it is needed.

## History semantics

### Process

Process history answers what execution occurred. Each row exposes process code/name, nullable route code/version/step, the actual execution method snapshot, attempt number, lifecycle status, start and nullable finish. Default order is `startedAt DESC, attemptNumber DESC, id DESC`; the UI may offer chronological display while retaining deterministic API order. An in-progress execution has `finishedAt: null`; this is not missing data.

### Quality

Quality history answers what inspection occurred under which exact specification version. It exposes result type, attempt, outcome, inspection time, process code, nullable linked execution ID, and a discriminated evidence value. Numeric values stay decimal strings and use nullable stable unit codes. Missing result evidence would be an integrity error, not an invented empty/false value; the Phase 4 DTO mapper must not repeat the internal fallback behavior that can coerce absent values.

### Nonconformance

Nonconformance context answers whether a directly unit-linked NC exists and shows only stored context: NC/category/status/timestamps, nullable source links, ordered abnormal cases, actions, verifications and dispositions. Related-unit or resulting-inspection references are links; they are not duplicated identities or quality records. Phase 4 does not infer inherited NCs from ancestors/descendants. A future explicitly labeled “related genealogy impact” view may do so, but direct and inferred relevance must never be mixed.

The three histories remain independently paged and independently empty. A PASS inspection does not imply process completion; process completion does not imply PASS; no NC does not imply a PASS or released unit.

## REST read strategy

Use a hybrid of a lightweight unit-detail aggregate and focused, lazy endpoints. The aggregate supplies identity and availability counts needed for the shell. Large or nested collections load per tab. This retains the existing service's composition principle without returning its current unbounded internal object or raw Prisma records.

All endpoints are authenticated JSON reads. Dates are ISO 8601 UTC strings; enums and business codes are stable nonlocalized values. DTOs omit Prisma-only fields and internal UUIDs unless a link identifier is necessary. Trace codes in paths must be URL encoded.

### `GET /dashboard/overview`

Requires `dashboard:view`.

```json
{
  "generatedAt": "2026-09-26T00:00:00.000Z",
  "inventory": {
    "totalUnits": 16,
    "byType": [{ "unitType": "PACK", "count": 3 }]
  },
  "process": {
    "inProgressCount": 0,
    "recent": [{
      "traceCode": "PACK-DEMO-BETA-ESCALATED",
      "unitType": "PACK",
      "productModel": { "code": "DEMO_BETA", "name": "Demo Beta Product" },
      "process": { "code": "DEMO_RELEASE", "name": "Demo Release" },
      "attemptNumber": 1,
      "status": "COMPLETED",
      "startedAt": "2026-01-12T11:30:00.000Z",
      "finishedAt": "2026-01-12T11:35:00.000Z"
    }],
    "recentLimit": 10
  },
  "quality": {
    "scope": { "mode": "ALL_RECORDS", "from": null, "to": null },
    "inspectionCount": 8,
    "byOutcome": [{ "outcome": "PASS", "count": 6 }],
    "available": true
  },
  "nonconformance": {
    "openCount": 0,
    "inProgressCount": 0
  },
  "productModels": [{ "code": "DEMO_ALPHA", "name": "Demo Alpha Product", "packCount": 2 }]
}
```

This endpoint is implemented in Phase 4B. `generatedAt` is request-time UTC. Unit groups always appear as PACK, MODULE, CELL, COMPONENT, MATERIAL; outcome groups always appear as PASS, NG; product models order by code. A returned zero means the corresponding aggregate query succeeded and found no rows. Quality `available: true` means the all-record aggregate succeeded; a database failure fails the request rather than returning invented zeroes or unavailable placeholders.

Recent activity returns at most 10 process executions ordered by `startedAt DESC`, `attemptNumber DESC`, then an internal UUID tie-breaker that is not exposed. Non-pack activity has `productModel: null`, matching persisted identity rather than inferred ancestry. For the fixed seed, the honest quality scope is all persisted inspections, labelled `ALL_RECORDS`, rather than an arbitrary relative window. No lifecycle, throughput, yield, trend, or inferred quality state is returned.

### `GET /traceability`

Implemented in Phase 4C. Requires `traceability:view`.

Query: `query?`, `unitType?`, `productModel?`, `page=1`, `pageSize=25`.

```json
{
  "items": [{
    "traceCode": "PACK-DEMO-ALPHA-PASS",
    "unitType": "PACK",
    "productModel": { "code": "DEMO_ALPHA", "name": "Demo Alpha Product" },
    "createdAt": "2026-09-23T00:00:00.000Z",
    "lastActivityAt": "2026-01-10T10:14:00.000Z",
    "match": "EXACT"
  }],
  "page": { "number": 1, "size": 25, "totalItems": 1, "totalPages": 1 }
}
```

`query` is trimmed and uppercased. Blank/omitted input selects browse mode; nonblank input must be 1–128 characters from `A-Z`, `0-9`, `_`, or `-`. Matching is prefix-only, with a unique exact match ranked first. `unitType` accepts the five schema enum values case-insensitively. `productModel` is trimmed/uppercased, must be a well-formed stable code up to 64 characters, and filters only the direct persisted relationship; unknown well-formed codes return an empty result. No genealogy inference occurs.

`page` is 1-based and defaults to 1. `pageSize` defaults to 25 and is capped at 100. Exact-first results are followed by `traceCode ASC, internal id ASC`; browse uses that same secondary ordering. The internal ID is never returned. Pages beyond the end and no-match searches return `200` with empty `items` and accurate totals. Each row's `lastActivityAt` is the latest persisted execution start, inspection time, or NC detection time directly linked to that unit, or `null`; it is not a current status. Browse rows have `match: null`.

Phase 4F consumes this contract with an authenticated URL-driven search surface. Missing criteria perform the bounded 25-row browse; query, unit type, direct product-model code and page survive refresh/history, while Clear returns to browse. Trace and model inputs store canonical uppercase values. Responsive result records display only the public fields above, with LTR-isolated technical identifiers and atomic non-wrapping locale-formatted timestamps. A zero total preserves criteria and the no-match message but renders no pagination controls. Result links resolve through `/[locale]/traceability/[traceCode]`; Phase 4G now consumes the detail/genealogy contracts there.

Malformed query/filter/pagination values return the stable `400 INVALID_REQUEST` envelope with a public field/code detail. Unknown product-model codes and semantically empty filter combinations are not malformed and return empty success responses.

### `GET /traceability/:traceCode`

Implemented in Phase 4D. Requires `traceability:view`. Returns the detail shell; it does not embed collections. The path trace code is trimmed and uppercased under the same 1–128 safe-character contract as search. Malformed codes return `400 INVALID_REQUEST`; an unknown well-formed code returns `404 TRACE_UNIT_NOT_FOUND`.

```json
{
  "unit": {
    "traceCode": "PACK-DEMO-ALPHA-PASS",
    "unitType": "PACK",
    "productModel": { "code": "DEMO_ALPHA", "name": "Demo Alpha Product" },
    "createdAt": "2026-09-23T00:00:00.000Z",
    "updatedAt": "2026-09-23T00:00:00.000Z"
  },
  "sections": {
    "genealogy": { "hasRecords": true, "directRelationCount": 1 },
    "processHistory": { "hasRecords": true, "recordCount": 4 },
    "qualityHistory": { "hasRecords": true, "recordCount": 4 },
    "nonconformance": { "hasRecords": false, "recordCount": 0 }
  }
}
```

`hasRecords: false` with a zero count means the count was successfully computed and no record exists. It is not an error and does not imply a quality outcome. The timestamps above illustrate types only; `TraceableUnit.createdAt` is generated when the deterministic seed is first installed and must not be presented as a manufacturing event.

### `GET /traceability/:traceCode/genealogy`

Implemented in Phase 4D. Requires `traceability:view`.

Query: `direction=descendants|ancestors` (default `descendants`), `scope=current|historical|asOf` (default `current`), `at?`, `depth=1`, `limit=50`, `cursor?`. `at` is required only for `asOf` and rejected otherwise.

```json
{
  "root": { "traceCode": "CELL-DEMO-ALPHA-PASS-01", "unitType": "CELL" },
  "direction": "ancestors",
  "scope": { "mode": "current", "at": null },
  "edges": [{
    "relationId": "opaque-relation-id",
    "depth": 1,
    "parent": { "traceCode": "MODULE-DEMO-ALPHA-PASS-01", "unitType": "MODULE" },
    "child": { "traceCode": "CELL-DEMO-ALPHA-PASS-01", "unitType": "CELL" },
    "positionCode": "CELL-01",
    "installedAt": "2026-01-10T00:00:00.000Z",
    "removedAt": null,
    "relationshipState": "CURRENT"
  }],
  "pageInfo": {
    "hasNextPage": false,
    "endCursor": null,
    "returnedEdgeCount": 1,
    "requestedDepth": 8,
    "reachedDepth": 1,
    "isPartial": false
  },
  "integrityWarnings": []
}
```

Depth defaults to 1 and permits 1–8. Limit defaults to 50 and permits 1–100. A limit-plus-one query produces `hasNextPage`; `endCursor` is an opaque offset plus a hash of root/direction/scope/time/depth/limit, so it cannot be reused under another traversal request. Stable ordering is depth, installation time, related trace code, then an unexposed relation UUID. The returned `relationId` is a one-way opaque hash reference rather than the database UUID.

Each public node includes direct parent/child counts within the requested scope and a `selected` flag. Boundary counts support expansion without per-node queries. `partialReasons` can contain `EDGE_LIMIT`, `DEPTH_LIMIT`, or `CYCLE_PATH_SKIPPED`; traversal never silently claims completeness. A visited-path guard emits an integrity warning and skips the cyclic closing edge.

Current includes `removedAt IS NULL`. Historical includes all evidence and may contain paths whose intervals did not coexist. `asOf` requires a timezone-qualified ISO timestamp and applies `installedAt <= at AND (removedAt IS NULL OR removedAt > at)`. Thus installation is inclusive and removal is exclusive. `at` is rejected for other scopes.

### `GET /traceability/:traceCode/process-history`

Requires `traceability:view`. Query: `page=1`, `pageSize=25` (maximum 100).

```ts
type ProcessHistoryResponse = {
  items: Array<{
    recordId: string;
    process: { code: string; name: string };
    route: { code: string; version: number; stepOrder: number } | null;
    attemptNumber: number;
    status: 'IN_PROGRESS' | 'COMPLETED' | 'ABORTED';
    executionMethod: 'MANUAL' | 'AUTOMATED' | 'HYBRID';
    startedAt: string;
    finishedAt: string | null;
  }>;
  page: { number: number; size: number; totalItems: number; totalPages: number };
};
```

`recordId` is an opaque link identifier, not exposed Prisma structure. Empty history is `200` with `items: []`.

### `GET /traceability/:traceCode/quality-history`

Requires `traceability:view`. Query: `page=1`, `pageSize=25` (maximum 100), optional `outcome=PASS|NG`.

```ts
type QualityEvidence =
  | { type: 'NUMERIC'; value: string; unitCode: string | null }
  | { type: 'BOOLEAN'; value: boolean }
  | { type: 'CATEGORICAL' | 'VISUAL'; optionCode: string; isAcceptable: boolean }
  | { type: 'TEXT'; value: string };

type QualityHistoryResponse = {
  items: Array<{
    recordId: string;
    specification: { code: string; version: number };
    processCode: string;
    processExecutionRecordId: string | null;
    resultType: 'NUMERIC' | 'BOOLEAN' | 'CATEGORICAL' | 'VISUAL' | 'TEXT';
    attemptNumber: number;
    outcome: 'PASS' | 'NG';
    inspectedAt: string;
    evidence: QualityEvidence;
  }>;
  page: { number: number; size: number; totalItems: number; totalPages: number };
};
```

Filters never change stored outcomes or suppress an explicit empty state.

### `GET /traceability/:traceCode/nonconformances`

Requires `traceability:view`. Query: `page=1`, `pageSize=10` (maximum 50), optional stable `status` enum.

```ts
type NonconformanceHistoryResponse = {
  items: Array<{
    code: string;
    status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
    defectCategory: { code: string; name: string };
    description: string | null;
    detectedAt: string;
    resolvedAt: string | null;
    closedAt: string | null;
    source: {
      inspectionRecordId: string | null;
      processExecutionRecordId: string | null;
    };
    abnormalCases: Array<{ code: string; reason: string | null; openedAt: string; closedAt: string | null }>;
    actions: Array<{
      recordId: string;
      actionType: 'CORRECTION' | 'REWORK' | 'REPLACEMENT' | 'RETEST' | 'BALANCING' | 'ESCALATION';
      note: string | null;
      occurredAt: string;
      resultingInspectionRecordId: string | null;
      relatedUnitTraceCode: string | null;
    }>;
    verifications: Array<{
      recordId: string;
      inspectionRecordId: string;
      actionRecordId: string | null;
      note: string | null;
      verifiedAt: string;
    }>;
    dispositions: Array<{
      recordId: string;
      dispositionType: 'CONTINUE' | 'CONCESSION' | 'RETURN_IQC' | 'SCRAP';
      note: string | null;
      decidedAt: string;
    }>;
    nestedPageInfo: Record<string, { totalItems: number; isPartial: boolean }>;
  }>;
  page: { number: number; size: number; totalItems: number; totalPages: number };
};
```

Each item is a bounded NC aggregate. Nested collections are chronological and capped at 100 each with `nestedPageInfo`. If real data exceeds that cap, a later child-resource endpoint is required; Phase 4 must not silently truncate it.

## Dashboard metric definitions

These metrics are supportable now:

| Metric | Exact evidence | Interpretation |
| --- | --- | --- |
| Total traceable units / by type | `TraceableUnit` count/group by `unitType` | Inventory of persisted identities, not production volume in a period |
| Packs by product model | `PACK` rows grouped through `productModelId` | Persisted pack identities only |
| In-progress executions | `ProcessExecution.status = IN_PROGRESS` | Actual open execution rows, not “active units” |
| Recent process activity | latest executions by `startedAt` | Events, not throughput or completion rate |
| Inspection count by PASS/NG | `Inspection` group by `outcome` in an explicit window | Recorded inspections, not first-pass yield |
| Open/in-progress NC count | `Nonconformance` group by lifecycle status | Direct persisted NC rows |

Deferred/rejected metrics are yield, first-pass yield, defect rate, rework rate, cycle time targets, throughput, on-time production, trends and arbitrary percent changes. Their denominators, business windows or semantics are not yet defined; Phase 7 owns quality analytics.

## Empty and error semantics

| Condition | API | UI |
| --- | --- | --- |
| Trace code absent | `404 TRACE_UNIT_NOT_FOUND` | Preserve search/navigation and state that no unit exists for that code |
| Valid unit, no process/inspection/NC | `200`, empty `items`, total `0` | Section-specific “No … records available”; never substitute zero measurements or PASS |
| Removed relationship | Returned in historical scope with `relationshipState: HISTORICAL` and `removedAt` | Clearly label interval and removed state |
| Partial genealogy | `200`, `isPartial: true`, cursor/warning/reason metadata | “Partial view” plus load/expand action; no completeness claim |
| No dashboard activity | Valid zero counts and empty recent list, or `available: false`/`null` if computation failed/unsupported | Honest “No activity recorded” or “Unavailable,” respectively |
| Invalid filter/query/cursor | `400 INVALID_REQUEST` with field-safe details | Associate message with the relevant control; retain input |
| Page past final page | `200`, empty items and stable page totals | Empty-page state with route back to available results |
| Unauthenticated | `401 UNAUTHENTICATED` | Existing auth recovery/login behavior |
| Lacks permission | `403 FORBIDDEN` | Existing unavailable/forbidden shell behavior |

Stable error envelope:

```json
{
  "code": "INVALID_REQUEST",
  "message": "The request is invalid.",
  "details": [{ "field": "depth", "code": "OUT_OF_RANGE" }]
}
```

`details` is optional and uses public field names/stable codes only. `TRACE_UNIT_NOT_FOUND` uses the generic message “Traceable unit not found.” Errors must not expose SQL, Prisma, stack traces, internal UUIDs, constraints or whether unrelated protected records exist.

## Authorization

| Surface | Required permission |
| --- | --- |
| Overview dashboard and `/dashboard/overview` | `dashboard:view` |
| Trace search, unit detail, genealogy and all history endpoints | `traceability:view` |

All four existing roles already hold both read permissions. No role or permission is added. Every production controller must declare its permission metadata so the Phase 3 default-deny guards remain authoritative. Frontend navigation and disabled states are usability only. `ADMIN` receives exactly its explicit read grants and no domain superuser behavior.

## Performance and implementation constraints

- Exact lookup uses the unique `traceCode` index. Prefix search must use a bounded query and deterministic pagination; 4C must inspect `EXPLAIN` against representative larger synthetic data before deciding whether a text-pattern index is needed.
- Extend the existing parameterized recursive traversal rather than introduce another genealogy algorithm. Add depth and result predicates to the recursive query and retain visited-path protection.
- Avoid N+1 queries: fetch page identities/activity aggregates in set queries, and map related configuration in bounded includes/selects. Do not join process, inspection and NC collections into one Cartesian response.
- Histories use existing unit/time indexes and keyset/cursor pagination internally where it improves stability; the public page contract may remain numbered for flat search/history collections at current scale.
- Dashboard uses grouped/count queries plus one bounded recent query. It does not load full records to count them.
- No cache is justified for the current small portfolio dataset. Reconsider short-lived overview caching or precomputed aggregates only after measured query latency/load shows need. Genealogy and unit history require careful invalidation and should not be cached speculatively.

## Internationalization, accessibility and responsive behavior

- English is canonical copy; Bahasa Indonesia follows through existing messages; other registered locales fall back to English until translated. Stable codes, trace codes and API enums are not translated.
- Dates/numbers render with the active locale and retain an accessible exact timestamp. API timestamps remain UTC. Logical CSS properties and flexible text regions preserve Arabic RTL structure.
- Search has a persistent label and clear submit action. Results use semantic tables on wide screens and labelled record lists/cards on narrow screens without dropping data.
- Tabs, pagination, filters, disclosure buttons and node links are keyboard operable with visible focus. Genealogy cannot rely on hover, color or pointer-only drag/pan. Current/removed and PASS/NG use text plus semantic color.
- The genealogy tree uses nested lists and buttons with `aria-expanded`; focus stays on the triggering node after expansion. Loading and errors are announced without stealing focus.
- On mobile, identity and trace action remain first, tabs may horizontally scroll with keyboard access or become a labelled selector, timelines stack, and metadata wraps. No fixed-width graph canvas or horizontal page overflow is allowed.
- Respect reduced motion and the existing shell's 44px mobile target guidance.

## Public portfolio safety

All examples remain visibly synthetic: `DEMO_ALPHA`, `DEMO_BETA`, and generated trace/NC codes. Phase 4 fixtures, screenshots and copy must not introduce real organizations, internal product identifiers, serials, part numbers, thresholds, volumes, MES schemas/APIs, screenshots, SOPs or operational artifacts. The application must retain the public simulation disclaimer. Missing demo evidence stays missing rather than being invented for visual density.

## Phase 4 delivery plan

- **4A — Dashboard & Traceability UX / Read Contracts:** this design and source-of-truth reconciliation. **VERIFIED COMPLETE.**
- **4B — Backend Dashboard Read Models:** authenticated, evidence-backed overview DTOs/queries/controller and focused tests. **VERIFIED COMPLETE.**
- **4C — Traceability Search API:** normalized exact/prefix browse search, filters, deterministic pagination and query-plan evidence. **VERIFIED COMPLETE.**
- **4D — Unit Detail & Genealogy API:** detail shell, section counts, bounded bidirectional traversal, empty/error contracts and integration tests. **VERIFIED COMPLETE.**
- **4E — Overview Dashboard UI:** shell-preserving operational overview, evidence states, recent activity, immediately uppercased canonical trace entry, responsive mobile-header priority, and isolated mixed-direction timestamp/technical values. **VERIFIED COMPLETE.**
- **4F — Traceability Search UI:** URL-driven browse/query/filter/result/pagination, empty/error states, responsive localized record cards, bidi-safe technical values/timestamps, and a non-fetching nested future-detail placeholder. **VERIFIED COMPLETE.**
- **4G — Unit Detail & Genealogy UI:** identity shell, progressive genealogy, current/historical/as-of states, ancestor context, related-unit traversal, and accepted responsive/localized investigation UX. **VERIFIED COMPLETE.**
- **4H — Process, Quality & Nonconformance History API/UI:** **VERIFIED COMPLETE.** 4H-1 public contracts, 4H-2 bounded repository/service reads, 4H-3 controller/HTTP exposure, 4H-4 typed frontend clients/runtime validation, 4H-5 Process + Quality History UI, 4H-6 Nonconformance History UI, and 4H-7 test-only integration/failure-isolation verification are **VERIFIED COMPLETE**.
- **4I — Integration / Responsive / Accessibility:** **VERIFIED COMPLETE.** Cross-surface review preserved locale fallback/RTL, semantic structure, keyboard behavior, focus treatment, and independent evidence states. Unsafe intermediate-width activation was corrected for Traceability Search and Unit Detail Quick Search, and process `COMPLETED` now uses neutral lifecycle styling. Targeted English, Arabic RTL, intermediate-width, and wide-desktop acceptance passed.
- **4J — Manual Acceptance & Final Reconciliation:** **VERIFIED COMPLETE.** The integrated hero journey, browser history/scope restoration, Arabic RTL locale/disclosure handoff, responsive keyboard-visible behavior, public-data/privacy boundary, corrected point-in-time replacement evidence, UTC database boundary, and final regressions passed.

This decomposition is retained with one clarification: 4H includes the lazy detailed history endpoints and NC context as well as process and quality UI, because 4D intentionally implements only identity, section counts, and genealogy. At the Phase 4F checkpoint, Phase 4G remained not started and the nested trace-code route was only a safe authenticated placeholder. Phase 4G has since replaced that placeholder with verified Unit Detail and bounded Genealogy UI.

At the 4H-1 checkpoint, only the public contract boundary was implemented. Process and quality pages default to 25 records and cap at 100; NC pages default to 10 and cap at 50. Quality evidence remains a strict numeric/boolean/categorical/visual/text union whose invalid or incomplete stored evidence fails rather than becoming an empty value. Inspection PASS/NG remains separate from current NC lifecycle state; NC cases, actions, verifications, and dispositions remain distinct retained evidence with explicit returned/total/partial metadata under a future 100-item nested cap. Namespaced SHA-256-derived references prevent raw database UUID exposure and support stable cross-references. Ordering was declared for 4H-2, and genealogy current/historical/as-of scope does not filter these direct histories. At that checkpoint, repositories, services, controllers, operational endpoints, and frontend history sections had not yet been implemented.

Phase 4H-2 implements the repository/service layer behind those contracts. Each read resolves one canonical unit and filters directly by its foreign key; no genealogy, parent, child, ancestor, or descendant evidence is aggregated. Database counts and bounded pages use deterministic newest-first top-level order. NC nested collections are selected with a 100-record cap, chronological hidden-ID tie-breakers, and database totals that distinguish complete from partial evidence. The service applies strict typed inspection integrity, ISO timestamp mapping, stable namespaced cross-references, and existing malformed/not-found semantics. Database-backed verification passed the clean, retest, escalated, and empty-direct-module fixtures. At that checkpoint controllers and public HTTP history endpoints remained unimplemented.

Phase 4H-3 makes all three documented history GET endpoints operational through the existing Traceability module and Prisma infrastructure. Each route requires `traceability:view`, delegates to the verified bounded parser/service contract, preserves canonical malformed/not-found behavior, and maps only strict history-integrity failures to a deterministic safe 500 without exposing stored values or database details. HTTP E2E verifies typed quality serialization, NC retained evidence/partial metadata, direct-unit-only empty module histories, opaque cross-endpoint references, privacy, bounds, filters, and clean/retest/escalation fixtures. Every legitimate role currently has `traceability:view`; no fake denied role was created, while the shared authorization regression continues to verify real 403 behavior. At that checkpoint no frontend history client or UI existed.

Phase 4H-4 adds typed clients for process, quality, and NC history without integrating them into Unit Detail. They construct only approved bounded queries and reuse the existing authenticated no-store fetch, cookie, AbortSignal, and error-kind conventions. Runtime validation requires exact public shapes, discriminator-compatible quality evidence, the backend decimal-string representation, valid opaque-reference namespaces, and truthful NC nested metadata. Safe public backend codes—including the integrity failure—remain distinguishable, while unknown internal codes are discarded and malformed successful responses fail instead of becoming empty history. The read-only visible history workspace remains unimplemented until 4H-5.

Phase 4H-5 integrates only Process and Quality History into Unit Detail. Both are direct-unit, independently loaded and paginated 25 records at a time, and remain independent of Genealogy current/historical/as-of scope. Process evidence keeps lifecycle status neutral and never converts `COMPLETED` into PASS. Quality preserves explicit PASS/NG, every verified typed evidence variant, retained earlier NG after later PASS, and an independent All/PASS/NG filter. Truthful direct-empty states, section-local retry, sibling preservation, and safe history-integrity errors passed deterministic component coverage.

Manual browser acceptance passed populated clean-pack process/quality histories; numeric, Boolean, categorical, visual, and text evidence; retest attempts with retained NG then PASS; outcome filtering; the empty direct-module invariant; Genealogy-scope independence; English, Indonesian, Arabic RTL/fallback; and 375×812 responsive cards. The Quick Search typography revision passed desktop, intermediate, and mobile acceptance after removing the unnecessary supporting-copy width cap without a nowrap or overflow workaround. Error isolation and Retry were verified through deterministic automated tests rather than production debug hooks or altered data.

Phase 4H-6 presents independently loaded, paginated direct-unit Nonconformance History after Quality History. Current lifecycle filters remain separate from inspection PASS/NG, while abnormal cases, actions, verifications, and dispositions retain chronological evidence and truthful bounded/partial metadata. Opaque references remain non-navigable technical evidence; persisted related trace codes use the existing Unit Detail route. Simple and escalated NC fixtures, direct-empty pack/module results, lifecycle filtering, Genealogy independence, Safari Back, English/Indonesian, Arabic RTL/fallback, 375×812 nested cards, long references, and native disclosure keyboard behavior passed manual acceptance. Deterministic tests cover NC-local failure/Retry and safe integrity errors. The accepted Revision 1 transiently hands off exact disclosure state across locale remounts using trace code, NC code, and group identity, without persistent storage, URL state, or focus manipulation.

Phase 4H-7 closes deterministic integration and failure-isolation coverage without adding a production feature. Discovery found no production defect and production code remained unchanged. Tests prove that an NC failure remains local while populated Process and Quality evidence stays visible; NC Retry alone repeats the NC request and restores populated NC evidence; NC integrity failures render only safe copy; and Process or Quality failure preserves its successful sibling and populated NC evidence. No additional browser acceptance was required for this test-only scope because the underlying browser behavior passed manual acceptance in 4H-5 and 4H-6; destructive error injection was not manually tested.

Phase 4I corrects two integration findings and one manually discovered Revision 1 defect. Traceability Search delays its four-column form and coordinated actions from `lg` to `xl`; populated English layouts at 1024×768 and approximately 1100×800 and Arabic RTL intermediate layouts passed with usable filters, contained results/pagination, readable technical identifiers, and no horizontal overflow. Overview process `COMPLETED` uses neutral slate treatment: green remains for explicit PASS/current evidence, red for explicit NG/critical evidence, amber for warning/historical evidence, and neutral styling for lifecycle evidence such as process `COMPLETED` and NC Closed/Resolved.

During targeted acceptance, Unit Detail Quick Search reproduced a genuine intermediate-width collapse because its horizontal layout, prose cap, and fixed 36rem form also activated alongside the sidebar at `lg`. Revision 1 delays that coordinated layout to `xl` without restoring the removed prose width constraint or changing typography, normalization, validation, navigation, localization, or bidi behavior. English 1024×768, approximately 1100×800, and wide desktop passed; Arabic RTL 1024×768 and wide desktop also passed. Existing semantic HTML, labels, accessible names/states, focus-visible behavior, drawer focus management, keyboard controls, alerts/loading roles, and native disclosures remain unchanged. No automated screen-reader validation is claimed; final broad browser, assistive-technology, and privacy acceptance belongs to 4J.

Phase 4G renders persisted unit identity, nullable direct product context, recorded/updated timestamps, and direct availability counts without deriving health or outcome. Ancestor and direct-child panels load independently, retain cursor continuation and partial/cycle disclosure, and link related trace codes back through the same route. Current, historical, and as-of views preserve installed/removed evidence and the inclusive-install/exclusive-removal contract; historical lineage does not imply simultaneous activity.

Genealogy scope remains URL-addressable. The accepted application-controlled as-of editor displays semantic LTR `DD/MM/YYYY, HH:mm` segments with valid auto-advance, calendar clamping, and a synchronized chooser before producing the existing timezone-qualified instant. Scope/apply transitions retain push/Back/Forward behavior without automatic top scrolling. Locale switching retains the complete query and uses a bounded transient in-memory scroll handoff across the root locale-layout remount; no permanent storage or full reload is used. A compact canonical trace search reuses Phase 4F rather than creating another search API.

Phase 4J confirmed that the editor value is browser-local wall-clock time, not a UTC fixture label. For the direct replacement fixture rooted at `MODULE-DEMO-ALPHA-RETEST-01`, Jakarta input `11/01/2026 17:00` becomes `2026-01-11T10:00:00.000Z` and returns both cells plus `COMP-DEMO-OLD`; `11/01/2026 19:00` becomes `2026-01-11T12:00:00.000Z` and returns both cells plus `COMP-DEMO-NEW`. `PACK-DEMO-ALPHA-RETEST` directly owns only that module at depth one; it does not directly own the module's cells/components.

Final investigation also found that the installed PostgreSQL adapter emits timezone-less Date parameters. Every project-owned Prisma connection now starts its PostgreSQL session in UTC through the shared adapter factory. The deterministic seed reconciled the explicit UTC fixture instants without reset or manual patching, and a database-side epoch regression proves `2026-01-11T08:00:00Z` persists as epoch `1768118400` across upsert/update. API timestamps retain qualified absolute-time semantics, while as-of continues to use inclusive installation and exclusive removal boundaries.

Final browser acceptance passed the English integrated journey; genealogy URL/scope and Back/Forward restoration; Arabic RTL locale remount with exact NC disclosure-state preservation and related-unit navigation; responsive, keyboard-visible, and privacy sanity checks; and the corrected as-of scenarios above. No automated screen-reader validation is claimed. Final backend/frontend regression, all nine seed-integrity checks, public portfolio review, and source-of-truth reconciliation passed. Phase 4A through 4J and overall Phase 4 are **VERIFIED COMPLETE**. Phase 5 subsequently implemented and verified quality persistence, inspection entry, reconciled history, synthetic reviewer support, and its final Phase 5H closure.

Final automated verification passed 64 focused Phase 4G/search/shell/route tests, all 96 frontend regression tests, TypeScript, ESLint, the webpack production build, and `git diff --check`. Manual Safari acceptance passed current/historical/as-of evidence including the deterministic component replacement, related-unit traversal, nonexistent-unit recovery through search, `DD/MM/YYYY, HH:mm` editing and chooser behavior, URL/history and viewport preservation, quick-search validation, English/Indonesian/fallback presentation, Arabic RTL, and the 375×812 responsive layout.

## Deferred decisions

- Phase 5 inspection creation and Phase 6 NC/rework mutations.
- Inherited or genealogy-impact NC inference.
- Analytics formulas and trend charts (Phase 7).
- Camera/barcode scanning, graph visualization libraries, caching, large-data generators and load benchmarks.
- Actor attribution schema changes and production deployment concerns.
