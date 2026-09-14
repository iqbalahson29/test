# Quiz Platform

Multi-tenant quiz platform. Workspace members are ADMIN or STUDENT; superadmins
sit outside any workspace.

Authentication (email/password, emailed one-time codes, optional Google, trusted
devices, invitations) is specified in `docs/auth-implementation-plan.md`, with
its decisions in `docs/auth-decisions.md` and the current status and outstanding
work in `docs/auth-audit-and-implementation-plan-3-2026-09-12.md`. `docs/` is
gitignored, so those live only in a working checkout.

## Stack

- TypeScript, PostgreSQL, Prisma
- `apps/api` — NestJS backend
- `apps/web` — Vite + React frontend
- `packages/shared` — Zod schemas / enums shared by both apps

## Local setup

Everything below runs against local services only. Never copy hosted provider
secrets into a development environment — the setup step generates its own.

### 1. Services

`docker-compose.yml` at the repo root brings up PostgreSQL 16 and MinIO with the
credentials the generated development config expects:

```bash
docker compose up -d
```

PostgreSQL listens on `5432` (`postgres`/`postgres`, database `quiz_platform`);
MinIO listens on `9000` with `minioadmin`/`minioadmin` and its console on `9001`.
The API provisions the `quiz-platform` bucket on startup.

### 2. Configuration

The API refuses to start until every authentication secret is set, so the
required keys ship blank in `apps/api/.env.example`. Generate a local set:

```bash
pnpm --filter @quiz-platform/api env:init
```

That writes `apps/api/.env` (mode 600) with a fresh random value for
`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `OTP_PEPPER`, `AUTH_HASH_KEY` and
`MAIL_PAYLOAD_KEY`. It refuses to clobber an existing file unless you pass
`--force`, which backs the old one up first. Check a config at any time with:

```bash
pnpm --filter @quiz-platform/api auth:config-check
```

Two settings decide how sign-in behaves locally:

- `AUTH_OTP_MODE=off` (the default) signs in with a password only.
  Set it to `all` to exercise the email verification step.
- `MAIL_DRIVER=console` prints the OTP code to the API log, so no mail provider
  is involved. `recording` and `noop` are test-only and the validator rejects
  them outside `NODE_ENV=test`.

The SPA's Google settings are baked in at build time, so
`VITE_AUTH_GOOGLE_ENABLED` and `VITE_GOOGLE_CLIENT_ID` must agree with the API's
`AUTH_GOOGLE_ENABLED` and `GOOGLE_CLIENT_ID`. Both default to disabled.

### 3. Install, build and migrate

```bash
pnpm install
# The shared package is consumed in two formats: ESM by the SPA, CommonJS by the
# API and its Jest suites. Both are needed, and neither rebuilds automatically.
pnpm --filter @quiz-platform/shared build
pnpm --filter @quiz-platform/shared build:cjs
pnpm --filter @quiz-platform/api exec prisma generate
pnpm --filter @quiz-platform/api exec prisma migrate deploy
```

**After editing anything in `packages/shared/src`**, re-run both shared builds
before the change shows up in `apps/api` or a fresh `apps/web` build — there is
no build-graph tool wiring this automatically yet.

### 4. Demo accounts

```bash
pnpm --filter @quiz-platform/api db:seed
```

Creates three accounts, all with password `Password123`:

| Email | Role |
|---|---|
| `superadmin@quiz-platform.test` | superadmin (no workspace membership) |
| `admin@acme.test` | ADMIN in Acme School |
| `student@acme.test` | STUDENT in Acme School |

The seed refuses to run when `NODE_ENV=production` or `AUTH_RELEASE_STAGE` is
anything but `local`; a hosted target gets its first account from
`pnpm --filter @quiz-platform/api auth:bootstrap` instead. Seeded accounts start
with an unverified email, so with `AUTH_OTP_MODE=all` the first sign-in goes
through the emailed code printed in the API log.

### 5. Run

```bash
pnpm dev:api   # http://localhost:3000
pnpm dev:web   # http://localhost:5173 (proxies /api/* to the API)
```

### 6. Tests

The suites use their own isolated database and storage on ports 55432/59000 —
never the development services above:

```bash
docker run -d --name quiz-auth-test-pg -e POSTGRES_USER=auth_test \
  -e POSTGRES_PASSWORD=isolated-auth-tests -e POSTGRES_DB=quiz_auth_test \
  -p 127.0.0.1:55432:5432 --tmpfs /var/lib/postgresql/data postgres:16
docker run -d --name quiz-auth-test-minio -e MINIO_ROOT_USER=auth_test_storage \
  -e MINIO_ROOT_PASSWORD=isolated-auth-test-storage -p 127.0.0.1:59000:9000 \
  --tmpfs /data minio/minio server /data

DATABASE_URL=postgresql://auth_test:isolated-auth-tests@127.0.0.1:55432/quiz_auth_test \
  pnpm --filter @quiz-platform/api exec prisma migrate deploy

pnpm --filter @quiz-platform/api exec jest --runInBand                       # unit
pnpm --filter @quiz-platform/api exec jest --config test/jest-e2e.json --runInBand   # end to end
pnpm --filter @quiz-platform/api test:auth:browser                           # Playwright
pnpm --filter @quiz-platform/api lint                                        # read-only; lint:fix rewrites
```

To check the release artifact itself — that the built image actually starts and
serves authentication rather than merely building:

```bash
docker build -f apps/api/Dockerfile --target runtime -t quiz-api:local .
node apps/api/scripts/verify-runtime-image.mjs quiz-api:local \
  --database-url postgresql://auth_test:isolated-auth-tests@127.0.0.1:55432/quiz_auth_test
```

## Known environment quirks (documented so future-you isn't surprised)

- `apps/api`'s `nest build` incremental TypeScript cache produced incomplete
  `dist/` output a few times in this environment (some files' `.js` never
  emitted despite the compiler reporting success). Fixed by setting
  `"incremental": false` in `tsconfig.build.json` — if `dist/` ever looks
  partial again, `rm -rf dist` and rebuild.
- Prisma is deliberately pinned to `6.19.3`, not the newer `7.x` line. Prisma
  7's new `prisma-client` generator requires a WASM query compiler loaded via
  dynamic `import()`, which currently breaks under Jest/ts-jest in a plain
  CommonJS NestJS project (a live upstream issue, not something fixable from
  our config). Prisma 6 uses the classic, stable `prisma-client-js` generator
  with no driver-adapter requirement. Revisit the upgrade once that settles.
- `packages/shared` ships compiled CommonJS output (`dist/`), not raw `.ts`
  source — it needs both `build` and `build:cjs` re-run after
  every source change, in both formats (see step 3 above). It used to point `main`/`types`
  straight at `src/index.ts`; that quietly worked only because Vite's bundler
  resolution is lenient, and broke as soon as `apps/api` (strict `nodenext`
  + a real Node runtime, not a bundler) consumed it.
