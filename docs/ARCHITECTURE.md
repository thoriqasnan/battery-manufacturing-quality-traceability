# Technical Architecture

This document records validated technical direction and current foundation evidence. Phase 1A through Phase 1F and Phase 1 are verified complete following automated regression and final manual acceptance. Phase 2 is next and has not started; physical schema and production infrastructure do not yet exist.

## System shape

The project will use a simple monorepo:

```text
apps/
  web/       # Phase 1A Next.js foundation
  api/       # Phase 1B NestJS foundation
docs/
```

The validated stack is:

| Layer | Direction |
| --- | --- |
| Frontend | Next.js, React, TypeScript, Tailwind CSS |
| Backend | NestJS, TypeScript, REST API |
| Data access | Prisma |
| Database | PostgreSQL |

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

The physical schema is deferred to Phase 2. Phase 0 defines conceptual boundaries only. Database design must preserve separation between configuration and execution, internal identities and trace codes, specifications and observations, current state and append-only history, and actions and decisions.

### Development configuration contract

- PostgreSQL is the development relational database.
- The future API connection uses `DATABASE_URL` with the shape `postgresql://USER:PASSWORD@HOST:PORT/DATABASE`.
- `apps/api/.env.example` contains synthetic placeholders and remains trackable; real `.env` variants are ignored.
- Development database and role names must be project-specific and non-sensitive.
- Production credentials must never be committed or reused for local development.
- NestJS does not load environment files or open a database connection during startup, and health checks do not depend on database readiness.
- Phase 1D uses Prisma ORM 7.10.0 with `@prisma/adapter-pg` and the `pg` driver. The ESM client is generated to an ignored application-local directory.
- `PrismaService` initializes its client lazily from `DATABASE_URL`, so missing or unavailable PostgreSQL does not prevent the API or health endpoint from starting.
- Tables, constraints, indexes, transactions, migrations, and the physical manufacturing model remain deferred to Phase 2.

The minimal Prisma schema contains only a generator and PostgreSQL datasource; it defines no models. Final manual acceptance verified PostgreSQL 17.11 on `localhost:5432`, the project-specific development role and database, a successful connection reporting the expected database and user, and live Prisma connectivity using `npx prisma db execute --stdin` with `SELECT 1;`. These checks created no Phase 2 tables.

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
