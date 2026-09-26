# Web Frontend

The frontend foundation for the Battery Manufacturing Quality & Traceability System. It uses Next.js, React, TypeScript, Tailwind CSS, the App Router, ESLint, and `next-intl`.

Phase 3F adds the selected modern industrial enterprise SaaS authentication experience: session bootstrap, login, logout, in-memory CSRF handling, and explicit recoverable errors. Phase 3G extends it with the approved role-aware application shell, responsive navigation, safe identity presentation, and future-page placeholders.

## Local development

From `apps/web`:

```bash
cp .env.example .env.local
npm run dev
```

`NEXT_PUBLIC_API_BASE_URL` is the public browser-side API origin. It must use HTTP or HTTPS and must not contain credentials. Authentication requests use `credentials: include`; the browser owns the host-only `bmqt_session` HttpOnly cookie and frontend JavaScript never reads it.

Then open:

- [http://localhost:3000](http://localhost:3000) for canonical English
- [http://localhost:3000/id](http://localhost:3000/id) for Bahasa Indonesia

The locale switcher stores the selected locale in a cookie. English and Bahasa Indonesia have complete authentication messages; the other declared locales use English fallback messages. Arabic applies right-to-left document direction and the login layout uses direction-safe logical spacing.

On load, the frontend checks `GET /auth/session` before showing authenticated content. Login uses `POST /auth/login`; logout uses `POST /auth/logout` with the session-bound CSRF token held only in React memory. No password, session credential, or CSRF token is stored in local/session storage or a URL. Unexpected bootstrap/login/logout failures use recoverable user-facing states without exposing backend details.

Authenticated navigation is grouped into Overview, Operations, Quality, Engineering, and Administration. It is derived from the server-established session role using the Phase 3E permission vocabulary; this improves usability but is not a security boundary. The API remains authoritative, and `ADMIN` has no implicit domain-superuser behavior. Desktop uses a persistent sidebar; mobile uses a keyboard-contained, Escape-dismissible drawer. Logical layout keeps Arabic RTL structurally usable.

Workspace routes currently contain localized readiness placeholders only. Dashboard metrics, traceability search, charts, records, and domain forms remain Phase 4 or later and are not simulated by the shell.

## Validation

```bash
npm run lint
npx next typegen
npx tsc --noEmit
npm run test:auth
npx next build --webpack
```

Phase 3I manual acceptance passed responsive desktop/mobile layout, the role-aware shell and drawer, English and Indonesian presentation, Japanese and Arabic English fallback, Arabic RTL structure, keyboard interaction, refresh recovery, navigation, login, and logout. The framework-native `src/app/favicon.ico` contains the original BQ mark at 16, 32, and 48 pixels; its asset and App Router integration passed, while tab rendering must be rechecked on a real deployment origin because local Safari continued to show its generated/cached localhost glyph. No reusable demo credentials are tracked or documented.
