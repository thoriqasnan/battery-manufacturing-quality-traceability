# Web Frontend

The frontend foundation for the Battery Manufacturing Quality & Traceability System. It uses Next.js, React, TypeScript, Tailwind CSS, the App Router, ESLint, and `next-intl`.

This subproject contains a minimal localized foundation page and a small connection-status view for the NestJS health endpoint. Manufacturing features, database-backed behavior, and authentication are planned for later phases.

## Local development

From `apps/web`:

```bash
cp .env.example .env.local
npm run dev
```

`NEXT_PUBLIC_API_BASE_URL` is the public browser-side API origin. It must use HTTP or HTTPS and must not contain credentials. The application deliberately reports the API as unavailable when this required setting is absent or invalid; it does not silently use a production localhost fallback.

Then open:

- [http://localhost:3000](http://localhost:3000) for canonical English
- [http://localhost:3000/id](http://localhost:3000/id) for Bahasa Indonesia

The locale switcher stores the selected locale in a cookie. English and Bahasa Indonesia currently have complete foundation-page messages; the other declared locales use English fallback messages. Arabic still applies right-to-left document direction.

Run the API on `http://localhost:3001` to see the connected state. The status view validates the exact health response and provides a button to check again; network failures, non-success responses, malformed JSON, and unexpected response values are shown as unavailable without exposing technical details.

## Validation

```bash
npm run lint
npx tsc --noEmit
npm run build
```
