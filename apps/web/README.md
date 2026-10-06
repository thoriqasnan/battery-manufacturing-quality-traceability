# Web Frontend

The frontend foundation for the Battery Manufacturing Quality & Traceability System. It uses Next.js, React, TypeScript, Tailwind CSS, the App Router, ESLint, and `next-intl`.

Phase 3F adds the selected modern industrial enterprise SaaS authentication experience: session bootstrap, login, logout, in-memory CSRF handling, and explicit recoverable errors. Phase 3G extends it with the approved role-aware application shell and responsive navigation. Phase 4E replaces the Overview placeholder with the evidence-backed operational dashboard.

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

The authenticated Overview requests `GET /dashboard/overview` with the existing cookie session and renders persisted inventory, product-model, process, inspection, nonconformance, and bounded recent-activity evidence. It includes loading, retry, forbidden, zero, empty and unavailable states. A `401` returns to the established login experience. The Trace a Unit form stores typed and pasted input in canonical uppercase immediately, preserves the 1–128 safe-character validation contract, trims on submission, and navigates with the normalized query to the planned traceability route; search results are not implemented in Phase 4E. Other workspace routes remain localized placeholders.

Phase 4F replaces the Traceability placeholder with an authenticated client for `GET /traceability`. An absent query performs the documented bounded browse; optional canonical uppercase trace-code exact/prefix search, unit type, and direct product-model code filters remain URL-driven with 25-row numbered pagination. Clear returns to browse and browser history restores prior criteria. Results show only persisted trace code/type, nullable directly assigned model, recorded time, nullable latest direct activity, and exact-match context—never an invented unit status. True zero results retain the criteria and empty message but omit pagination rather than showing `Page 1 of 0`.

Result links target `/[locale]/traceability/[traceCode]`. Phase 4G replaces the former placeholder at that authenticated route with runtime-validated Unit Detail and bounded ancestor/direct-child genealogy. Current, historical, and timezone-qualified as-of scope remain URL-addressable; related trace codes continue traversal through the same route. Identity and direct evidence counts do not infer health, completion, quality outcome, or inherited product context. Phase 4H-4 adds strict typed clients for the three operational history APIs. Phase 4H-5 integrates Process and Quality History, and Phase 4H-6 adds independently loaded direct-unit Nonconformance History with lifecycle filtering and distinct retained evidence groups. Phase 4H-7 adds test-only integration verification for section-local failure/Retry and populated-sibling preservation; discovery found no production defect and production code remained unchanged.

Phase 4I verifies the integrated responsive, semantic, accessibility, locale, and RTL architecture. Traceability Search keeps its filter form stacked through intermediate widths and activates the four-column form only at `xl`. Overview process `COMPLETED` now uses neutral styling; green remains reserved for explicit PASS/current evidence, red for explicit NG/critical evidence, amber for warning/historical evidence, and neutral treatment for lifecycle states such as process `COMPLETED` and NC Closed/Resolved. Revision 1 applies the same safe breakpoint contract to Unit Detail Quick Search without changing its typography, validation, normalization, navigation, or bidi behavior.

The application-controlled as-of editor uses `DD/MM/YYYY, HH:mm` semantic segments with valid auto-advance and a synchronized bounded chooser, never a native `datetime-local` picker. The entered value is browser-local wall-clock time and Apply converts it to a timezone-qualified absolute ISO instant before requesting genealogy evidence. Scope/apply transitions retain meaningful browser history without scrolling to the top. Locale changes preserve query state and use a bounded transient in-memory viewport handoff across the root locale-layout remount. A compact Unit Detail trace search reuses Phase 4F uppercase normalization and search URLs. English and Indonesian Phase 4G copy are complete; registered fallback locales remain intentional, while Arabic retains RTL layout with LTR-isolated identifiers/editing and bidi-isolated timestamps.

## Validation

```bash
npm run lint
npx next typegen
npx tsc --noEmit
npm run test:auth
npx next build --webpack
```

Phase 3I manual acceptance passed the role-aware shell. Phase 4E automated verification and manual browser acceptance passed. Accepted revisions include immediate canonical uppercase Trace Code storage for typing and paste, isolated locale-formatted generated timestamps within Arabic RTL, and mobile-header priority that preserves the complete Overview context while retaining an accessible compact language selector. Phase 4F automated verification and Safari acceptance passed browse/search/filter and URL-history behavior, zero results, its then-placeholder nested route, mobile cards, English/Indonesian/fallback presentation, and Arabic RTL identifiers/timestamps. Phase 4G automated verification and Safari acceptance passed persisted identity/counts, current/historical/as-of genealogy, related-unit traversal, the segmented as-of editor, query/history and viewport preservation, quick search, mobile presentation, localization, and RTL. Phase 4H-5 automated and browser acceptance passed direct-unit Process and Quality History, typed inspection evidence, outcome filtering, independent pagination/failure/Retry behavior, Genealogy independence, direct empty histories, responsive cards, localization/RTL, and the final Quick Search typography at desktop, intermediate, and 375×812 widths. Phase 4H-6 acceptance passed direct-unit NC lifecycle filtering, simple/escalated retained evidence, related-unit navigation, independent errors/Retry, responsive nested disclosures, localization/RTL, native keyboard operation, and exact disclosure-state preservation across locale remounts. Phase 4H-7 required no additional browser acceptance: it closed deterministic failure-isolation coverage only, changed no production code, and relied on the underlying behavior accepted in 4H-5 and 4H-6. Phase 4I targeted acceptance passed Traceability Search at 1024×768 and approximately 1100×800 in English and at intermediate Arabic RTL widths. Unit Detail Quick Search Revision 1 passed those intermediate checks plus wide desktop in English and Arabic, retaining readable prose, usable controls, LTR technical values, and no horizontal overflow. Phase 4J final acceptance passed the integrated English hero journey, browser Back/Forward and scope restoration, Arabic RTL locale/disclosure handoff and related-unit navigation, responsive keyboard-visible/privacy sanity, and corrected as-of replacement evidence. For `MODULE-DEMO-ALPHA-RETEST-01` in Jakarta, `11/01/2026 17:00` serialized to `2026-01-11T10:00:00.000Z` and showed the cells plus old component; `19:00` serialized to `12:00Z` and showed the cells plus its replacement. Existing labelled native controls, focus-visible treatment, drawer focus containment, alerts/statuses, and disclosure keyboard semantics remain intact; no automated screen-reader validation is claimed. English and Indonesian remain the complete Phase 4 UI message sets; other registered locales intentionally use English fallback, with Arabic retaining RTL page structure. The framework-native `src/app/favicon.ico` contains the original BQ mark at 16, 32, and 48 pixels; its asset and App Router integration passed, while tab rendering must be rechecked on a real deployment origin because local Safari continued to show its generated/cached localhost glyph. No reusable demo credentials are tracked or documented.
