# Local Development and Manual Testing

This guide starts the local BMQT portfolio application for development and browser acceptance. All documented sample records and accounts are fictional. Never use production credentials or production manufacturing data.

Phase 5 local startup, inspection-entry acceptance, and curated reviewer exploration are verified complete. Phase 6 is planned and not started; this guide does not describe or imply Phase 6 mutation workflows.

## Quick start

Use three terminals from the repository root.

1. Confirm PostgreSQL 17 is running:

   ```bash
   brew services list
   pg_isready -h localhost -p 5432
   ```

2. Start the API with its ignored environment file loaded explicitly:

   ```bash
   cd apps/api
   node --env-file=.env ./node_modules/.bin/nest start --watch
   ```

3. Start the frontend:

   ```bash
   cd apps/web
   npm run dev
   ```

4. Verify the API, then open Safari:

   ```bash
   curl -i http://localhost:3001/health
   ```

   Open [http://localhost:3000/en](http://localhost:3000/en).

The expected local origins are frontend `http://localhost:3000`, API `http://localhost:3001`, and PostgreSQL `localhost:5432`.

## Prerequisites

- macOS with Homebrew for the commands in this guide;
- PostgreSQL 17 (`postgresql@17`);
- a recent Node.js release that supports `--env-file` (Node.js 20.9 or newer is appropriate for the current Next.js toolchain);
- npm;
- Safari for the required manual browser checks;
- the repository checked out locally.

Install JavaScript dependencies independently because this repository has no root workspace package:

```bash
cd apps/api
npm ci

cd ../web
npm ci
```

These commands install dependencies only. They do not migrate, seed, or reset PostgreSQL.

## PostgreSQL 17

Inspect Homebrew and the live server separately:

```bash
brew services list
pg_isready -h localhost -p 5432
```

`brew services list` describes the service manager state; `pg_isready` is the authoritative readiness check for the configured host and port. A service shown as started can still fail readiness if PostgreSQL did not finish starting or its cluster has a problem.

Start or restart the established Homebrew service when needed:

```bash
brew services start postgresql@17
brew services restart postgresql@17
pg_isready -h localhost -p 5432
```

Do not run `initdb`, `pg_resetwal`, reset, truncate, or reseed commands to repair an unknown cluster. Inspect the PostgreSQL logs and cluster identity before any recovery operation.

## Development database and environment files

The local application database is:

- database: `battery_quality_traceability_dev`
- application role: `battery_quality_app`
- host and port: `localhost:5432`

Create the untracked API environment file once:

```bash
cd apps/api
cp .env.example .env
chmod 600 .env
```

Edit `apps/api/.env` locally and replace both placeholders:

- `DATABASE_URL` must target `battery_quality_traceability_dev` using the local application role;
- `AUTH_CSRF_SECRET` must be an independent random local value of at least 32 characters;
- `FRONTEND_ORIGIN` should remain `http://localhost:3000` for this setup.

Never commit `.env`, print its values, or place credentials in command history or documentation. The repository ignores `.env` files while retaining `.env.example` templates.

Create the frontend environment file once:

```bash
cd apps/web
cp .env.example .env.local
```

Its public, non-secret `NEXT_PUBLIC_API_BASE_URL` should be `http://localhost:3001`.

### Verify database identity safely

Load the ignored API environment only into the current shell and query public connection identity fields:

```bash
cd apps/api
set -a
source .env
set +a
psql "$DATABASE_URL" -X -c "select current_database(), current_user, version();"
unset DATABASE_URL FRONTEND_ORIGIN AUTH_CSRF_SECRET
```

Confirm the database and role are exactly the development identities above before any migration or seed operation. Do not use `battery_quality_traceability_test` for interactive browser acceptance, and never point local commands at an unidentified or external database.

### First-time schema and reference data only

Routine application startup does not run migrations or seed data. On a new, positively identified empty development database, load `apps/api/.env`, verify `current_database()` as above, and then use the repository's existing commands:

```bash
npx prisma migrate deploy
npm run db:seed
```

The deterministic reference seed is rerunnable and bounded to its known synthetic fixtures, but it is not part of every startup. Never use destructive reset or broad cleanup commands. If the database already contains the Phase 5 schema and curated samples, skip this section.

## Start the application

### API terminal

From `apps/api`:

```bash
node --env-file=.env ./node_modules/.bin/nest start --watch
```

This explicit loader is required. Nest does not automatically load `apps/api/.env`, and the Prisma client reads `process.env.DATABASE_URL` lazily on the first database-backed request. Consequently, `/health` may return `200 OK` while login fails if the API was started without the environment file.

The API listens on [http://localhost:3001](http://localhost:3001) unless `PORT` is deliberately overridden.

### Frontend terminal

From `apps/web`:

```bash
npm run dev
```

The frontend listens on [http://localhost:3000](http://localhost:3000). Use [http://localhost:3000/en](http://localhost:3000/en) for the English acceptance path.

### Readiness checks

```bash
pg_isready -h localhost -p 5432
curl -i http://localhost:3001/health
curl -I http://localhost:3000/en
```

Expected results are PostgreSQL accepting connections, API HTTP `200`, and a reachable frontend response. The API health endpoint proves the Nest process is alive; it does not independently prove that `DATABASE_URL` was loaded or that login/database reads work.

## Safari login

1. Open [http://localhost:3000/en](http://localhost:3000/en).
2. Sign in with the fictional QUALITY login identifier `accept_quality`.
3. Obtain the local acceptance password through the project's approved private channel. It is deliberately not tracked or documented.
4. Confirm the authenticated shell shows Traceability and Inspections for the QUALITY role.

If the account has not been provisioned, follow the development-only `npm run dev:users` procedure in `apps/api/README.md`. That operation changes local authentication records and revokes prior sessions, so run it only intentionally with an approved temporary password. Do not seed or reset the database merely to repair login.

If `/health` succeeds but login returns HTTP 500 with `DATABASE_URL is required before database access`, stop the API and restart it with the explicit `node --env-file=.env ...` command above. Do not print the connection string while diagnosing it.

## Traceability Search reviewer walkthrough

After login:

1. Choose **Traceability** in the application navigation.
2. Expand **Try a fictional sample**.
3. Choose one of the stable fictional reference scenarios:

   | Trace code | Expected story |
   | --- | --- |
   | `PACK-DEMO-ALPHA-PASS` | Clean connected genealogy, completed process evidence, and PASS inspection history. |
   | `PACK-DEMO-ALPHA-RETEST` | Retained numeric NG followed by a separate PASS retest, correction/retest/verification evidence, and component replacement history. |
   | `PACK-DEMO-BETA-ESCALATED` | Visual NG followed by PASS, escalated NC, rework, retest, verification, replacement evidence, and retained dispositions. |

4. Confirm sample selection fills only the normal trace-code input.
5. Select **Search**, then open the matching Unit Detail result.

The sample affordance does not automatically search, navigate, submit a mutation, clear unrelated filters, or bypass authentication.

## Phase 5G-4 manual Safari checklist

**Acceptance status: PASSED — user-confirmed in Safari.** The checks below passed without a blocking UI defect. Screenshot evidence confirms that the three sample cards stack vertically at 375×812 without visible overflow.

- The fictional-sample affordance is visible without dominating Traceability Search.
- All three curated scenarios are present and their descriptions match the table above.
- Each sample fills the exact trace-code input without automatically searching.
- Unit-type and product-model filters remain unchanged after sample selection.
- Manual trace-code entry and Search still work.
- Search results navigate to the correct Unit Detail.
- English and Indonesian reviewer copy is understandable.
- In Arabic, the page remains RTL while technical trace codes remain readable LTR.
- Disclosure and sample controls work with Tab, Shift+Tab, Enter, and Space, with visible focus.
- Desktop and approximately 375px mobile layouts have no truncation or horizontal overflow.
- No credentials, internal UUIDs, or real manufacturing data are displayed.

The recorded acceptance covers this affordance only and does not replace future browser gates for unrelated behavior.

## Stop and restart

Stop the API and frontend development servers with `Ctrl+C` in their respective terminals. This does not stop PostgreSQL or alter data.

Restart the application by running the same explicit commands again:

```bash
cd apps/api
node --env-file=.env ./node_modules/.bin/nest start --watch
```

```bash
cd apps/web
npm run dev
```

PostgreSQL normally remains managed by Homebrew. Stop it only when no other local project needs it:

```bash
brew services stop postgresql@17
```

After a machine restart or database-service restart, repeat `pg_isready` before starting browser acceptance.

## Troubleshooting summary

| Symptom | Check | Safe response |
| --- | --- | --- |
| PostgreSQL service says started but readiness fails | `pg_isready -h localhost -p 5432` and PostgreSQL logs | Do not reset the cluster; diagnose the established service. |
| `/health` is unavailable | API terminal and port 3001 | Restart the API with explicit environment loading. |
| `/health` is 200 but login is 500 | API log for the missing `DATABASE_URL` message | Restart with `node --env-file=.env ...`; do not expose the URL. |
| Browser reports a CORS failure | `FRONTEND_ORIGIN` and the exact frontend URL | Keep both at `http://localhost:3000`; restart the API after environment changes. |
| Frontend reports API unavailable | `.env.local`, API health, and port 3001 | Restore the documented URL and restart the frontend. |
| Login is rejected normally | Acceptance account status/password through the private channel | Do not reset or reseed manufacturing data; provision accounts only through the documented development command. |
