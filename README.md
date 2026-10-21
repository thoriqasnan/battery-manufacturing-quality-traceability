# Battery Manufacturing Quality & Traceability System

An independent public portfolio application that will simulate battery-manufacturing quality, traceability, inspection, nonconformance, rework, and analytics workflows.

> This project is an independent portfolio simulation inspired by general battery-manufacturing quality workflows. All products, identifiers, specifications, thresholds, production records, users, and operational data are fictional and synthetically generated.

## Project status

**Phase 0 — Discovery & Architecture: COMPLETE**

| Phase 0 decision area        | Status    |
| ---------------------------- | --------- |
| 0A Manufacturing Domain Map  | VALIDATED |
| 0B Product Definition        | VALIDATED |
| 0C Public/Synthetic Boundary | VALIDATED |
| 0D MVP & Feature Map         | VALIDATED |
| 0E Domain/Data Architecture  | VALIDATED |
| 0F Technical Architecture    | VALIDATED |

**Earlier checkpoint:** Phase 3 — Authentication & RBAC (**VERIFIED COMPLETE**).

Phase 1A through Phase 1F are **VERIFIED COMPLETE**. Automated regression and final manual acceptance passed for the frontend, backend, local PostgreSQL and Prisma connectivity, internationalization and RTL behavior, responsive layout, full-stack health integration, unavailable-backend handling, and recovery without a page refresh.

Phase 2A through Phase 2H are **VERIFIED COMPLETE**. The final manual acceptance confirmed the five applied migrations with no drift, deterministic idempotent seeding, forward/reverse and current/historical traceability, replacement/process/quality/nonconformance histories, all nine integrity checks, 10 focused traceability tests, and the complete Phase 2 regression.

**Current:** Phase 3 — Authentication & RBAC, Phase 4 — Manufacturing Dashboard & Traceability, and Phase 5 — Quality Inspection System are **VERIFIED COMPLETE**. Phase 5 closure includes accepted inspection-entry and reviewer Safari evidence, guarded final regression, database/reference integrity, security review, and documentation/change-inventory reconciliation. Phase 6 — Nonconformance & Rework is the next documented roadmap phase and remains planned / not started.

## Local quick start

With PostgreSQL 17 and the ignored local environment files already configured, use separate terminals:

```bash
# PostgreSQL readiness
brew services list
pg_isready -h localhost -p 5432
```

```bash
# API terminal
cd apps/api
node --env-file=.env ./node_modules/.bin/nest start --watch
```

```bash
# Frontend terminal
cd apps/web
npm run dev
```

Verify `curl -i http://localhost:3001/health`, then open [http://localhost:3000/en](http://localhost:3000/en). The API command loads `apps/api/.env` explicitly; merely creating that file does not make Nest load it. See [Local Development and Manual Testing](docs/LOCAL_DEVELOPMENT_AND_TESTING.md) for first-time setup, safe database checks, fictional acceptance accounts, reviewer samples, troubleshooting, and the Safari checklist.

## Planned MVP

The hero capability is **Pack Traceability / Product Genealogy**. The planned MVP feature areas are:

1. Authentication & RBAC
2. Manufacturing Dashboard
3. Pack Traceability
4. Product Genealogy
5. Quality Inspection
6. NG / Nonconformance / Rework Management
7. Quality Analytics

Internationalization, security, responsive design, testing, and production readiness are cross-cutting requirements, not separate feature areas.

## Planned technology direction

- Frontend: Next.js, React, TypeScript, Tailwind CSS, next-intl — Phase 1A and 1E foundations implemented
- Backend and integration: NestJS, TypeScript, REST API, restricted development CORS, and a frontend health client — Phase 1B and 1F foundations implemented
- Data access: Prisma — Phase 1D tooling and lazy NestJS provider implemented
- Database: PostgreSQL — Phase 1C development configuration contract established
- Repository: a simple monorepo containing `apps/web` and `apps/api`

The repository includes the Phase 2 relational model and deterministic synthetic dataset, Phase 3 authentication/RBAC, and the verified Phase 4 dashboard, search, Unit Detail, genealogy, and direct Process/Quality/Nonconformance history read surfaces.

## Scope boundaries

This project is not a clone of, or integration with, a real manufacturing execution system. It is not an ERP, WMS, or production scheduling system. It must never contain real company manufacturing data, confidential specifications, proprietary workflows, credentials, or internal system details.

PLC and machine integration, real MES integration, supplier portals, IoT streaming, predictive maintenance, native mobile apps, AI defect prediction, RAG/LLM assistants, and computer-vision inspection are outside the MVP.

## Documentation map

- [Product definition](docs/PRODUCT.md)
- [Domain model and workflows](docs/DOMAIN.md)
- [Technical architecture](docs/ARCHITECTURE.md)
- [Quality inspection architecture and contracts](docs/QUALITY_INSPECTION.md)
- [Security and synthetic-data boundary](docs/SECURITY_AND_SYNTHETIC_DATA.md)
- [Local development and manual testing](docs/LOCAL_DEVELOPMENT_AND_TESTING.md)
- [Implementation roadmap](ROADMAP.md)

## Learning goals

The project is intended as a progressive transition from foundational full-stack development to modern full-stack architecture. Learning goals include TypeScript, React within Next.js, NestJS, REST API design, PostgreSQL, Prisma, relational modeling, authentication versus authorization, internationalization, RTL-aware UI design, testing, Docker, CI/CD, deployment, and modular architecture.

The project should remain deliberately incremental: later phases add production engineering without overengineering the foundation.
