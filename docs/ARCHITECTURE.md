# Technical Architecture

This document records validated technical direction for future implementation. Phase 1 has not started, and the described applications, modules, database, and infrastructure do not yet exist.

## System shape

The project will use a simple monorepo:

```text
apps/
  web/       # planned Next.js application
  api/       # planned NestJS application
docs/
```

The validated stack is:

| Layer | Direction |
| --- | --- |
| Frontend | Next.js, React, TypeScript, Tailwind CSS |
| Backend | NestJS, TypeScript, REST API |
| Data access | Prisma |
| Database | PostgreSQL |

Microservices are not justified. Nx and Turborepo will not be introduced unless a later concrete requirement warrants their cost.

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

Controllers should handle transport concerns, while services coordinate business rules. Core rules should not be placed in controllers or tightly coupled to Prisma query details.

Potential domain boundaries are authentication, users, products/configuration, manufacturing, traceability, quality, and analytics. These are directions rather than finalized NestJS module or folder names.

## Data architecture

Prisma is the selected ORM and data-access tool, but it does not replace PostgreSQL knowledge. The implementation should explicitly exercise tables and rows, primary and foreign keys, one-to-many and many-to-many relationships, unique constraints, indexes, transactions, migrations, and relational modeling.

The physical schema is deferred to Phase 2. Phase 0 defines conceptual boundaries only. Database design must preserve separation between configuration and execution, internal identities and trace codes, specifications and observations, current state and append-only history, and actions and decisions.

## Internationalization architecture

Internationalization is a foundation-level, cross-cutting requirement.

- Canonical source and fallback locale: English (`en`)
- Planned locales: `en`, `zh-CN`, `de`, `ko`, `ja`, `ar`, `id`, `hi`
- Arabic (`ar`) requires RTL-aware layout behavior
- User-facing strings should use translation keys/resources rather than scattered hard-coded text
- Locale preference should be persisted appropriately
- Dates and numbers should use locale-aware formatting where appropriate
- Responsive components must tolerate different translated text lengths
- Relevant frontend tests should cover locale switching, fallback, formatting, and RTL behavior
- Raw engineering values and identifiers stay stable and language-independent
- Domain logic uses stable codes; localized labels are presentation data

The precise Next.js i18n library is deliberately undecided. It will be selected during the relevant Phase 1 subphase after evaluating maintained options against the actual Next.js version and architecture. Full translation of all eight planned locales is not required during initial scaffolding. Runtime automatic machine translation is not a core dependency unless a later explicit decision adds it.

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
