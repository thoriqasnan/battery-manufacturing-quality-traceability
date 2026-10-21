# Security and Synthetic-Data Policy

This policy is the source of truth for the public-data boundary and baseline security expectations.

## Public portfolio disclaimer

> This project is an independent portfolio simulation inspired by general battery-manufacturing quality workflows. All products, identifiers, specifications, thresholds, production records, users, and operational data are fictional and synthetically generated.

The system must not present itself as a real company MES, reproduce confidential operational materials, or imply integration with real production systems.

## Prohibited content

Never add any of the following to the repository, documentation, fixtures, screenshots, issues, or demos:

- Private company or customer names
- Real production serial numbers or barcodes
- Internal product codes
- Internal supplier identities
- Employee information
- Internal screenshots or spreadsheets
- Company URLs or endpoints
- Real MES APIs, schemas, or database details
- Proprietary SOPs, work instructions, approval forms, or abnormal-workflow documents
- Confidential specifications, limits, or thresholds
- Real manufacturing records
- Secrets, API keys, tokens, or passwords

Do not copy or reproduce any real company's forms or workflows. General domain concepts must be expressed as fictional, synthetic portfolio behavior.

## Allowed synthetic content

The project may use:

- Fictional product models
- Generated trace codes
- Generic component and process names
- Synthetic thresholds and measurements
- Fictional suppliers such as Supplier A, Supplier B, and Supplier C
- Generated users
- Generated production, inspection, genealogy, and abnormal-case records
- General manufacturing and quality concepts

Synthetic content should be unmistakably fictional, internally consistent enough for testing, and free of patterns that resemble copied real production data.

Phase 5G completed the separate configurable deterministic synthetic-data generator while preserving the small reference acceptance seed. It uses unmistakably synthetic namespaces that cannot collide with reference fixtures, refuses unsafe/destructive scope, and generates no real identifiers, specifications, people, customers, or proprietary workflow details. `docs/SYNTHETIC_TEST_DATA.md` publishes only curated known-good examples and scenarios, not bulk identifier dumps.

Phase 5G-1 fixes that safety foundation before persistence exists. Generated plans require an explicit safe `SYN5G_*` base namespace plus a deterministic seed digest, reject `DEMO` and unsafe identities, and attach a versioned canonical ownership fingerprint. Prefix resemblance alone never authorizes reuse or deletion. Future mutation is restricted to the explicitly supplied `battery_quality_traceability_test` database and the established live exact-name guard; dry-run planning never connects. Reset, truncate, reseed, broad cleanup, incompatible overwrite, and implicit development fallback are prohibited.

Phase 5G-2A implements the first mutation boundary for only a deterministic product model and bounded SMALL-profile PACK units. Guard verification occurs before Prisma construction, and the same explicit URL is used by both. Namespace-scoped transactional locking, exact ID/public-code/field fingerprints, preflight collision refusal, bounded batches, and exact-plan cleanup confirmation protect ownership. Cleanup refuses dependent or unowned records and deletes only regenerated exact IDs; no prefix deletion or shared-reference mutation exists. Isolated testing restores zero generator rows, preserves the 2/16 reference product/unit counts, and retains integrity 9/9.

Phase 5G-2B applies that boundary to deterministic MODULE, CELL, COMPONENT, MATERIAL, and genealogy rows. The versioned plan fingerprint covers exact endpoints, positions, intervals, and timestamps; relationship preflight checks deterministic IDs and the composite schema identity. Cleanup verifies the complete expected graph and refuses extra edges or downstream process/quality/NC/action dependencies before deleting exact edges and units. The guarded SMALL test restores zero generated rows and leaves the reference fixtures and 9/9 integrity checks unchanged.

Phase 5G-2C adds exact generator-owned process definitions, route, steps, and executions without modifying shared reference configuration. Preflight verifies both deterministic and schema attempt identities before the transaction writes configuration or history. Cleanup refuses Inspection/NC dependants and unexpected unit/step/definition/route counts, then removes exact executions and configuration in dependency order. Guarded tests restore zero generated process rows and preserve reference counts and integrity 9/9.

Phase 5G-2D adds an exact quality-history ownership layer: five owned published specifications, four options, a disabled non-login attribution actor, and one result/submission for every inspection. Production parsing, evaluation, and request-fingerprint utilities remain authoritative. Preflight verifies exact public/schema identities and canonical fields before quality writes; incompatible history is never overwritten. Cleanup requires the exact plan fingerprint and refuses sessions, NC/action/verification dependants, incomplete aggregates, or ambiguous ownership before deleting in foreign-key order. The guarded suite restores zero generator rows, preserves shared users and `DEMO_*` quality history, creates no NC from NG, and retains integrity 9/9.

Phase 5G-2E applies the same exact-plan boundary to NC lifecycle evidence. Only nine explicitly selected scenario packs receive NCs; 14 other NG/retest histories remain NC-free, proving there is no automatic conversion. Deterministic source inspection/execution links, statuses, events, resulting PASS inspections, verification context, and dispositions are fingerprinted and preflighted before lifecycle writes. Cleanup verifies exact nested dependency counts and refuses unexpected events before removing lifecycle rows in foreign-key order. Guarded tests restore zero generator records, preserve every shared reference lifecycle, and retain integrity 9/9.

Phase 5G-3A permits persistence only for the exact documented MEDIUM defaults (2,000 PACKs and their bounded connected histories); custom MEDIUM and LARGE persistence remain refused. The live exact-name guard, same-URL Prisma construction, namespace advisory lock, canonical preflight, 100-row writes, and exact-fingerprint cleanup remain mandatory. Ownership reads are independently bounded at 500 rows so scale does not require weakening exact verification. The controlled isolated run created 139,671 rows, proved a zero-create exact rerun and one-lifecycle partial recovery, then removed exactly those rows. Generator-owned residuals were zero and reference integrity remained 9/9.

Phase 5G-3B reused the same exact guarded plan for one temporary measurement session. Application reads and `EXPLAIN ANALYZE` operated only on `battery_quality_traceability_test`; plan capture ran inside a read-only transaction and no inspection or lifecycle mutation was used for measurement. Exact cleanup removed the complete plan, final generator-owned product/unit/specification/submission/NC counts were zero, and reference integrity remained 9/9. No production query, index, schema, cache, or database-maintenance operation changed.

Phase 5G-4 exposes only three stable fictional `DEMO_*` trace codes inside the existing authenticated, role-aware Traceability Search. Selecting one fills the existing public trace-code input without searching, navigating, mutating data, changing unrelated filters, or exposing credentials or internal UUIDs. It adds no anonymous access, authorization bypass, route, or API; temporary `SYN5G_*` generated identities are not published as reviewer samples.

Phase 5G-5 final review reconfirms that every generator mutation receives one explicit URL, passes the live exact-name `battery_quality_traceability_test` guard before Prisma mutation, and cannot fall back to development. SMALL and the exact documented MEDIUM profile are the only persistence modes; LARGE remains planning-only. Cleanup verifies the exact plan fingerprint, canonical identities, complete owned graph, and absence of unexpected dependants before deleting exact IDs in dependency order—never by namespace prefix. Final isolated counts for generator product/unit/specification/submission/NC anchors are zero, reference integrity is 9/9, and no credential, anonymous route, UUID-bearing public response, RBAC bypass, production query, schema, or automatic-NC behavior was introduced by Phase 5G.

## Authentication and session principles

Phase 3D implements the selected first-party session transport: 256-bit opaque tokens in host-only HTTP-only cookies, SHA-256 digests in PostgreSQL, eight-hour absolute expiry, and explicit revocation. Cookies use `SameSite=Lax`, `Path=/`, matching expiration, and `Secure` in production without a `Domain` attribute. Unsafe cookie-authenticated requests require a session-bound HMAC CSRF token in `X-CSRF-Token` and an exact `FRONTEND_ORIGIN` match. Phase 3E adds default-deny server-side permission enforcement; frontend visibility is never a security boundary.

Authorization trusts only the role loaded from the active database user through the validated server session. Client-supplied role or permission claims are ignored. Every non-public route must declare required permission metadata, and `ADMIN` uses the same explicit permission mapping as every other role without a superuser bypass.

Phase 5 preserves that default-deny boundary and adds a separation of duties. Phase 5B-2 explicitly assigns `inspection-specification:manage` to `ENGINEERING`; the existing `inspection:write` permission remains assigned to `QUALITY`. `ENGINEERING` manages acceptance configuration, while `QUALITY` records evidence against published versions. `ADMIN` does not acquire either capability implicitly. Inspection services derive inspector attribution only from the authenticated server session and never accept it from request input.

Phase 5H final review covers tracked and untracked Phase 5 files and confirms no committed credential or environment file, database-guard fallback, prefix-only cleanup, unauthorized quality route, public UUID/private-data exposure, RBAC/session/CSRF/CORS weakening, unsafe schema drift, or automatic production NC behavior. The guarded isolated database finishes with zero generator anchors and reference integrity 9/9.

The final pre-commit safety review additionally identified and closed a runtime confirmation gap in the quality and NC cleanup entry points. Both now require the literal `CLEANUP` operation and exact plan fingerprint before Prisma construction, guard connection, advisory locking, or mutation; any wrong, missing, malformed, or mismatched confirmation returns `PLAN_CONFIRMATION_MISMATCH`. Database-free refusal tests and the guarded isolated persistence/cleanup suite verify the boundary without weakening exact ownership or deletion ordering.

Authentication implementation and future extensions must continue to follow these rules:

- Passwords are never stored or logged in plaintext; use a current password-hashing algorithm with reviewed parameters and unique salts.
- Authentication failures are generic where account-specific detail would enable enumeration.
- Secrets and security configuration come from validated environment configuration and never enter Git.
- Only unmistakably synthetic demo accounts may be seeded or documented. Do not publish usable passwords in tracked files; demo credential delivery must use ignored local configuration or an explicit safe setup mechanism.
- Raw session identifiers, password hashes, credentials, and sensitive authentication details never appear in API responses or logs.
- Server-side authentication and authorization checks apply even when the frontend hides or disables an action.

Phase 3C selects maintained `argon2` with centralized Argon2id parameters and a 12–128-code-point password policy. Hashing, verification, dummy-hash timing mitigation, generic credential failures, and rehash detection are implemented behind focused backend services. Production credential lifecycle remains future work. Local manual acceptance uses development-only `npm run dev:users`, which accepts a temporary environment-supplied password, provisions only four fixed fictional accounts through the same hash service, revokes their sessions on rerun, refuses production, and creates no HTTP registration surface. Phase 3H adds a minimal production-only login limiter of ten attempts per client address per minute with bounded process-local state and a generic response; distributed deployments require shared edge/gateway limiting and deliberate trusted-proxy configuration.

The database constraint rejects blank `passwordHash` values, but the database cannot prove which algorithm produced a value. Application credential creation or changes must go through the centralized password-hash service. No users, password hashes, or reusable demo credentials are seeded. Phase 3F keeps the session-bound CSRF token only in frontend memory and never reads the HttpOnly session cookie or persists authentication material. Phase 3G derives navigation only from the safe server-established session role; its permission mirror is usability behavior and never replaces backend authorization. The shell renders username and role only—not UUIDs, tokens, session metadata, passwords, or CSRF material—and its placeholders contain no invented operational records or metrics.

Phase 3H adds explicit framing, content-type, referrer, and browser-capability response headers. The frontend CSP is intentionally limited to directives that do not require invented deployment origins or break the Next.js runtime. A nonce/hash-based script policy, deployment-specific connection sources, HSTS at confirmed HTTPS termination, shared rate limiting for multiple instances, and compatible fixes for deferred Prisma tooling advisories remain production-engineering boundaries rather than local assumptions.

## Security baseline for future implementation

Future implementation must address:

- Configuration through environment variables
- No secrets in Git
- Secure password hashing
- Secure authentication and session/token handling
- Server-side authorization, independent of UI visibility
- Request and input validation
- Safe error responses without sensitive internals
- Rate limiting where appropriate
- Database constraints and transactional integrity
- Dependency hygiene and review

Phase 3 implements and verifies the authentication, session, CSRF/origin, authorization, response-header, and login-abuse controls described above. Deployment-specific CSP tightening, HSTS after confirmed HTTPS termination, shared/edge limiting for multiple instances, trusted-proxy review, and favicon rendering on the eventual deployment origin remain explicit future production checks rather than local guarantees.

Phase 5E-6 Test D6.4 rechecks this boundary for Inspection Entry without mutating the active acceptance database. Manual browser evidence confirms that authentication material is absent from the UI and rendered errors, logout returns to the login boundary, and the protected inspection workspace remains unavailable afterward. Focused database-free tests confirm production and development cookie policy, matching logout clearing, session-bound CSRF, QUALITY-only inspection permission, frontend logout/session invalidation, recovery cleanup, safe `401` handling, and rejection of malformed or secret-bearing inspection responses. Existing prefix-isolated E2E coverage remains the durable evidence that logout revokes the server session and that unauthenticated, expired, revoked, inactive, CSRF-invalid, or permission-denied requests are rejected before domain persistence. Those database-writing suites were intentionally not rerun against the active manual-acceptance database.

## Review expectations

Before publishing documentation, examples, seeds, screenshots, logs, or demos:

1. Confirm all names, codes, users, suppliers, measurements, and records are synthetic.
2. Search for credentials, internal endpoints, personal information, and company-specific identifiers.
3. Confirm thresholds and specifications are invented rather than copied.
4. Ensure generalized workflows do not reproduce a proprietary SOP or approval chain.
5. Verify error examples and logs do not reveal secrets or private environment details.

If the provenance of any operational detail is uncertain, exclude or replace it with an explicitly fictional example.
