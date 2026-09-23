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

**Status: NEXT / NOT STARTED**

- Next.js, React, and TypeScript foundation
- NestJS foundation
- PostgreSQL development foundation
- Basic project structure
- i18n-ready frontend architecture with English as the canonical language

Phase 1 will evaluate and select a maintained Next.js-compatible i18n solution for the actual framework version and architecture. It does not require complete translations for all planned locales.

## Phase 2 — Database & Synthetic Manufacturing Model

**Status: PLANNED**

- Physical schema design and relational constraints
- Migrations
- Synthetic seed data
- Product models
- Configurable process routes
- Synthetic genealogy

## Phase 3 — Authentication & RBAC

**Status: PLANNED**

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
