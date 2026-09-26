# Technical Architecture

This document records validated technical direction and current foundation evidence. Phases 1, 2, and 3 are verified complete following automated regression and their required manual acceptance. Phase 3 implements authentication and authorization contracts, user/role persistence, Argon2id credential verification, server-managed session transport, backend RBAC enforcement, frontend authentication, the role-aware application shell, and security/integration hardening. Phase 4 dashboard and traceability feature UI, analytics, and production infrastructure do not yet exist.

## System shape

The project will use a simple monorepo:

```text
apps/
  web/       # Phase 1A Next.js foundation
  api/       # Phase 1B NestJS foundation
docs/
```

The validated stack is:

| Layer       | Direction                                |
| ----------- | ---------------------------------------- |
| Frontend    | Next.js, React, TypeScript, Tailwind CSS |
| Backend     | NestJS, TypeScript, REST API             |
| Data access | Prisma                                   |
| Database    | PostgreSQL                               |

Phase 1A provides Next.js 16.3.5, React 19.2.8, TypeScript 5, Tailwind CSS 4, the App Router, and ESLint under `apps/web`. The application remains a minimal responsive foundation page; Phase 1E adds internationalization and Phase 1F adds only the health integration described below. No feature dashboard, authentication, or database-backed frontend behavior has been introduced.

Phase 1B provides NestJS 12.0.4, TypeScript 6.0.3, an ESM REST API foundation, and focused Vitest coverage under `apps/api`. The only API behavior is `GET /health`, which returns a stable service-status response. No database, authentication, domain modules, microservices, or external observability integration has been introduced.

Microservices are not justified. Nx and Turborepo will not be introduced unless a later concrete requirement warrants their cost.

## Frontend/backend integration

Phase 1F establishes the first browser-to-API path: the localized frontend calls the existing database-independent `GET /health` endpoint and renders checking, connected, or unavailable state. A small health helper owns native `fetch` and verifies HTTP success plus the expected `{ "status": "ok", "service": "api" }` values before the UI can report connected. It treats network errors, malformed JSON, and unexpected responses as unavailable.

`NEXT_PUBLIC_API_BASE_URL` is the single public frontend API-origin contract. The example value is `http://localhost:3001`; missing or invalid configuration fails safely in the status UI, with no implicit production localhost fallback. NestJS CORS accepts the one configured `FRONTEND_ORIGIN`, defaults to `http://localhost:3000` only outside production, rejects non-origin values, and requires explicit configuration in production. Wildcard CORS is not enabled. Phase 3D enables credentials only for that exact origin so the browser can send the host-only session cookie.

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

## Authentication and authorization architecture

Authentication answers **who the user is**. The NestJS authentication boundary validates credentials at login, creates and resolves a session, and exposes a small authenticated-principal shape containing an internal user ID, synthetic display identifier, active state, and role. It does not decide which manufacturing or quality operation the user may perform.

Authorization answers **what that authenticated user may do**. NestJS remains authoritative: protected routes declare permission metadata, a global/default-deny authentication guard resolves the principal, and a permission guard evaluates the required permission against a central role-to-permission policy. Controllers should declare policy requirements and pass the authenticated actor into services; they should not contain scattered role conditionals. Domain services must still enforce object state, relationships, and workflow invariants because a permission alone cannot make an invalid mutation valid.

### Role and permission contract

The initial model uses one role per fictional user and four small, stable role bundles. Permissions are stable code-level capabilities; display labels may be localized. `ADMIN` is a system-administration role, not an implicit bypass for domain decisions.

| Capability / permission | ADMIN | QUALITY | PRODUCTION | ENGINEERING |
| --- | :---: | :---: | :---: | :---: |
| View dashboard (`dashboard:view`) | ✓ | ✓ | ✓ | ✓ |
| View traceability (`traceability:view`) | ✓ | ✓ | ✓ | ✓ |
| Record manufacturing execution (`manufacturing:record`) |  |  | ✓ |  |
| Create/complete inspections (`inspection:write`) |  | ✓ |  |  |
| Create a nonconformance (`nonconformance:create`) |  | ✓ | ✓ |  |
| Update a nonconformance workflow (`nonconformance:update`) |  | ✓ |  |  |
| Record engineering/rework action (`engineering-action:perform`) |  |  |  | ✓ |
| Record verification (`verification:perform`) |  | ✓ |  |  |
| Record disposition (`disposition:perform`) |  | ✓ |  |  |
| Manage synthetic users/roles (`users:manage`) | ✓ |  |  |  |

This matrix is the Phase 3 authorization contract, not implementation of Phase 4–7 workflows. A later requirement should add or adjust a permission deliberately rather than using ad hoc role checks or granting `ADMIN` universal domain mutation. Multiple roles per user, field-level ACLs, tenant/site scopes, approval hierarchies, and workplace-derived authorization structures are out of scope.

### Browser session transport

The selected transport is a server-managed opaque session. After successful login, NestJS issues a high-entropy opaque identifier in a host-only cookie with `HttpOnly`, `Secure` in deployed environments, `SameSite=Lax`, `Path=/`, and bounded expiry. Only a one-way digest of the identifier is stored with session metadata in PostgreSQL. The browser sends the cookie with credentialed API requests; JavaScript cannot read it. Development may omit `Secure` only for local HTTP. Production should keep the web and API on same-site HTTPS origins; Phase 3D exact-origin credentialed CORS permits the configured frontend origin only.

This was selected over browser-stored bearer/JWT access tokens because the application is a first-party browser client and benefits from lower credential exposure to XSS, straightforward logout/revocation, and understandable operational behavior. Stateless JWTs would complicate immediate revocation without providing a needed distributed-service benefit. The server-side session store is the source of truth; logout revokes the current session and expires its cookie, and user deactivation or security-sensitive role/password changes revoke applicable sessions.

Cookie authentication introduces CSRF risk. Authenticated unsafe requests must require a session-bound synchronizer CSRF token sent in a custom header and validate the request `Origin` against the configured frontend origin. `SameSite=Lax` is defense in depth, not the only CSRF control. Login has no session-bound token yet, so it requires strict configured-origin validation; login rate limiting is added during hardening. XSS remains separately mitigated through normal output safety and security hardening; CSRF controls do not make XSS harmless.

### Authentication HTTP contracts

The implemented REST boundary is:

| Operation | Conceptual request | Successful result |
| --- | --- | --- |
| Login | `POST /auth/login` with synthetic login identifier and password from the configured frontend origin | `200`; creates session cookie and returns the safe current-user/session representation |
| Logout | `POST /auth/logout` with current cookie and CSRF proof | `204`; revokes the server session and expires the cookie; safe to repeat |
| Current session | `GET /auth/session` with current cookie | `200` with safe user, role, expiry, and a session-bound CSRF token |

Missing, expired, revoked, or otherwise invalid authentication produces `401` with a stable `UNAUTHENTICATED` code and no sensitive detail. An authenticated principal lacking a required permission produces `403` with stable `FORBIDDEN`. Login failures are generic and do not reveal whether a user exists, is inactive, or supplied the wrong password. Response DTOs never include password hashes, raw session identifiers, or internal security metadata.

### Frontend contract

The Next.js application models `bootstrapping`, `authenticated`, and `unauthenticated` explicitly, plus recoverable unexpected request failures. It restores state only through the current-session contract, submits login, and performs logout without reading the HttpOnly cookie. Phase 3G adds permission-aware navigation derived from that authenticated state and restrained unavailable states for disallowed destinations. Role-aware UI is usability only: direct API calls remain subject to NestJS authorization.

### Auditability and Phase 2 history

Future domain mutations receive the authenticated principal from the request boundary and persist its internal user identity as the actor where attribution is meaningful. In particular, inspections need an authenticated inspector; `ActionHistory` needs the action actor; and verification and disposition events need their authenticated actors. Manufacturing execution records should likewise retain the recording actor when Phase 4 introduces mutation services.

Actor references must preserve historical attribution if a synthetic user is later inactive or renamed; users referenced by history are not hard-deleted. An actor link supplements immutable event/history rows and does not authorize editing or overwriting them. Phase 3 establishes identity and policy infrastructure only—the deferred Phase 2D/2E lifecycle, calculation, verification, and disposition rules remain future quality/nonconformance service responsibilities.

### Phase 3B user persistence foundation

`User` is the minimal authentication identity root. It has an internal UUID, unique normalized `username`, required `passwordHash`, one `UserRole`, `isActive`, and creation/update timestamps. PostgreSQL constrains usernames to 3–64 lowercase ASCII letters, digits, dots, underscores, or hyphens, beginning with a letter or digit; human names and email addresses are not required identity fields. `passwordHash` stores only the self-contained modern password hash and rejects blank values; plaintext is never stored.

`UserRole` is a fixed PostgreSQL/Prisma enum containing `ADMIN`, `QUALITY`, `PRODUCTION`, and `ENGINEERING`. This directly represents Phase 3A's one-role-per-user contract while Phase 3E keeps permission bundles in centralized application policy. There are no dynamic role, permission, user-role join, tenant, site, or enterprise IAM tables. `isActive` persists the enabled/disabled state enforced by authentication and session resolution.

Migration `20260924000000_phase_3b_user_role_persistence` is additive and leaves all Phase 2 tables and migrations unchanged. No synthetic user is seeded. Development-only `npm run dev:users` provisions the four fixed fictional browser-acceptance users from a temporary environment-supplied password, refuses production execution, uses the centralized Argon2id service, and revokes those users' sessions on rerun; it exposes no HTTP registration path and tracks no reusable credential. Actor foreign keys are deferred until domain mutation services can populate them atomically; the stable `User.id` is ready to be referenced without prematurely altering every historical table.

### Phase 3C password authentication

`PasswordHashService` is the only cryptographic boundary. It uses maintained `argon2` with Argon2id and explicit centralized parameters: 19,456 KiB memory, two iterations, one lane, and a 32-byte output. The library generates a unique salt and encodes algorithm, version, parameters, salt, and hash in the stored PHC string, so no manual salt column exists. The service hashes policy-compliant new passwords, verifies candidates without logging credentials, and reports whether a stored hash uses obsolete parameters.

New credentials must contain 12–128 Unicode code points and cannot be entirely whitespace. There are no uppercase, lowercase, digit, or symbol composition rules. The minimum encourages passphrases; the maximum bounds untrusted input without rejecting long password-manager values. Password text is not trimmed or normalized because that would alter the credential.

`AuthenticationService.authenticateCredentials` trims and lowercases the username, looks up the `User`, verifies the candidate, rejects inactive accounts, and returns only internal ID, normalized username, role, and active state. Unknown users, incorrect passwords, and inactive users all throw the same `INVALID_CREDENTIALS` error and message. Unknown users still verify against a process-local randomly generated dummy Argon2id hash, reducing the most obvious account-existence timing difference without claiming complete side-channel elimination.

The hash service uses the library's parameter comparison to detect hashes requiring upgrade and also rejects non-Argon2id hashes as current. When parameters change, a future successful authentication or explicit credential-change transaction should generate a current hash and replace the old value with a compare-and-update write; failed authentication never changes it. Phase 3C provides detection but intentionally avoids an implicit database write inside the minimal credential-check operation.

Phase 3C adds no controller or externally reachable login endpoint, session record, cookie, CSRF behavior, logout/revocation, authentication/RBAC guard, or frontend behavior. Those remain Phase 3D and later work.

### Phase 3D session and transport implementation

`Session` is an additive persistence entity with a UUID primary key, required `User` relation, unique 64-character token digest, creation and absolute-expiration timestamps, and nullable revocation timestamp. Database checks require expiration after creation and revocation no earlier than creation. User deletion remains restricted. Indexed user/expiration paths support future account-wide revocation and expired-session cleanup without adding last-used or sliding-expiry state.

`SessionTokenService` generates 32 random bytes with the operating-system cryptographic source and encodes them as opaque base64url. NestJS sends the raw value only in the session cookie and stores only its SHA-256 hexadecimal digest for exact lookup. Password hashing is intentionally not used for high-entropy random session identifiers. The absolute session lifetime is eight hours; access does not extend it. Unknown, expired, revoked, or inactive-user sessions resolve to the same `UNAUTHENTICATED` boundary.

The host-only `bmqt_session` cookie has `HttpOnly`, `SameSite=Lax`, `Path=/`, expiry and Max-Age matching the server row, and `Secure` when `NODE_ENV=production`. No `Domain` attribute is set. Exact-origin credentialed CORS permits `GET`, `POST`, `OPTIONS`, content headers, and `X-CSRF-Token`; `FRONTEND_ORIGIN` remains the single configured browser origin.

The HTTP contract is now implemented:

| Operation | Behavior |
| --- | --- |
| `POST /auth/login` | Requires exact allowed `Origin`, validates the body, applies Phase 3C credential checks, creates a session, sets the cookie, and returns safe user data plus expiry and CSRF token; the opaque session token is never JSON. |
| `GET /auth/session` | Resolves the cookie digest and active user, returning safe identity, expiry, and the session-bound CSRF token; invalid session state returns `UNAUTHENTICATED`. |
| `POST /auth/logout` | Requires allowed `Origin` and, for a valid session, `X-CSRF-Token`; revokes the row and clears the cookie. Missing/already-invalid sessions clear safely, making repetition idempotent. |

CSRF tokens are HMAC-SHA-256 values derived from the session UUID with an independent `AUTH_CSRF_SECRET` of at least 32 characters. They are authorization-independent request proofs, not session credentials. The frontend obtains the value from login or current-session JSON, holds it outside persistent credential storage, and sends it in `X-CSRF-Token` on authenticated unsafe requests. The server verifies both exact configured `Origin` and constant-time token equality. A token from one session cannot validate another session. The environment example contains only a rejected `CHANGE_ME` placeholder; deployed/local operators must supply a private value outside Git.

Phase 3D itself added no permission metadata, role/permission evaluation, domain guards, or frontend login behavior. Phase 3E supplies backend RBAC and Phase 3F supplies frontend login/session behavior; Phase 3I subsequently accepted the live browser login, refresh, and logout lifecycle.

### Phase 3E authorization enforcement

Authorization uses stable permission strings and one centralized immutable `UserRole` mapping. The vocabulary is `dashboard:view`, `traceability:view`, `manufacturing:record`, `inspection:write`, `nonconformance:create`, `nonconformance:update`, `engineering-action:perform`, `verification:perform`, `disposition:perform`, and `users:manage`. This is application policy, not a dynamic permission database.

The role bundles remain exactly those documented in the Phase 3A matrix. All roles can read dashboard and traceability. `PRODUCTION` can record manufacturing and create nonconformances; `QUALITY` can write inspections, create/update nonconformances, and perform verification/disposition; `ENGINEERING` can record engineering/rework actions; `ADMIN` can manage users/roles. `ADMIN` receives no implicit override and cannot mutate domain records unless a future policy explicitly grants that permission.

NestJS applies three global guards in order:

1. `AuthenticatedSessionGuard` resolves the host-only cookie through the server-side session and attaches a safe actor plus internal session context.
2. `CsrfOriginGuard` requires exact origin and the session-bound CSRF header for protected unsafe methods; safe methods pass without CSRF.
3. `PermissionGuard` reads `@RequirePermissions(...)` metadata and requires every declared permission.

Routes must be explicitly `@Public()` or explicitly permission-protected. A non-public route with no required-permission metadata returns `403 FORBIDDEN`, which makes accidental omission default-deny. Authentication failures remain `401 UNAUTHENTICATED`; permission failures use the generic `403 FORBIDDEN`; CSRF/origin failures retain `403 SECURITY_CHECK_FAILED`. Authentication, request-integrity checks, and authorization remain distinct boundaries.

`@AuthenticatedActor()` exposes only `{ id, username, role, isActive }` to controllers and future domain services. The actor contains no password hash, session token/digest, session UUID, or CSRF material and is suitable for later inspector, execution, action, verification, and disposition attribution. Role values from headers, query strings, or request bodies are ignored; authorization always uses the server-loaded user attached to the validated session.

Phase 3E adds no production manufacturing/quality/admin endpoint and no actor foreign keys. Focused tests register test-only controllers to prove the policy infrastructure. Phase 3F supplies frontend login state, Phase 3G supplies role-aware navigation, and Phase 3I accepted both in real-browser use.

### Phase 3F frontend authentication

The frontend uses a small validated auth API boundary and React in-memory provider. Initialization calls credentialed `GET /auth/session` before protected content can render. A valid response becomes authenticated; `401` becomes unauthenticated; network, server, or malformed-response failures render an explicit retry state without pretending the user logged out. Refresh recovery always returns to the server session source of truth rather than browser token persistence.

Login sends JSON credentials with `credentials: include` and lets the browser manage `Origin`. Generic `401` failures reveal no account-specific detail. Successful login keeps only safe user/session metadata and the session-bound CSRF token in React memory. No password, raw session credential, or CSRF token enters local storage, session storage, a URL, or persistent JavaScript storage. Logout sends the in-memory token as `X-CSRF-Token`; success or an already-invalid session returns to the unauthenticated view, while an unexpected failure leaves the authenticated state visible with a recoverable notice.

The selected visual foundation is modern industrial enterprise SaaS: deep navy technical surfaces, cool-white content, strong restrained blue interaction states, slate neutrals, and semantic green/amber/red reserved for operational meaning. Desktop uses a balanced identity/login split with a high-contrast workspace badge and CSS-only industrial geometry. Mobile collapses to a focused single-column form; logical spacing preserves Arabic RTL safety. The real `next-intl` selector remains available, English is canonical/fallback, Bahasa Indonesia has complete auth copy, and other declared locales continue to use English fallback.

Form controls have visible labels, appropriate autocomplete values, comfortable touch height, keyboard/focus behavior, accessible generic errors, and a keyboard-operable password visibility control that preserves input. The branded bootstrap state uses polite status semantics and respects reduced-motion preferences. Phase 3F intentionally provides only a minimal authenticated transition; Phase 3G owns role-aware navigation and the full application shell. Phase 3I accepted the browser layout, RTL, refresh, login, logout, and keyboard behavior.

### Phase 3G role-aware application shell

The approved shell extends the Phase 3F visual system rather than introducing a separate template. A deep-navy desktop sidebar groups Overview, Operations, Quality, Engineering, and Administration; a restrained white header carries current-page context, the real locale selector, and safe authenticated identity. The reusable content layout supports an eyebrow, page title, optional description/actions, and main content region. Current content is intentionally limited to localized readiness or future-phase placeholders.

The frontend permission registry mirrors the Phase 3E vocabulary only to decide which navigation links are useful. It maps the server-established session role to explicit permissions and accepts no role or permission claims from route parameters, query strings, request bodies, or browser storage. `ADMIN` remains limited to dashboard/traceability read and user administration, with no implied production, inspection, nonconformance, or engineering mutation access. Hidden links never substitute for API authorization.

The authenticated provider lives above locale workspace pages so client navigation retains session state where the App Router permits. Root Overview and shallow workspace destinations use the same bootstrap gate: neither the sidebar nor protected content renders while session resolution is pending or unauthenticated. Future routes are placeholders only and introduce no fake dashboard values, manufacturing records, domain forms, search control, notifications, or synthetic API behavior; Phase 4 owns dashboard and traceability capability.

Below the desktop breakpoint, the persistent sidebar becomes a direction-aware modal drawer with a visible close control, backdrop dismissal, initial focus, contained Tab order, Escape handling, focus restoration, body-scroll containment, 44px targets, and reduced-motion behavior. Logical properties and locale-derived document direction place the drawer safely for Arabic RTL. Active destinations use both visual contrast and `aria-current`; a skip link, semantic navigation, visible focus rings, labelled locale/logout controls, and text labels alongside icons support keyboard and assistive-technology use. Phase 3I accepted the desktop/mobile transition, drawer interaction, keyboard behavior, role visibility, localized presentation, and Arabic RTL structure.

### Phase 3H security and integration hardening

The production route inventory is deliberately small. `GET /health` is `PUBLIC`. `POST /auth/login`, `GET /auth/session`, and `POST /auth/logout` are `AUTH CONTRACT SPECIAL CASE` routes on the explicitly public auth controller: login performs exact-origin validation and credential authentication; current-session resolves only the opaque cookie; logout performs origin, session-bound CSRF, revocation, and matching cookie clearing. Future production routes are `AUTHENTICATED + PERMISSION`: the global session, CSRF/origin, and permission guards execute in that order, and missing permission metadata fails closed. Current protected examples exist only in tests; no Phase 4 controller is exposed.

Login now has a minimal single-process production limiter: ten attempts per client address in a one-minute fixed window, with bounded memory and a generic `429 TOO_MANY_ATTEMPTS` response independent of username validity. Local and test environments keep it disabled for deterministic development. This is sufficient for the current single-instance portfolio boundary, not a claim of distributed abuse protection. A multi-instance deployment must enforce shared limiting at an edge/gateway or shared store and configure trusted proxy handling deliberately so the application receives a reviewed client address.

Both applications emit an explicit conservative header baseline: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, CSP `frame-ancestors 'none'`, `Referrer-Policy: no-referrer`, and disabled camera/geolocation/microphone permissions. The API additionally uses a deny-by-default resource CSP. The frontend limits CSP to safe framing/base/object directives because a nonce/hash strategy and `connect-src` require final deployment origins and Next.js runtime integration. HSTS belongs at the confirmed HTTPS termination boundary and is intentionally not emitted for local HTTP.

One focused E2E test traverses login → digest-backed session/cookie → current session → permission-protected read → CSRF-protected write → logout/revocation → subsequent `401`. A separate assertion confirms successful logins always issue independent session and CSRF values; existing sessions are not automatically revoked because concurrent sessions remain allowed by the selected architecture. Test fixtures use suite-owned usernames and cleanup, and the prior session-count assertion is scoped to its own prefix.

The dependency audit reports four high findings in backend Prisma CLI/tooling transitive dependencies. The recursive merge path is configuration tooling, and the MySQL advisories do not affect this PostgreSQL runtime; npm offers only a breaking Prisma 7-to-6 downgrade, which is rejected pending an upstream compatible update. Frontend Vitest/mocker development tooling was safely updated to 4.1.11, clearing its two moderate findings. These classifications do not dismiss the advisories: dependency audits must be repeated during Phase 8 production engineering and compatible upstream fixes adopted.

### Phase 3I manual acceptance and final reconciliation

User-operated browser acceptance passed invalid and valid login, password visibility, refresh-persistent authentication, logout and post-logout refresh, the expected navigation for all four roles, absence of unauthorized navigation items, desktop-to-mobile transition, drawer dismissal by control/backdrop/Escape, English and Indonesian presentation, Japanese and Arabic English fallback, Arabic RTL structure, and keyboard interaction. Automated coverage remains authoritative for destructive or impractical manual cases such as expired/revoked session handling, cookie attribute assertions, CSRF rejection, default-deny enforcement, and the complete backend role/permission matrix.

The App Router favicon is an original opaque deep-navy BQ mark stored as a conventional ICO with 16, 32, and 48 pixel images. Its structure, metadata integration, `image/x-icon` response, source-response equivalence, production-build inclusion, and direct Safari rendering passed. Safari tabs on the localhost origin continued to display Safari's generated/cached “L” glyph even though the repository and emitted metadata contain no such asset. This is recorded as non-blocking local-origin browser behavior; tab rendering must be rechecked on the eventual deployment domain.

Phase 3A through Phase 3I are verified complete. The security model remains bounded to the verified application behavior: HSTS after confirmed HTTPS termination, a stricter deployment-aware CSP, shared/edge rate limiting for multiple instances, trusted-proxy review, compatible upstream fixes for deferred Prisma tooling advisories, and deployment-origin favicon verification remain future production checks. Phase 4 dashboard and traceability functionality is next and has not started.

## Data architecture

Prisma is the selected ORM and data-access tool, but it does not replace PostgreSQL knowledge. The implementation should explicitly exercise tables and rows, primary and foreign keys, one-to-many and many-to-many relationships, unique constraints, indexes, transactions, migrations, and relational modeling.

Phase 2A begins the physical schema with configuration only. Database design continues to preserve separation between configuration and execution, internal identities and trace codes, specifications and observations, current state and append-only history, and actions and decisions.

The Phase 2A relational foundation contains:

- `ProductModel`, a configurable product type with a UUID identity, unique stable code, human-readable name and optional description, active state, timestamps, and one-to-many routes.
- `ProcessDefinition`, a reusable process definition with a UUID identity, unique stable code, human-readable name and optional description, active state, timestamps, and references from route steps.
- `ProcessRoute`, a product-owned route with a stable code, positive version, name and optional description, active state, timestamps, and a product-scoped unique code/version combination.
- `ProcessRouteStep`, an ordered route member that references one route and one process definition, records a stable `MANUAL`, `AUTOMATED`, or `HYBRID` execution method, and enforces a positive order unique within its route.

Route deletion cascades only to its configuration steps. Product-model and process-definition deletion is restricted while referenced. This subphase intentionally adds no physical units, process executions, inspections, nonconformances, genealogy, seeds, repositories, or database-backed endpoints.

### Phase 2B genealogy foundation

Phase 2B uses a normalized generic-unit design rather than separate pack, module, cell, and component tables. `TraceableUnit` gives every physical unit the same UUID identity, globally unique trace-code lookup, lifecycle timestamps, and a stable type of `PACK`, `MODULE`, `CELL`, `COMPONENT`, or `MATERIAL`. This keeps later process, quality, and traceability references from needing multiple nullable target foreign keys. Only a `PACK` has a required `ProductModel` relationship; PostgreSQL enforces that pack/non-pack distinction.

`GenealogyRelation` is a self-referencing association between a parent and child `TraceableUnit`. Parent and child indexes support forward and reverse traversal from the same source of truth. `installedAt` and nullable `removedAt` make relationships time-bounded: replacement closes the old row and inserts a new row rather than overwriting genealogy. An optional generic `positionCode` can identify a location inside a parent without embedding a company-specific assembly structure.

PostgreSQL rejects self-parent relationships and removal timestamps that are not later than installation. A child can have only one active direct parent, and a named parent position can have only one active child; historical closed relationships remain available. Foreign keys restrict deletion of referenced product models or traceable units so genealogy is not silently discarded. Full graph-cycle detection is intentionally deferred because it requires application/transaction logic beyond a simple row constraint.

This subphase adds no process execution/history, inspections, nonconformances, seed dataset, API endpoints, frontend behavior, authentication, or analytics.

### Phase 2C execution-history foundation

`ProcessExecution` represents one actual process occurrence for one `TraceableUnit`. It always references the performed `ProcessDefinition` and may also reference the exact `ProcessRouteStep` that configured it. A composite foreign key between route-step identity and process-definition identity prevents those two historical links from disagreeing. Executions do not infer their route from whichever product route is currently active.

Each row stores a positive `attemptNumber`, `startedAt`, optional `finishedAt`, and the small lifecycle enum `IN_PROGRESS`, `COMPLETED`, or `ABORTED`. `IN_PROGRESS` requires no finish timestamp; terminal statuses require one; and a finish cannot precede the start. The `(traceableUnitId, processDefinitionId, attemptNumber)` uniqueness constraint makes retries explicit without replacing earlier attempts.

`executionMethod` records the method actually used as a historical snapshot. This remains useful if route configuration later changes or the actual attempt differs from its configured method. Detailed measurements and PASS/NG outcomes are deliberately absent because they belong to Phase 2D quality evidence.

Indexes support chronological history per physical unit, process-definition history, route-step execution lookup, and status/time lookup. Referenced physical units and configuration records use restricted deletion so recorded history cannot be silently orphaned. Basic creation/update timestamps are present, while operator/user attribution remains deferred until the authentication and authorization model exists.

This subphase adds no inspection data, nonconformance/rework workflow, persistent seed data, API/UI behavior, analytics, authentication, or external machine integration.

### Phase 2D quality-inspection foundation

Phase 2D separates reusable `InspectionSpecification` configuration, actual `Inspection` events, and typed `InspectionResult` evidence. Specifications use a stable code plus positive version number; inspections reference the exact version row, so later versions do not redirect old evidence. A specification belongs to one `ProcessDefinition` and may narrow to a process-consistent `ProcessRouteStep`. It also fixes the expected result type and physical `TraceableUnitType` scope.

Numeric specifications may define independent lower/upper bounds and a stable engineering-unit code. Boolean specifications store an expected value. Categorical and visual specifications use normalized `InspectionSpecificationOption` rows with stable language-independent codes and acceptability flags. Text specifications carry no threshold configuration. No real or confidential criteria are stored.

Each completed inspection has `PASS` or `NG`, a positive attempt number, and an inspection timestamp. Its optional `ProcessExecution` must belong to the same physical unit and process definition. Retests append attempts under the same physical-unit/specification-version scope rather than replacing prior evidence. Execution lifecycle statuses remain independent from quality outcomes.

`InspectionResult` uses a constrained typed-value layout: exactly one numeric, boolean, option, or nonblank text value is permitted according to its result type. Composite foreign keys ensure that inspection type/scope/process matches its specification, the physical target matches the configured scope, and categorical/visual selections belong to the same specification and type. Indexes support histories by unit, specification, process execution, outcome, and time.

The persistence contract treats published or used specification versions and their options as immutable; changes create a new version. Because no quality service exists yet, preventing direct field mutation of used versions remains future service-layer validation. The service layer must also create the inspection and its required single result atomically and derive/verify `PASS` or `NG` against bounds, boolean expectations, or option acceptability. PostgreSQL currently enforces at most one result per inspection, but intentionally uses no trigger to require that result row. Phase 3A now defines the actor contract; persistence linkage remains deferred to later implementation subphases.

This subphase adds no nonconformance, abnormal-case, action/rework, disposition, persistent seed, API/UI, analytics, authentication, or machine-integration behavior.

### Phase 2E nonconformance and action-history foundation

`DefectCategory` provides reusable active/inactive classification with a stable language-independent code. `Nonconformance` records the quality problem against one `TraceableUnit`, a unique business-facing code, category, lifecycle status, and detection/resolution/closure timestamps. Its originating `Inspection` and `ProcessExecution` are optional because manual or future process observations may also create a nonconformance; when present, composite foreign keys require them to belong to the affected unit.

`NonconformanceStatus` (`OPEN`, `IN_PROGRESS`, `RESOLVED`, `CLOSED`) describes lifecycle only. PostgreSQL requires resolution/closure timestamps appropriate to that status and chronological within the row. Final decisions are separate `DispositionHistory` events using `CONTINUE`, `CONCESSION`, `RETURN_IQC`, or `SCRAP`, so revised decisions remain auditable rather than overwriting one field. `RETURN_IQC` is only a disposition code and introduces no supplier or incoming-quality workflow.

`AbnormalCase` is an optional one-to-many escalation boundary. A simple NC can proceed through correction/retest/verification without a case, while separate escalations can be recorded independently. `ActionHistory` appends generic `CORRECTION`, `REWORK`, `REPLACEMENT`, `RETEST`, `BALANCING`, or `ESCALATION` events. An action may link to a resulting inspection or relevant unit, but measurements stay in `InspectionResult`; physical replacement relationships stay exclusively in `GenealogyRelation`.

`Verification` links an NC—and optionally one of its actions—to an existing same-unit follow-up `Inspection`. This distinguishes performing an action from verifying evidence afterward. It does not constrain the verification inspection to the originating process, leaving cross-process verification possible without encoding a rule engine.

PostgreSQL enforces unique NC/case/category codes; source evidence and follow-up inspection unit consistency; abnormal-case/action NC consistency; verification action/NC/unit consistency; nonconformance lifecycle timestamps; abnormal-case chronology; and indexes for unit/status/category/source histories, chronological actions/cases/verifications, and disposition history.

The future service layer must validate that a source inspection is `NG`, determine when an NC or escalation is required, enforce allowed lifecycle transitions and cross-row chronology, ensure verification evidence is suitable (commonly a later acceptable inspection), apply action-type-specific requirements, choose the currently effective disposition without erasing prior decisions, and attach authenticated actors. Cross-process verification requirements also remain service/configuration rules. The Phase 2D deferred rules remain unchanged: prevent mutation of used specification versions/options, atomically create inspection/result, calculate/verify outcomes, require exactly one result, and attach inspector identity later.

This subphase adds no persistent seed data, API/UI, analytics, authentication, supplier/IQC workflow, cross-process rule engine, or external machine integration.

### Phase 2F deterministic synthetic dataset

`apps/api/prisma/seed.mjs` uses the generated Prisma client and PostgreSQL adapter already selected by the project. `npm run db:seed` regenerates and compiles the client before running the seed. Fixed seed-owned UUIDs, stable codes, and fixed UTC timestamps make identities and stories reproducible. Each known row is upserted by its seed-owned ID inside one transaction; reruns reconcile only those rows and never delete, truncate, or reset unrelated data.

The intentionally small graph contains `DEMO_ALPHA` and `DEMO_BETA`, four shared generic processes, two differently ordered routes, three packs with one demo module and two demo cells each, selected component/material relationships, and one closed-old/active-new component-position history. Fourteen execution records retain chronological route linkage and actual-method snapshots. Five fictional specification codes cover numeric, boolean, categorical, visual, and text evidence; their demo limits and values are not production parameters.

The three pack stories are: a clean PASS flow with no NC; a simple NG → correction → retest → PASS → verification → CONTINUE flow with no abnormal case; and an optional escalation with abnormal case, replacement/retest action history, PASS verification, and two retained dispositions. The seed directly constructs schema-valid persistence examples. It does not enforce immutable used specifications, atomic inspection creation, calculated outcomes, exactly-one-result semantics, NG-origin/lifecycle/action/verification/effective-disposition rules, cross-process rules, or authenticated actors; those remain service-layer work.

### Phase 2G traceability query architecture

`TraceabilityModule` is an internal NestJS module with a small `TraceabilityRepository`, `TraceabilityService`, and `TraceabilityIntegrityService`. It exports reusable services for future application layers but intentionally adds no controller or public endpoint. Stable trace codes are accepted at the boundary and resolved through the unique trace-code index; UUIDs remain internal relationship identities. An unknown code throws `TraceableUnitNotFoundError` instead of returning a misleading partial view.

Forward and reverse genealogy each use one understandable recursive PostgreSQL CTE. The forward query follows `parentUnitId → childUnitId`; reverse impact tracing follows `childUnitId → parentUnitId`. Neither assumes Pack → Module → Cell or a maximum depth. Each recursion carries a UUID array path and refuses to revisit a node, so malformed cyclic data terminates safely. Prisma tagged SQL binds trace-resolved UUIDs and timestamps as parameters; trace codes are never interpolated into SQL text.

Genealogy scope is explicit. `current` includes only `removedAt IS NULL`; `historical` includes active and removed relationships. The query contract also supports an `asOf` timestamp using `installedAt <= T AND (removedAt IS NULL OR removedAt > T)`, without adding a temporal engine or changing the schema. Position history reads `GenealogyRelation` chronologically, keeping it as the sole replacement source of truth.

Process history is ordered by execution start and preserves attempts, configured route/step context, lifecycle status, and the actual execution-method snapshot. `COMPLETED` is never interpreted as quality `PASS`. Quality history independently orders inspection attempts, retains NG and later PASS events, and returns type-safe numeric, boolean, categorical, visual, or text evidence with stable option codes. NC reconstruction uses bounded Prisma relation queries to preserve source evidence, optional cases, ordered actions and linked retests, verifications, and every disposition.

The complete traceability service composes identity, genealogy, process, quality, and NC results concurrently instead of flattening one-to-many relationships into a duplicated Cartesian result. Existing indexes support trace lookup, both genealogy directions, and time-oriented histories. This correctness-focused design is verified only against the small seed; production-scale work would need measured query plans plus API pagination, depth/result limits, and possibly caching. No speculative indexes were added. A separate large synthetic production generator and load testing remain future extensions.

The integrity validator adds application-level checks that span rows and graphs: cycle absence, active hierarchy and position coherence, route/process agreement, complete matching inspection results, retained NG plus separate PASS retests, verification unit/action context, NC history coherence, and the expected old-removed/new-active `SENSOR-01` replacement. It complements rather than duplicates PostgreSQL constraints.

### Phase 2H acceptance gate

The complete Phase 2A–2G diff was reviewed from the Phase 1 baseline commit. The five additive migrations remain fully applied, unmodified during Phase 2H, and drift-free. Two consecutive final seed runs retained the same documented count vector. Live evidence and all nine integrity checks passed, followed by Prisma validation/generation/status/drift, TypeScript, lint, 7 unit tests, 10 traceability integration tests, 1 E2E health test, production build, and diff checking.

The final review found no concrete correctness, data-integrity, security, performance, maintainability, or scope issue requiring a Phase 2H fix. The repository safety audit confirmed synthetic public data, ignored private environment configuration, no embedded credentials, parameterized raw SQL, no destructive seed behavior, and no Phase 3 implementation. The user then completed every manual acceptance item recorded in `ROADMAP.md`: migration readiness, two successful seed runs, live traceability/integrity evidence, focused traceability tests, and the grouped `npm run phase2:verify` regression all passed. Phase 2 is verified complete. Phase 3 has since added architecture contracts, identity persistence, credential verification, session transport, RBAC enforcement, and frontend authentication.

### Development configuration contract

- PostgreSQL is the development relational database.
- The future API connection uses `DATABASE_URL` with the shape `postgresql://USER:PASSWORD@HOST:PORT/DATABASE`.
- `apps/api/.env.example` contains synthetic placeholders and remains trackable; real `.env` variants are ignored.
- Development database and role names must be project-specific and non-sensitive.
- Production credentials must never be committed or reused for local development.
- NestJS does not load environment files or open a database connection during startup, and health checks do not depend on database readiness.
- `AUTH_CSRF_SECRET` is required when issuing or validating CSRF tokens and must be a private environment value of at least 32 characters; the tracked placeholder is deliberately rejected.
- Phase 1D uses Prisma ORM 7.10.0 with `@prisma/adapter-pg` and the `pg` driver. The ESM client is generated to an ignored application-local directory.
- `PrismaService` initializes its client lazily from `DATABASE_URL`, so missing or unavailable PostgreSQL does not prevent the API or health endpoint from starting.
- Phase 2A provides product/process configuration, Phase 2B physical units/genealogy, Phase 2C manufacturing execution history, Phase 2D quality-inspection configuration/evidence, Phase 2E nonconformance action/decision history, Phase 2F deterministic synthetic examples, and Phase 2G internal traceability/integrity queries. Phase 2H automated regression and manual acceptance passed; Phase 2 is verified complete.

All five ordered Phase 2 migrations through `20260923040000_phase_2e_nonconformance_action_history` remain applied locally and unchanged. Prisma reported no schema drift. Phase 2G live evidence reconstructed forward Pack → Module → Cell/material traversal, reverse Cell → Module → Pack traversal, historical-only old component ancestry, chronological replacement occupants, repeated process attempts, retained NG/PASS inspections, the simple NC without escalation, and the escalated case with both dispositions. All nine integrity checks passed. Two consecutive seeds completed successfully without duplicates. Prisma format/validate/generate, migration status, no-drift comparison, API TypeScript/lint, 7 unit tests, 10 focused database-backed traceability tests, 1 E2E test, production build, and `git diff --check` passed. The user completed the Phase 2H manual acceptance, so Phase 2A through Phase 2H and Phase 2 are verified complete.

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
