# Quiz Platform

Multi-tenant quiz platform (Admin / Teacher / Student roles). See
`.claude/plans` for the full foundation plan, or ask Claude to recap it.

## Stack

- TypeScript, PostgreSQL, Prisma
- `apps/api` — NestJS backend
- `apps/web` — Vite + React frontend
- `packages/shared` — Zod schemas / enums shared by both apps

## Local setup

### 1. PostgreSQL

This machine has no Docker or Windows-installer PostgreSQL, so a portable
PostgreSQL 16 build was extracted to `C:\pgsql` and initialized with its data
directory at `D:\pgsql\data` (outside the repo). It's a plain process, not a
Windows service — start/stop it manually:

```bash
# start
/c/pgsql/bin/pg_ctl.exe -D "D:/pgsql/data" -l "D:/pgsql/logfile.txt" -o "-p 5432" start

# stop
/c/pgsql/bin/pg_ctl.exe -D "D:/pgsql/data" stop

# status
/c/pgsql/bin/pg_ctl.exe -D "D:/pgsql/data" status
```

Credentials: user `postgres`, password `quizdevpass`, database `quiz_platform`,
port `5432` (see `apps/api/.env`).

Prefer Docker instead? `docker-compose.yml` at the repo root spins up Postgres
+ MinIO with different default credentials (`postgres`/`postgres`) — update
`apps/api/.env` to match if you switch.

### 2. MinIO (object storage, for `FILE_UPLOAD` questions)

Same story as Postgres — no Docker, so a portable `minio.exe` build was
downloaded to `C:\minio` with its data directory at `D:\minio-data`. It's
also a plain process:

```bash
# start (from C:\minio)
MINIO_ROOT_USER=minioadmin MINIO_ROOT_PASSWORD=minioadmin \
MINIO_API_CORS_ALLOW_ORIGIN="http://localhost:5173" \
./minio.exe server D:/minio-data --console-address :9001

# stop: just kill the process (find it via `netstat -ano | grep :9000`)
```

API at `localhost:9000`, web console at `localhost:9001` (credentials
`minioadmin`/`minioadmin`). The `quiz-platform` bucket is created
automatically by the API on startup (`StorageService.onModuleInit`) — no
manual `mc` setup needed. CORS is set via the `MINIO_API_CORS_ALLOW_ORIGIN`
env var at server startup, **not** the S3 `PutBucketCors` API — MinIO 501s
that specific call against the checksum trailer header newer AWS SDK v3
versions send by default, so it's not viable to configure CORS
programmatically the way the bucket itself is provisioned.

### 3. Install & generate

```bash
pnpm install
pnpm --filter @quiz-platform/shared build   # compiles packages/shared to dist/ — see note below
cd apps/api
pnpm exec prisma generate
pnpm exec prisma migrate dev   # only needed if the DB has no tables yet
pnpm exec ts-node prisma/seed.ts
```

Seeded logins (password `password123`): `admin@acme.test` (ADMIN in Acme
School), `teacher@acme.test` (TEACHER in Acme School, ADMIN in Beta Academy —
handy for testing the tenant switcher), `student@acme.test` (STUDENT in Acme
School).

**After editing anything in `packages/shared/src`**, re-run
`pnpm --filter @quiz-platform/shared build` before the change shows up in
`apps/api` (or a fresh `apps/web` build) — there's no build-graph tool wiring
this automatically yet.

### 4. Run

```bash
pnpm dev:api   # http://localhost:3000
pnpm dev:web   # http://localhost:5173 (proxies /api/* to the API)
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
  source — it needs `pnpm --filter @quiz-platform/shared build` re-run after
  every source change (see step 2 above). It used to point `main`/`types`
  straight at `src/index.ts`; that quietly worked only because Vite's bundler
  resolution is lenient, and broke as soon as `apps/api` (strict `nodenext`
  + a real Node runtime, not a bundler) consumed it.
