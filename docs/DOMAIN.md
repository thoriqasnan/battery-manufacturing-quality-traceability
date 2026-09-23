# Domain Model and Workflow Requirements

This document defines the validated conceptual domain. It intentionally does not finalize PostgreSQL tables, keys, columns, or Prisma models; those belong to Phase 2 database design. Entity names may evolve as the implementation is refined.

## Separation of concerns

The model keeps configuration, execution, history, and decisions conceptually separate.

| Concern | Conceptual entities and responsibilities |
| --- | --- |
| Configuration | Product Model, Process Definition, Process Route, Inspection Specification |
| Execution | Physical/material units, Pack, Module, Cell, Component/material units, Process Execution, Inspection |
| History | Genealogy and assembly events, measurements, process history, quality history, nonconformance history, action/rework history |
| Decision | Abnormal Case, corrective action, disposition, required verification, final disposition |

## Products and routing

A Product Model is configuration; a physical Battery Pack is an executed unit. They must remain separate concepts.

Process routes are configurable per product model. Synthetic product models may have different process ordering, assembly structures, inspection specifications, and execution methods. The design must not encode a universal linear route or scatter product-specific conditionals throughout business logic.

A Process Definition describes configuration. A Process Execution records what happened to a physical/material unit. Likewise, an Inspection Specification is distinct from an actual Inspection and its result history.

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

## Inspection model

Inspection supports multiple value types:

- Numeric
- Boolean
- Categorical
- Text or notes

Inspection scope may be a cell, module, pack, or component/material unit. Quality cannot be represented as one boolean field: specifications, measurements, observations, outcomes, abnormalities, verification, and final disposition are distinct concepts.

Later passing rework, retest, or reinspection must append new history; it must not overwrite earlier inspection or NG records.

## Abnormal Case / Nonconformance

An Abnormal Case represents a managed decision workflow, not one universal rework path. It must be capable of retaining:

- Affected unit
- Originating process or inspection
- Reason
- Status
- Action history
- Engineering and quality decisions
- Verification history
- Final disposition

Conceptual handling includes HOLD, correction, rework, component replacement, balancing, escalation, retest/reinspection, required verification, return or escalation to incoming quality, concession, scrap/reject, and continuation after accepted verification.

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
