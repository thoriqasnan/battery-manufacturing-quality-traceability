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

## Authentication and session principles

Phase 3D implements the selected first-party session transport: 256-bit opaque tokens in host-only HTTP-only cookies, SHA-256 digests in PostgreSQL, eight-hour absolute expiry, and explicit revocation. Cookies use `SameSite=Lax`, `Path=/`, matching expiration, and `Secure` in production without a `Domain` attribute. Unsafe cookie-authenticated requests require a session-bound HMAC CSRF token in `X-CSRF-Token` and an exact `FRONTEND_ORIGIN` match. Phase 3E adds default-deny server-side permission enforcement; frontend visibility is never a security boundary.

Authorization trusts only the role loaded from the active database user through the validated server session. Client-supplied role or permission claims are ignored. Every non-public route must declare required permission metadata, and `ADMIN` uses the same explicit permission mapping as every other role without a superuser bypass.

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

## Review expectations

Before publishing documentation, examples, seeds, screenshots, logs, or demos:

1. Confirm all names, codes, users, suppliers, measurements, and records are synthetic.
2. Search for credentials, internal endpoints, personal information, and company-specific identifiers.
3. Confirm thresholds and specifications are invented rather than copied.
4. Ensure generalized workflows do not reproduce a proprietary SOP or approval chain.
5. Verify error examples and logs do not reveal secrets or private environment details.

If the provenance of any operational detail is uncertain, exclude or replace it with an explicitly fictional example.
