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

Phase 1A through Phase 1F and Phase 1 are **VERIFIED COMPLETE**. Phase 2 is next and has **NOT STARTED**.

## Phase 2 — Database & Synthetic Manufacturing Model

**Status: NEXT / NOT STARTED**

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
