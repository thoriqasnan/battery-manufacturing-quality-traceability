# Domain Model and Workflow Requirements

This document defines the validated domain. Phase 2A physically models core product/process configuration, Phase 2B traceable units/genealogy, Phase 2C manufacturing execution history, Phase 2D quality-inspection configuration/evidence, Phase 2E nonconformance action/decision history, Phase 2F deterministic synthetic examples, and Phase 2G reusable traceability/integrity queries across that model. Phase 4A defines the read presentation of that evidence in `docs/DASHBOARD_TRACEABILITY.md`; it does not change the domain model. Entity names may continue to evolve as later application behavior is refined.

## Separation of concerns

The model keeps configuration, execution, history, and decisions conceptually separate.

| Concern       | Conceptual entities and responsibilities                                                                                     |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Configuration | Product Model, Process Definition, Process Route, Inspection Specification                                                   |
| Execution     | Physical/material units, Pack, Module, Cell, Component/material units, Process Execution, Inspection                         |
| History       | Genealogy and assembly events, measurements, process history, quality history, nonconformance history, action/rework history |
| Decision      | Abnormal Case, corrective action, disposition, required verification, final disposition                                      |

## Products and routing

A Product Model is configuration; a physical Battery Pack is an executed unit. They must remain separate concepts.

Process routes are configurable per product model. Synthetic product models may have different process ordering, assembly structures, inspection specifications, and execution methods. The design must not encode a universal linear route or scatter product-specific conditionals throughout business logic.

A Process Definition describes configuration. A Process Execution records what happened to a physical/material unit. Likewise, an Inspection Specification is distinct from an actual Inspection and its result history.

Phase 2A implements only the configuration side of this boundary:

- A `ProductModel` has one or more independently versioned `ProcessRoute` records.
- A `ProcessRoute` contains ordered `ProcessRouteStep` records, with step order unique within that route rather than globally fixed for all products.
- Each `ProcessRouteStep` references a reusable `ProcessDefinition` and records a language-independent execution method.
- UUID primary keys provide internal identity; stable business codes remain separate and human-readable names are not used as logic keys.

No physical battery pack, module, cell, process execution, inspection result, nonconformance, genealogy, or manufacturing history is represented by the Phase 2A models themselves. Phase 2B adds only physical identity and genealogy as described below.

## Physical identity and trace codes

Physical/material units use an internal database identity separate from their public synthetic trace code:

```text
internal identity != barcode or trace code
```

A trace code may be a unique business identifier, but it must not dictate the database primary-key format.

## Genealogy and traceability

The core conceptual genealogy is:

```text
Pack
├── Module
│   └── Cell
└── Component/material units
```

Genealogy must preserve historical relationships and assembly events where necessary, not only the latest snapshot. The architecture must represent relationships that change during manufacturing, including replacement, disassembly, and reassembly. Module counts and assembly state must not be assumed permanently fixed at every stage.

Forward traceability follows a pack through its units, processes, inspections, abnormalities, and actions. Reverse traceability should find affected packs from a cell, component, or material relationship where appropriate.

Phase 2B represents packs, modules, cells, components, and material units as typed `TraceableUnit` rows. Each row has a UUID primary key independent from its unique trace code. A physical pack is a `PACK` unit that references one configuration `ProductModel`; the database prevents other unit types from carrying that configuration relationship.

`GenealogyRelation` links one parent unit to one child unit. Recursive traversal from `parentUnitId` provides forward genealogy, while traversal from `childUnitId` provides reverse genealogy. Both directions are indexed. Relationships record when a child was installed and, when applicable, removed, so a replacement appends a new relationship while retaining the closed relationship as evidence.

The database prevents direct self-parenting, invalid install/removal time ranges, multiple active direct parents for one child, and multiple active children in the same named parent position. It deliberately does not encode company-specific assembly rules or attempt full graph-cycle prevention in this subphase.

## Process execution and history

Phase 2C represents each actual process attempt as a separate `ProcessExecution`. Every execution references one physical `TraceableUnit` and one `ProcessDefinition`. It may additionally retain the exact `ProcessRouteStep` that configured the work; the database ensures that step and the directly referenced process definition agree.

Multiple execution rows for the same physical unit and process preserve repeated work rather than overwriting history. A positive attempt number is unique within that unit/process scope, and time-based indexes support chronological traceability. The actual `MANUAL`, `AUTOMATED`, or `HYBRID` execution method is stored on the execution so later configuration changes do not rewrite historical meaning.

Execution lifecycle is intentionally small: `IN_PROGRESS` has no finish timestamp, while `COMPLETED` and `ABORTED` require one. A finish timestamp cannot precede the start. These statuses describe whether work ran to completion, not whether detailed quality evidence passed or failed.

Operator attribution is deferred until Phase 3 supplies authenticated identity. Phase 3A establishes that future mutations receive an authenticated synthetic actor, and Phase 3B supplies the user identity root; actor linkage remains deferred to later domain services. Inspections, measurements, PASS/NG outcomes, nonconformance, corrective actions, and rework decisions are not part of `ProcessExecution`.

## Inspection model

Phase 2D separates `InspectionSpecification`, `Inspection`, and `InspectionResult`. Specifications are reusable configuration; inspections are immutable-oriented historical events; results are the observed typed evidence. Quality outcomes use `PASS` or `NG` and remain distinct from process-execution lifecycle status.

Inspection specifications use a stable code and explicit positive version. An inspection references the exact version row, so retests and historical evidence do not switch to a newer specification. Phase 5's authoritative lifecycle/versioning contract is defined in `docs/QUALITY_INSPECTION.md`: a version progresses `DRAFT -> PUBLISHED -> RETIRED`; only published versions accept new evidence; published/retired criteria and options are immutable; changed acceptance definitions require a new positive version.

Inspection supports these stable value types:

- Numeric
- Boolean
- Categorical
- Visual
- Text

Numeric configuration supports optional independent lower/upper bounds and a stable unit code. Boolean configuration stores the expected value. Categorical and visual configuration uses normalized, language-independent option codes with acceptability flags. Result rows use database checks so a numeric result cannot carry boolean, option, or text evidence, and equivalent rules apply to the other types.

Composite relationships enforce that the inspected unit matches the specification scope, an optional process execution belongs to the same unit and process, the specification agrees with its process or route step, and a selected option belongs to the same specification and result type. PostgreSQL also enforces positive versions/attempts, consistent bounds, type-appropriate configuration, and at most one result per inspection.

Repeated inspection uses a new positive attempt number within the physical-unit/specification-version scope. Therefore attempt 1 can remain `NG` while attempt 2 records `PASS`; neither the event nor its result is overwritten.

Inspection scope may be a cell, module, pack, or component/material unit. Quality cannot be represented as one boolean field: specifications, measurements, observations, outcomes, abnormalities, verification, and final disposition are distinct concepts.

Later passing rework, retest, or reinspection must append new history; it must not overwrite earlier inspection or NG records.

The Phase 5 quality service must atomically create exactly one result for each inspection, serialize attempts per traceable unit and exact specification version, enforce durable submission idempotency, and attach the authenticated inspector. It computes numeric, Boolean, categorical, and visual outcomes from the exact published configuration; text evidence requires an explicit validated PASS/NG because free text has no objective acceptance rule. Phase 5B-2 now provides lifecycle, inspector, and idempotency persistence; the cross-row mutation and transition rules remain application-service work for later subphases rather than PostgreSQL triggers.

## Abnormal Case / Nonconformance

Phase 2E distinguishes an observed quality problem from escalation and response history. `Nonconformance` records the affected unit, stable NC code, reusable `DefectCategory`, lifecycle status, description, timestamps, and optional same-unit originating inspection/process execution. An `NG` inspection can source an NC, but neither every NG nor every manually observed NC is forced into one automatic path.

`AbnormalCase` is an optional escalation record rather than a flag or synonym for nonconformance. One NC may have no abnormal case or multiple separately timestamped cases over time. This preserves escalation history without requiring every ordinary correction to use an abnormal workflow.

`ActionHistory` appends generic corrections, rework, replacement, retest, balancing, and escalation actions. A retest action may reference the resulting `Inspection`, but all measurements and PASS/NG evidence remain in Phase 2D. A replacement action may reference a relevant unit, but installed/removed physical relationships remain solely in `GenealogyRelation`.

`Verification` links an NC and optional action to an existing same-unit follow-up inspection. The original `NG`, later `PASS`, action, and verification all remain separate rows. The verification inspection may belong to another process definition, allowing future cross-process rules without hard-coding them now.

`DispositionHistory` appends `CONTINUE`, `CONCESSION`, `RETURN_IQC`, or `SCRAP` decisions. These are distinct from `OPEN`, `IN_PROGRESS`, `RESOLVED`, or `CLOSED` lifecycle state. Multiple disposition events preserve changed decisions; `RETURN_IQC` does not create supplier or IQC workflow entities.

The model retains:

- Affected unit
- Originating process or inspection
- Reason
- Status
- Action history
- Engineering and quality decisions
- Verification history
- Final disposition

PostgreSQL protects unique codes, same-unit source/action/verification evidence, same-NC case/action linkage, row-local lifecycle chronology, and append-oriented indexes. The future service layer must validate NG origin and acceptable verification semantics, lifecycle transitions, cross-row chronology, action-specific requirements, cross-process verification requirements, effective disposition, and actor attribution.

Conceptual handling continues to include HOLD, correction, rework, component replacement, balancing, escalation, retest/reinspection, required verification, return or escalation to incoming quality, concession, scrap/reject, and continuation after accepted verification. Phase 2E provides persistence history, not a complete workflow engine.

## Generalized synthetic workflow requirements

These scenarios are fictional, generalized domain requirements. They must not be interpreted as a real company's SOP or copied into implementation as premature hard-coded rules.

- **Screening:** supplier-related cell NG may result in HOLD and escalation or return to incoming quality rather than local rework.
- **Manual stacking:** a polarity issue may require disassembly/restacking and verification before continuation. No special automated-stacking polarity workflow is assumed without a validated rule.
- **Module electrical-quality checks:** differential-voltage abnormality may require HOLD, abnormal handling, balancing, and repeated verification until acceptable or otherwise dispositioned.
- **Cooling airtightness:** initial correction/tightening and retest may be followed, for persistent NG, by HOLD, leak investigation, rework, and repeated testing.
- **Electrical testing:** an NG may open an abnormal case and HOLD. Review may select retest, replacement, rework, or another action. Persistent failure may end in an authorized concession or scrap/reject.
- **Pack airtightness:** correction, retest, troubleshooting, rework, and further retest may be required.
- **End-of-line pack testing:** initial NG may be retested; persistent NG may enter the abnormal-case workflow.
- **Final visual/finished-goods inspection:** replacement of some components may require verification in an earlier or specialized process.

The domain must support non-linear cross-process verification:

```text
Corrective or Rework Action
            ↓
Required Verification Process
```

Examples include bracket replacement/welding requiring Pack Airtightness verification, or cooling-component replacement requiring Cooling Airtightness verification. These examples demonstrate capability requirements; they are not finalized executable rules.

## Stable codes and localization

Stored engineering values, trace codes, barcodes, internal IDs, and machine identifiers remain language-independent. Business logic and relationships use stable, language-independent identity or domain codes. Human-readable labels are localized separately.

For example:

```text
stable code: AIR_LEAK
en label:   Air Leak
id label:   Kebocoran Udara
```

Business logic must never depend on a translated display label.

## Phase 2F synthetic reference stories

The persistent demo data is deliberately smaller than a real manufactured product. Each of three packs has one module and two cells, which keeps forward and reverse traversal understandable without implying real production quantities. `DEMO_ALPHA` follows prepare → assemble → verify → release; `DEMO_BETA` reuses the same generic process definitions but follows prepare → verify → assemble → release.

`PACK-DEMO-ALPHA-PASS` demonstrates a clean PASS history without a nonconformance. `PACK-DEMO-ALPHA-RETEST` preserves an original numeric NG, simple correction, separate PASS retest, verification, and CONTINUE disposition without an abnormal case. `PACK-DEMO-BETA-ESCALATED` demonstrates optional escalation, replacement/retest actions, PASS verification, and separate historical dispositions. The removed `COMP-DEMO-OLD` and active `COMP-DEMO-NEW` relationships preserve a fictional replacement at `SENSOR-01`.

These are direct persistence fixtures for learning and later queries, not executable workflow policy. All codes, timestamps, quantities, limits, measurements, and descriptions are invented for this public portfolio.

## Phase 2G query semantics

Forward genealogy recursively returns every descendant relationship from a trace code; reverse genealogy recursively returns every ancestor relationship. Neither traversal assumes unit types or fixed depth. Current mode means the relationship has no `removedAt`. Historical mode includes both active and removed rows. Point-in-time support follows:

```text
installedAt <= T
AND (removedAt IS NULL OR removedAt > T)
```

Traversal carries visited unit identities to terminate safely if malformed cyclic data exists. Position history orders all `GenealogyRelation` rows for one parent and logical position, so `COMP-DEMO-OLD` remains historically connected while `COMP-DEMO-NEW` is the one current `SENSOR-01` occupant.

Process history and quality history remain separate. Execution status describes whether work ran; inspection outcome describes quality. Attempts are chronological rows rather than rewritten state. NC reconstruction joins the original NG evidence to ordered cases, actions, linked retests, verification inspections, and all dispositions. A composed traceability view returns these focused collections together without flattening them.

The integrity validator checks graph and cross-row meanings that individual database constraints cannot fully express. It does not replace the deferred Phase 2D/2E service rules for specification immutability, atomic inspection/result creation, outcome calculation, exactly-one-result enforcement, lifecycle transitions, NG-origin validation, action requirements, verification acceptance, effective disposition, cross-process rules, or authenticated actors.

## Phase 4 read semantics

The Phase 4 hero read begins from any traceable unit, not only a pack. Descendant traversal exposes evidenced children; ancestor traversal lets a cell, component or material discover higher-level units and packs where current or historical `GenealogyRelation` rows support that path. The UI/API must distinguish current, removed, historical and point-in-time relationships and must identify bounded or cycle-skipped traversal as partial.

Genealogy/material history answers which units were related and during which interval. Process history answers which execution attempts occurred and retains execution method/status/configuration context. Quality history answers which versioned inspection and typed evidence produced PASS/NG. Nonconformance context answers which directly linked NC, case, action, verification and disposition records exist. These collections may cross-link but must never be merged into one inferred overall unit state. No NC is not PASS, PASS is not process completion, and a completed process is not proof of quality acceptance.

The current schema has no generic `TraceableUnit` lifecycle status, so Phase 4 must not invent one. Likewise, descendant units do not inherit a pack's product-model field in API contracts; such ancestry may be navigated but is not persisted unit identity. Empty collections represent no available record, while unavailable computation and partial graph traversal use explicit metadata rather than misleading zeroes or completeness claims.

Phase 4D implements these genealogy semantics with bounded reads. Current scope includes only relations without `removedAt`; historical scope includes all persisted relation evidence and is not a claim that all edges coexisted; point-in-time scope includes installation and excludes the removal boundary. A relation removed exactly at `T` is inactive at `T`. Traversal can branch across multiple historical parents and never fabricates a single ancestor path.

Direct parent/child counts describe relationships under the requested scope and support progressive expansion. Depth or edge limits and detected cycles make the response partial explicitly. The selected unit remains identified independently from returned parent/child nodes. Section record counts on unit detail communicate evidence availability only: zero inspections is not PASS, zero NCs is not proof of accepted quality, and execution count is not a lifecycle state.

## Authenticated actor boundary

The application user is a separate security identity, not a traceable manufacturing unit or a free-text operator name. The minimal fictional roles are `ADMIN`, `QUALITY`, `PRODUCTION`, and `ENGINEERING`; their permission bundles are defined in `docs/ARCHITECTURE.md`. Roles grant eligibility to request an operation, while domain services remain responsible for valid state transitions and evidence relationships.

Phase 3B provides the stable internal `User.id`, fixed role, and active/disabled state needed for attribution, but intentionally added no actor foreign keys to Phase 2 tables. Phase 5 inspection persistence retains the authenticated inspector through a restrictive user relationship; later deactivation, renaming, or role changes do not rewrite historical attribution. Manufacturing execution, action/rework, verification, and disposition actors remain with their future domain mutation services. Actor links add accountability without replacing or mutating append-oriented event histories.
