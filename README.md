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

**Next:** Phase 1 — Modern Full-Stack Foundation (**NOT STARTED**).

This repository currently contains architecture and product documentation only. No application has been scaffolded or implemented.

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

- Frontend: Next.js, React, TypeScript, Tailwind CSS
- Backend: NestJS, TypeScript, REST API
- Data access: Prisma
- Database: PostgreSQL
- Repository: a simple monorepo, eventually containing `apps/web` and `apps/api`

These technologies are validated architectural decisions, but none has been scaffolded in this repository yet.

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
