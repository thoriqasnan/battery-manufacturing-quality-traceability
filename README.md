# Battery Manufacturing Quality & Traceability System

An independent public portfolio application that will simulate battery-manufacturing quality, traceability, inspection, nonconformance, rework, and analytics workflows.

> This project is an independent portfolio simulation inspired by general battery-manufacturing quality workflows. All products, identifiers, specifications, thresholds, production records, users, and operational data are fictional and synthetically generated.

## Project status

**Phase 0 — Discovery & Architecture: COMPLETE**

| Phase 0 decision area | Status |
| --- | --- |
| 0A Manufacturing Domain Map | VALIDATED |
| 0B Product Definition | VALIDATED |
| 0C Public/Synthetic Boundary | VALIDATED |
| 0D MVP & Feature Map | VALIDATED |
| 0E Domain/Data Architecture | VALIDATED |
| 0F Technical Architecture | VALIDATED |

**Status:** Phase 1 — Modern Full-Stack Foundation (**VERIFIED COMPLETE**).

Phase 1A through Phase 1F are **VERIFIED COMPLETE**. Automated regression and final manual acceptance passed for the frontend, backend, local PostgreSQL and Prisma connectivity, internationalization and RTL behavior, responsive layout, full-stack health integration, unavailable-backend handling, and recovery without a page refresh.

**Next:** Phase 2 — Database & Synthetic Manufacturing Model (**NOT STARTED**).

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

Only the minimal frontend, internationalization, backend, browser-to-health integration, PostgreSQL development configuration, and Prisma data-access foundations exist. Local PostgreSQL and Prisma connectivity have been verified, but no physical domain schema, migration, seed, or data-backed application behavior has been implemented.

## Scope boundaries

This project is not a clone of, or integration with, a real manufacturing execution system. It is not an ERP, WMS, or production scheduling system. It must never contain real company manufacturing data, confidential specifications, proprietary workflows, credentials, or internal system details.

PLC and machine integration, real MES integration, supplier portals, IoT streaming, predictive maintenance, native mobile apps, AI defect prediction, RAG/LLM assistants, and computer-vision inspection are outside the MVP.

## Documentation map

- [Product definition](docs/PRODUCT.md)
- [Domain model and workflows](docs/DOMAIN.md)
- [Technical architecture](docs/ARCHITECTURE.md)
- [Security and synthetic-data boundary](docs/SECURITY_AND_SYNTHETIC_DATA.md)
- [Implementation roadmap](ROADMAP.md)

## Learning goals

The project is intended as a progressive transition from foundational full-stack development to modern full-stack architecture. Learning goals include TypeScript, React within Next.js, NestJS, REST API design, PostgreSQL, Prisma, relational modeling, authentication versus authorization, internationalization, RTL-aware UI design, testing, Docker, CI/CD, deployment, and modular architecture.

The project should remain deliberately incremental: later phases add production engineering without overengineering the foundation.
