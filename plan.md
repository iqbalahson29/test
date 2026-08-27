# Multi-Tenant Quiz Platform — Foundation Plan

## Context

This is a greenfield project (empty directory, no existing code). Through discussion we settled on:
- **Tenancy**: single domain, session-scoped active tenant; a user can belong to multiple tenants with a different role in each (multi-tenant membership, Slack-style).
- **Roles**: ADMIN (full permissions within a tenant), TEACHER (create/assign/grade quizzes), STUDENT (take quizzes, view own results) — role is per-membership, not per-user.
- **Quiz mode**: async only for v1 (no live/synchronous sessions).
- **Question types (all in scope)**: MCQ single, MCQ multi (partial credit), true/false, short text, numeric, essay/long-form, matching, fill-in-blank, file upload.
- **Grading**: objective types auto-grade on submit; essay/file-upload go to a manual-grading queue for the teacher.
- **Attempts**: teacher-configurable max attempts per quiz (including unlimited).
- **Architecture**: separate backend (NestJS) and frontend (Vite + React SPA), not a Next.js monolith — chosen for cleaner RBAC/tenant-scoping via Guards and to keep the door open for a future mobile client.
- **Stack**: TypeScript, PostgreSQL, Prisma (given).

This plan covers the **foundation**: monorepo scaffold, database schema, backend module structure, frontend structure, auth/tenancy mechanics, and a phased build sequence. It does not implement every feature — it sets up the skeleton and data model so each phase can be built incrementally against a solid base.

## Monorepo layout

pnpm workspaces (lightweight, no need for Turborepo build-graph complexity yet):

```
/apps/api      — NestJS backend
/apps/web      — Vite + React frontend
/packages/shared — Zod schemas, shared TS types/enums, DTO contracts
```

`packages/shared` holds the `Role` enum, `QuestionType` enum, per-question-type config Zod schemas, and API DTO shapes — defined once, imported by both `api` (validation) and `web` (form typing), so the two apps can't silently drift out of sync on a question's config shape.

## Database schema (Prisma)

Core models in `apps/api/prisma/schema.prisma`:

- **User** — global identity (email, passwordHash, name). Not tenant-scoped.
- **Tenant** — organization (name, slug).
- **Membership** — join table `(userId, tenantId, role)`, `@@unique([userId, tenantId])`. This is where `Role` (ADMIN/TEACHER/STUDENT) actually lives, since role is per-tenant.
- **Group** — a class/cohort within a tenant, for assigning quizzes to many students at once. `GroupMember` joins `Group` ↔ `Membership`.
- **Quiz** — `tenantId`, `createdByMembershipId`, title, description, `timeLimitSec?`, `maxAttempts?` (null = unlimited), `shuffleQuestions`, `shuffleOptions`, `availableFrom?`/`availableUntil?`, `passMarkPercent?`, `status` (DRAFT/PUBLISHED/ARCHIVED).
- **Question** — `quizId`, `type` (enum: `MCQ_SINGLE`, `MCQ_MULTI`, `TRUE_FALSE`, `SHORT_TEXT`, `NUMERIC`, `ESSAY`, `MATCHING`, `FILL_BLANK`, `FILE_UPLOAD`), `prompt`, `points` (Decimal), `order`, `config` (Json — type-specific settings: numeric tolerance, blank count, matching pair count).
- **QuestionOption** — for choice-based/matching types: `questionId`, `text`, `isCorrect`, `matchKey?`, `order`.
- **QuizAssignment** — `quizId`, target is either `studentMembershipId` or `groupId` (one of the two set), `dueAt?`, `assignedByMembershipId`.
- **Attempt** — `quizId`, `studentMembershipId`, `attemptNumber`, `status` (IN_PROGRESS/SUBMITTED/GRADED), `startedAt`, `submittedAt?`, `score?`, `maxScore?`. Enforces `maxAttempts` at creation time.
- **Response** — `attemptId`, `questionId`, `answer` (Json — selected option ids / text / numeric value), `fileKey?` (object storage key for FILE_UPLOAD type), `awardedPoints?`, `autoGraded` (bool), `gradedByMembershipId?`, `feedback?`.

**Partial credit rule for MCQ_MULTI** (documented in the grading service, not hidden magic): `awarded = points * max(0, (correctSelected − incorrectSelected)) / totalCorrectOptions`.

**Row scoping**: every tenant-owned table carries `tenantId` directly (denormalized onto `Quiz`, `Group`, `QuizAssignment`, etc., not just reachable via join) so a single Prisma `where: { tenantId }` clause is always sufficient — no accidental cross-tenant leakage through a missed join.

## Backend structure (`apps/api`, NestJS)

Modules: `auth`, `tenants`, `memberships`, `users`, `groups`, `quizzes`, `questions`, `assignments`, `attempts`, `grading`, `analytics`, `storage`.

- **Auth**: JWT access token (short-lived, payload `{ sub: userId, membershipId, tenantId, role }`) + httpOnly refresh cookie. `POST /auth/login` → if the user has exactly one membership, auto-select it; otherwise the frontend shows a tenant switcher before a scoped token is issued. `POST /auth/switch-tenant/:tenantId` validates the membership exists and reissues a token.
- **Guards**: `JwtAuthGuard` (authenticates), `RolesGuard` reading a `@Roles(Role.TEACHER)` decorator, and a tenant-scoping mechanism — a Prisma Client extension (or per-request-scoped repository) that injects `tenantId` from the JWT into every query automatically, so a controller can never forget to scope a query. Tenant id is **never** read from the request body/params for authorization — always from the verified JWT.
- **Storage**: thin `StorageService` interface (`getUploadUrl`, `getDownloadUrl`, `delete`) implemented against an S3-compatible backend (works with AWS S3, Cloudflare R2, or local MinIO in dev) using presigned URLs — the file itself never transits through the API server.
- **Grading**: on `Attempt` submit, auto-gradable responses are scored synchronously; ESSAY/FILE_UPLOAD responses are left `autoGraded: false` with `awardedPoints: null` and surfaced in a teacher-facing grading queue (`GET /quizzes/:id/grading-queue`).
- **Analytics**: computed on-the-fly via Prisma aggregate queries for v1 (no precomputed rollup tables yet) — per-quiz average/median/distribution and per-question difficulty (% correct) for teachers; per-student attempt history and score trend for students.

## Frontend structure (`apps/web`, Vite + React)

- React Router for routing, TanStack Query for server state, shadcn/ui (Radix + Tailwind) for components, Tremor for analytics charts.
- Route groups by role: `/admin/*`, `/teacher/*`, `/student/*`, guarded by a route wrapper that checks the active membership's role from the auth context.
- A workspace/tenant switcher (top-level, always visible) since users can belong to multiple tenants.
- Feature folders: `auth`, `quiz-builder` (question-type-specific editor components, one per `QuestionType`), `assignments`, `quiz-taking` (the student attempt-taking UI — timer, autosave per response, submit), `grading-queue`, `analytics`.

## Phased build sequence

Each phase is independently demoable, ships both API and UI for that slice, and builds on the previous phase's schema/API surface — no phase requires reworking an earlier phase's data model.

### Phase 0 — Foundation
- `pnpm` workspace scaffold: `apps/api`, `apps/web`, `packages/shared`, root `tsconfig`/`eslint`/`prettier` shared config.
- `docker-compose.yml` for local Postgres + MinIO (S3-compatible, used from Phase 6 but stood up now).
- NestJS app bootstrap in `apps/api` (Nest CLI, global `ValidationPipe`, config module reading `.env`).
- Vite + React app bootstrap in `apps/web` (React Router, TanStack Query provider, Tailwind + shadcn/ui installed).
- `packages/shared`: `Role`, `QuestionType` enums + empty DTO barrel file, wired as a workspace dependency into both apps.
- Prisma schema: all models from the Database Schema section, initial migration.
- Seed script: one tenant, one ADMIN, one TEACHER, one STUDENT membership.
- `GET /health` endpoint; `web` renders a "Foundation OK" page hitting it, proving the two apps + DB are wired end-to-end.
- **Demo**: `docker compose up`, run migrations + seed, load the web app, see the health check succeed.

### Phase 1 — Auth + tenancy
- API: `auth` module — `POST /auth/login` (validates password, issues JWT; auto-selects tenant if the user has exactly one membership, else returns the membership list for the client to choose from), `POST /auth/switch-tenant/:tenantId`, `POST /auth/refresh`, `POST /auth/logout`.
- API: `JwtAuthGuard`, `RolesGuard` + `@Roles()` decorator, tenant-scoping Prisma extension (auto-injects `tenantId` from the verified JWT into every scoped query).
- API: `memberships` module — admin-only endpoints to invite/create a user into the tenant with a given role, list/remove memberships.
- Web: login page, tenant-switcher UI (shown post-login when >1 membership), auth context/provider, protected-route wrapper that reads role from the active token and redirects by role (`/admin`, `/teacher`, `/student`).
- Web: admin "Manage members" page (list/invite/remove).
- **Demo**: log in as each seeded role, confirm role-based redirect, confirm an admin can invite a new teacher/student and that user can log in.

### Phase 2 — Quiz builder
- API: `quizzes` module — CRUD, scoped to the creating teacher's tenant; `PATCH` for status transitions (DRAFT → PUBLISHED → ARCHIVED).
- API: `questions` module — CRUD nested under a quiz, `QuestionOption` CRUD, reordering endpoint.
- `packages/shared`: Zod config schema per `QuestionType` (numeric tolerance, matching pairs, blank count, etc.) — single source of truth for both API validation and web form typing.
- Web: quiz list/detail page for teachers, quiz metadata form (title, time limit, max attempts, shuffle flags, availability window, pass mark).
- Web: one editor component per question type (9 total) behind a shared `QuestionEditor` shell — MCQ/true-false/matching share an options-list sub-editor; numeric/short-text/essay/fill-blank/file-upload each get a small config form.
- **Demo**: a teacher builds one quiz containing all 9 question types, saves as draft, publishes it.

### Phase 3 — Assignment + attempt-taking
- API: `groups` module — CRUD groups, add/remove members.
- API: `assignments` module — assign a published quiz to a student or a group, list assignments per student/teacher.
- API: `attempts` module — `POST /attempts` (start; enforces `maxAttempts` and `availableFrom/Until`), `PATCH /attempts/:id/responses/:questionId` (autosave one answer), `POST /attempts/:id/submit`.
- Web: teacher "Assign quiz" flow (pick student(s) or group, set due date).
- Web: student "My quizzes" list (assigned, in-progress, completed) and the attempt-taking screen — timer, one-question-at-a-time or single-page (confirm preference during implementation), autosave on change, submit confirmation.
- **Demo**: teacher assigns the Phase 2 quiz to the seeded student; student starts, answers, and submits an attempt; a second attempt is correctly blocked/allowed per `maxAttempts`.

### Phase 4 — Grading
- API: `grading` module — synchronous auto-grade on submit for MCQ_SINGLE/MULTI (with partial credit), TRUE_FALSE, NUMERIC (tolerance-aware), FILL_BLANK; MATCHING scored by correct-pair count. ESSAY/FILE_UPLOAD responses left ungraded and surfaced via `GET /quizzes/:id/grading-queue`.
- API: `POST /responses/:id/grade` — teacher manually awards points + feedback for a queued response; recomputes the attempt's total score once all responses are graded.
- Web: teacher grading-queue page (per quiz, list of pending responses with the student's answer, a points input, feedback textarea).
- **Demo**: submit an attempt with a mix of auto-gradable and essay answers; confirm auto-graded score appears immediately; teacher grades the essay; attempt flips to fully GRADED with correct total.

### Phase 5 — Analytics
- API: `analytics` module — `GET /quizzes/:id/analytics` (average/median/score distribution, per-question % correct) for teachers; `GET /students/me/analytics` (attempt history, score trend across quizzes) for students.
- Web: teacher analytics dashboard (Tremor charts: score distribution, per-question difficulty ranking).
- Web: student results dashboard (past attempts, per-attempt breakdown with correct/incorrect + feedback, trend line over time).
- **Demo**: with the data generated in Phases 3–4, both dashboards render real numbers.

### Phase 6 — File uploads
- API: `storage` module against MinIO/S3 — presigned upload URL endpoint, presigned download URL endpoint for teacher review.
- Web: FILE_UPLOAD question type in the attempt-taking screen gets a real upload widget (direct-to-storage via presigned URL); grading queue gets a download/preview link for submitted files.
- **Demo**: student uploads a file as an answer; teacher opens it from the grading queue and grades it.

## Implementation notes for Phase 0 (starting point)

- Package manager: pnpm (workspaces). Node LTS.
- `apps/api`: NestJS + `@nestjs/config`, Prisma (`prisma`, `@prisma/client`), `class-validator`/`nestjs-zod` for request validation using the shared Zod schemas, `bcrypt` for password hashing, `@nestjs/jwt` + `passport-jwt` for auth (built in Phase 1 but installed now).
- `apps/web`: Vite, React 18+, `react-router-dom`, `@tanstack/react-query`, Tailwind, shadcn/ui CLI-generated components, Tremor for charts (added Phase 5).
- Env vars via `.env` (git-ignored) + `.env.example` committed: `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `S3_*` (Phase 6).

## Verification

- Prisma migrations applied cleanly against a local PostgreSQL instance (`docker compose up` for Postgres + MinIO in dev).
- Seed script produces a working multi-role login for manual testing.
- Per phase: exercise the relevant flow end-to-end through the actual UI (e.g. Phase 3 → build a quiz containing all 9 question types; Phase 4 → assign it and complete an attempt as a student; Phase 5 → confirm auto-grade scores match the partial-credit formula and the grading queue shows the essay/file responses).
- Backend: NestJS e2e tests per module covering the tenant-isolation guard (a request scoped to tenant A must never be able to read/write tenant B's data) — this is the highest-risk area to regress silently, so it gets explicit test coverage from Phase 2 onward.
