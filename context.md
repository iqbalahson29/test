# Build Context

Running log of what's actually been built, updated after each phase. See
`plan.md` for the full target plan — this file tracks reality vs. that plan,
including any deviations and why.

---

## Phase 0 — Foundation — ✅ Complete

**Built:**
- pnpm workspace monorepo: `apps/api` (NestJS), `apps/web` (Vite + React), `packages/shared` (Zod schemas/enums).
- `packages/shared`: `Role` enum, `QuestionType` enum, per-question-type config Zod schemas (`packages/shared/src/question-config.schemas.ts`) covering all 9 question types up front.
- Full Prisma schema (`apps/api/prisma/schema.prisma`) — all models from the plan: `User`, `Tenant`, `Membership`, `Group`, `GroupMember`, `Quiz`, `Question`, `QuestionOption`, `QuizAssignment`, `Attempt`, `Response`. Initial migration applied (`20260825103637_init`).
- Seed script (`apps/api/prisma/seed.ts`): tenant `acme-school`, one ADMIN/TEACHER/STUDENT user each, password `password123`.
- NestJS bootstrap: global `ValidationPipe`, `ConfigModule`, `PrismaModule` (global), `HealthModule` (`GET /health` does a real `SELECT 1` round-trip).
- Vite + React bootstrap: React Router, TanStack Query, Tailwind v4 (via `@tailwindcss/vite`), dev proxy `/api/* → localhost:3000`. Renders a "Foundation OK" page driven by a `useQuery` hit to `/health`.
- `docker-compose.yml` at repo root (Postgres + MinIO) as an alternative to the native Postgres actually in use.
- Root `README.md` documents local setup, seeded logins, and environment quirks.

**Verified:** `pnpm exec prisma migrate status` clean, seed runs, `nest build` produces a complete `dist/`, built API responds `200 {"status":"ok"}` on `/health`, API e2e test passes, web `tsc -b` type-checks clean, web dev server proxies to the API successfully.

**Deviations from `plan.md` / decisions made during the build:**
- **Prisma pinned to 6.19.3, not 7.x.** Tried 7.9.1 first (latest at build time); its new `prisma-client` generator requires a WASM query compiler loaded via dynamic `import()`, which breaks under Jest/ts-jest in a plain CommonJS NestJS project (confirmed as a live, unresolved upstream issue — not fixable from our config). Prisma 6's classic `prisma-client-js` generator has no driver-adapter requirement and just works. Revisit upgrading once Prisma resolves this upstream.
- **shadcn/ui not yet installed.** Tailwind v4 is wired in, but no shadcn components were added — deferred to Phase 1 when there's an actual login screen to pick components for, rather than installing speculatively.
- **`nest build` incremental-cache bug**: in this environment, `nest build`'s default incremental TypeScript compilation intermittently produced an incomplete `dist/` (some files silently never emitted, despite a clean exit code). Fixed permanently by setting `"incremental": false` in `apps/api/tsconfig.build.json`. If `dist/` ever looks partial again, `rm -rf dist` and rebuild.
- **PostgreSQL is a native portable install, not Docker/a Windows service.** This machine had neither Docker nor an installer path available to the agent; PostgreSQL 16 binaries were downloaded and extracted to `C:\pgsql`, with the data directory at `D:\pgsql\data`. It must be started manually (`pg_ctl start`) — see README. `docker-compose.yml` remains available as the path other environments (or this one, later) can use instead.

**Environment state right now:**
- Postgres running on `localhost:5432` (user `postgres`, password `quizdevpass`, db `quiz_platform`).
- Nothing committed to git yet.

---

## Phase 1 — Auth + Tenancy — ✅ Complete

**Built:**
- `apps/api/src/auth/`: JWT auth with three discriminated token types (`access`, `preauth`, `refresh` — see `token.types.ts`), `AuthService`, `AuthController` (`POST /auth/login`, `/switch-tenant`, `/refresh`, `/logout`, `GET /auth/me`), `JwtStrategy`, `JwtAuthGuard`, `RolesGuard` + `@Roles()`, `@CurrentUser()`.
- `apps/api/src/memberships/`: admin-only `GET/POST /memberships`, `DELETE /memberships/:id` — the first tenant-scoped feature, scoped by `req.user.tenantId` from the verified JWT (never client input). Blocks deleting a tenant's last ADMIN.
- `main.ts`: `cookie-parser` middleware, CORS tightened to `WEB_ORIGIN` env var.
- Seed data extended: second tenant `beta-academy`, with `teacher@acme.test` holding TEACHER in `acme-school` and ADMIN in `beta-academy` — proves role is per-membership.
- `apps/web/src/auth/`: `AuthProvider`/`useAuth` (state machine: loading/unauthenticated/select-tenant/authenticated), `token-store.ts` (in-memory access token for the API client), `LoginPage`, `SelectTenantPage` (doubles as the post-login tenant picker and the "switch workspace" destination), `ProtectedRoute`, `HomeRedirect`, `AppShell` (top bar: tenant name, role, switch-workspace link, logout).
- `apps/web/src/features/memberships/members-page.tsx`: admin "Manage members" page (list, add, remove) using TanStack Query.
- `apps/web/src/dashboards/`: minimal placeholder Admin/Teacher/Student dashboards, routed by role.
- New e2e suite `apps/api/test/memberships.e2e-spec.ts`: tenant isolation (tenant B admin can't see/delete tenant A's memberships), role rejection (403 for non-admin), and no-token rejection (401).

**Verified:**
- Full curl-driven flow against the real API (not just unit tests): login with 1 vs. 2+ memberships, switch-tenant with a preauth token, refresh, logout, membership CRUD, last-admin-deletion block, tenant isolation, role rejection, and preauth-token-rejected-on-protected-route.
- Same flow re-verified **through the Vite dev proxy** (`localhost:5173/api/*`) specifically to catch proxy/cookie interaction bugs — see deviation below, this caught a real one.
- `apps/api`: `nest build` clean, both e2e suites pass (5/5).
- `apps/web`: `tsc -b` clean, `vite build` production bundle succeeds.
- **Not verified**: actual browser UI interaction (clicking through login → tenant switch → manage members). No browser-automation tool is available in this environment, so this was verified at the HTTP level (curl reproducing the exact requests the browser JS makes, including cookie jar semantics) plus type-checking — not visually confirmed in a real browser. Worth an manual pass in an actual browser before considering Phase 1 fully done.

**Deviations from the Phase 1 plan / decisions made during the build:**
- **Added `GET /auth/me`** (not in the original plan file). Needed so an already-authenticated user's top-bar "Switch workspace" control has something to list — the login response only includes the full membership list in the multi-membership case. Returns `{ activeMembershipId, memberships[] }`.
- **Real bug caught during verification**: the refresh-token cookie was set with `Path=/auth` (matching the API's own route), but the browser only ever sees `/api/auth/...` (via the Vite dev proxy) or possibly a different prefix in prod — so the cookie's path never matched and it was silently never sent back. Fixed by scoping the cookie to `Path=/` instead. This is exactly the kind of bug that unit/e2e tests hitting the API directly (bypassing the proxy) would never catch — found by deliberately re-running the verification through `localhost:5173/api/*` instead of `localhost:3000` directly.
- **No Prisma Client-extension auto-tenant-scoping** was built (the original high-level plan mentioned this as an option). With only one tenant-scoped module so far (`memberships`), explicit `where: { tenantId }` per query is simpler and the abstraction would be speculative. Revisit once Phase 2's `Quiz`/`Question`/etc. give it enough call sites to be worth it.
- Access token is held in memory only (a module-level variable in `token-store.ts`, not localStorage) — lost on a hard refresh, but the `AuthProvider` silently calls `/auth/refresh` on mount to restore the session from the httpOnly cookie, so this is invisible to the user in practice.
- No automatic retry-on-401 interceptor in the API client — access tokens live 15 minutes, long enough for Phase 1's scope. Worth adding once real usage sessions get longer (later phases).

**Environment state right now:**
- Postgres running on `localhost:5432`; API running on `localhost:3000`; Vite dev server on `localhost:5173`.
- Seeded logins (password `password123`): `admin@acme.test` (ADMIN in Acme School), `teacher@acme.test` (TEACHER in Acme School, ADMIN in Beta Academy), `student@acme.test` (STUDENT in Acme School), plus `newteacher@acme.test` (TEACHER in Acme School) created during manual verification.
- Nothing committed to git yet.

---

## Phase 2 — Quiz Builder — ✅ Complete

**Built:**
- `apps/api/src/quizzes/`: `GET/POST /quizzes`, `GET/PATCH/DELETE /quizzes/:id`, `PATCH /quizzes/:id/status` — full CRUD + a `DRAFT → PUBLISHED → ARCHIVED` (+ `PUBLISHED → DRAFT` unpublish) status machine. Publish is blocked with 0 questions; all mutation is blocked once a quiz leaves `DRAFT`.
- `apps/api/src/questions/`: `POST /quizzes/:quizId/questions`, `PATCH .../:id`, `DELETE .../:id`, `PATCH .../reorder` — the first real use of `packages/shared`'s `getQuestionConfigSchema`/`OPTION_BASED_TYPES` (built in Phase 0, unused until now): every question's `config` is validated against its type's Zod schema server-side, plus hand-written business rules for option-based types (≥2 options; exactly one correct for `MCQ_SINGLE`/`TRUE_FALSE`; ≥1 correct for `MCQ_MULTI`; exactly 2 options for `TRUE_FALSE`).
- `apps/web/src/features/quizzes/`: quiz list (`/teacher`), new-quiz form (`/teacher/quizzes/new`), and the quiz builder (`/teacher/quizzes/:id`) — metadata, status controls, and a question list with up/down reordering.
- `apps/web/src/features/quizzes/question-editor/`: a shared shell (`question-form.tsx`, type picker + prompt/points) plus one sub-editor per question type — all 9 types are implemented (`options-editor` shared by MCQ_SINGLE/MCQ_MULTI, plus dedicated true-false/short-text/numeric/essay/matching/fill-blank/file-upload editors). Submits are validated client-side against the same shared Zod schemas before hitting the API.
- New e2e suite `apps/api/test/quizzes.e2e-spec.ts` (4 tests): builds a quiz with all 9 types + reorders + publishes, rejects invalid config/option rules, blocks publishing an empty quiz, and tenant isolation.
- `TeacherDashboard` placeholder deleted — `/teacher` is now the real quiz list.

**Verified:**
- Full manual curl pass **through the Vite proxy** (the same discipline that caught the Phase 1 cookie bug): created a quiz, added all 9 question types one at a time, confirmed 3 different invalid-config/invalid-options requests correctly 400, reversed the question order and confirmed it stuck, published, confirmed a post-publish question-add was blocked, unpublished, and confirmed publishing a 0-question quiz is blocked.
- `apps/api`: `nest build` clean, all 3 e2e suites / 9 tests pass.
- `apps/web`: `tsc -b` clean, `vite build` production bundle succeeds, dev server serves all new modules with no errors.
- **Not verified**: real browser click-through, same caveat as Phase 1 — no browser-automation tool available here.

**Deviations from the Phase 2 plan / decisions made during the build:**
- **`packages/shared` needed a real build step** — it previously shipped raw `.ts` source (`main`/`types` pointed straight at `src/index.ts`), which is how Phase 0/1 got away with it since only Vite (lenient bundler resolution) consumed it. The moment `apps/api` imported it, two failures showed up back to back: (1) `nodenext` type-checking demanded explicit `.js` extensions on `packages/shared`'s own relative imports, and (2) once those were added, Node's runtime `require()` of the raw `.ts` file failed because no compiled `.js` sibling actually existed — the exact same class of "TS source pretending to be its own compiled output" bug as the Prisma 7 saga in Phase 0. Fixed properly this time: `packages/shared` now has a `build` script (`tsc`), compiles to CommonJS (not ESM — avoids all Node/Jest ESM-interop friction), and `main`/`types` point at `dist/`. **Consequence: after editing anything in `packages/shared/src`, you must run `pnpm --filter @quiz-platform/shared build` before the API (or a fresh web build) will see the change** — there's no build-graph tool (Turborepo etc.) wiring this automatically yet. Worth adding once the monorepo has enough packages to justify it.
- **Question `config` validation is server-authoritative, client-side is a courtesy.** The web form runs the same Zod schema before submitting (fast feedback), but the API re-validates independently — matches the "single source of truth" intent from Phase 0's plan for `packages/shared`.
- **`FILL_BLANK` UI simplification**: the Zod schema allows multiple accepted-answer variants per blank, but the editor only exposes one primary answer per blank (still a valid 1-element array). Revisit if teachers actually need answer variants (e.g. "Moon"/"the Moon").
- Quiz ownership, DRAFT-only mutability, and the exact status-transition table are as decided in the plan file — see there for the reasoning; not re-litigated here.

**Environment state right now:**
- Postgres running on `localhost:5432`; API running on `localhost:3000`; Vite dev server on `localhost:5173`.
- Dev DB now also has several quizzes created by e2e tests and manual verification (titles like "Full Coverage Quiz", "Sample Quiz", "Empty Quiz") — e2e tests run against the same dev database, not an isolated test DB, consistent with Phase 1.
- Nothing committed to git yet.

---

## Phase 3 — Assignment + Attempt-Taking — ✅ Complete

**Built:**
- `apps/api/src/groups/`: full CRUD + `POST/DELETE /groups/:id/members` (student-only membership, validated).
- `apps/api/src/assignments/`: `POST/GET /assignments`, `DELETE /assignments/:id` (teacher/admin), `GET /assignments/mine` (student — de-duplicated by quiz across direct + group assignment, annotated with `NOT_STARTED`/`IN_PROGRESS`/`SUBMITTED` and attempts-used vs `maxAttempts`).
- `apps/api/src/attempts/`: `POST /attempts` (start-or-resume, enforces assignment + `maxAttempts` + quiz `PUBLISHED`), `GET /attempts/:id`, `PATCH /attempts/:id/responses/:questionId` (autosave, upsert), `POST /attempts/:id/submit`. **`question-sanitizer.ts`** strips the answer key per type before any question reaches a student (options lose `isCorrect`; `SHORT_TEXT`/`NUMERIC` config emptied; `MATCHING` reshaped from `{pairs}` to shuffled `{leftItems, rightItems}`; `FILL_BLANK` reduced to `{blankCount}`).
- `apps/api/src/memberships/memberships.controller.ts`: `GET` opened to `TEACHER` (was admin-only) via per-method `@Roles()`, so teachers can pick students to assign to.
- `apps/web/src/features/assignments/`: `AssignmentPanel` (embedded in the quiz builder once `PUBLISHED` — list current assignments, assign to a student with an optional due date).
- `apps/web/src/features/attempts/`: `MyQuizzesPage` (replaces the `StudentDashboard` placeholder at `/student`) and `AttemptPage` (`/student/attempts/:id`) — sticky header with a live countdown that auto-submits at zero, debounced (600ms) per-question autosave with a "Saving…" indicator, and one answer-input component per type in `answer-input/` (`mcq-single`/`true-false` share a component, `mcq-multi`, `short-text`, `numeric`, `essay` with live word count, `matching` via per-left-item `<select>`, `fill-blank`, and a static placeholder for `file-upload`).
- New e2e suites: `assignments.e2e-spec.ts` (7 tests) and `attempts.e2e-spec.ts` (4 tests) — total is now 5 suites / 18 tests, all passing.

**Verified:**
- Full manual curl-through-the-Vite-proxy pass covering everything the plan's Demo criterion asked for and more: assigned "Full Coverage Quiz" to the seeded student, confirmed duplicate-assignment 409, started an attempt and confirmed the sanitizer (inspected `MATCHING`, `MCQ_SINGLE`, `FILL_BLANK` output directly — no answer key present), autosaved an answer, confirmed resuming returns the *same* in-progress attempt with the saved answer intact, submitted, confirmed further autosave/submit is rejected post-submit, confirmed unlimited re-attempt when `maxAttempts` is null, then separately exhausted a `maxAttempts: 2` quiz and confirmed the 3rd attempt is blocked (`400`) — the plan's exact bar. Also verified group-based assignment end-to-end (create group → add student → assign to group → student sees it via `/assignments/mine`) and the "not assigned" 403.
- `nest build` clean, all 5 e2e suites / 18 tests pass. `apps/web`: `tsc -b` clean, `vite build` production bundle succeeds, dev server serves all new modules with no errors.
- **Not verified**: real browser click-through (timer countdown, debounce UX, form interactions) — same caveat as every prior phase, no browser-automation tool available here.

**Deviations from the Phase 3 plan / decisions made during the build:** none beyond what the plan file already called out up front (groups UI deferred, answer shapes unvalidated, no server-side time enforcement, `FILE_UPLOAD` placeholder, single-page attempt layout) — implementation matched the plan as written this time, no new judgment calls surfaced during the build itself.

**Environment state right now:**
- Postgres running on `localhost:5432`; API running on `localhost:3000`; Vite dev server on `localhost:5173`.
- Dev DB now also has groups, assignments, and attempts (some `SUBMITTED`, some `IN_PROGRESS`) created by e2e tests and manual verification — same "shared dev DB, not an isolated test DB" caveat as prior phases.
- Nothing committed to git yet.

---

## Phase 4 — Grading — ✅ Complete

**Built:**
- `packages/shared/src/answer.schemas.ts`: per-type Zod schemas for `Response.answer` (`{optionId}`, `{optionIds}`, `{text}`, `{value}`, `{selections}`, `{answers}`) — closes the gap Phase 3 deliberately left open ("validation arrives naturally in Phase 4").
- `apps/api/src/grading/`: `GradingService.gradeAttempt()` (called from `AttemptsService.submit()`) scores every `AUTO_GRADABLE_TYPES` question immediately using the formulas from the plan (MCQ_MULTI/MATCHING/FILL_BLANK partial credit; MCQ_SINGLE/TRUE_FALSE/NUMERIC/SHORT_TEXT binary), backfilling a `Response` row (answer: null) for any question the student skipped entirely so it still gets scored (0) or queued. `recomputeAttemptTotals()` sets `maxScore` immediately and only sets `score`+flips `Attempt.status` to `GRADED` once every response has a non-null `awardedPoints`. `GET /quizzes/:quizId/grading-queue` and `POST /responses/:id/grade` (bounds-checked against the question's max points) round out the module.
- `apps/api/src/attempts/attempts.service.ts`: `buildAttemptView()` now returns `score`/`maxScore` and per-question `awardedPoints`/`feedback` (previously omitted entirely).
- `apps/api/src/assignments/assignments.service.ts`: `mine()` rewritten to surface the real attempt status (`GRADED` included, not collapsed into `SUBMITTED`) plus `latestAttemptId`/`score`/`maxScore` — see deviation below, this was a real gap the phase's own goal exposed.
- `apps/web/src/features/grading/`: `GradingQueuePage` (`/teacher/quizzes/:id/grading`, linked from the quiz builder) — one row per pending `ESSAY`/`FILE_UPLOAD` response with a bounded points input and feedback field.
- `apps/web/src/features/attempts/attempt-page.tsx`: shows the live score in the header and per-question `awardedPoints`/feedback once graded.
- `apps/web/src/features/attempts/my-quizzes-page.tsx`: reworked button logic — `SUBMITTED`/`GRADED` now always offer a "View" action (previously impossible once attempts were exhausted — see deviation), plus "Retake" only when attempts remain.
- New e2e suite `grading.e2e-spec.ts` (2 tests, one end-to-end covering the full mixed-type grading flow) — total is now 6 suites / 20 tests, all passing.

**Verified:**
- Full manual curl-through-the-Vite-proxy pass matching (and exceeding) the plan's demo criterion: built a quiz with `MCQ_MULTI` (4 options, 3 correct), `NUMERIC` (tolerance), and two `ESSAY` questions (one deliberately left unanswered); submitted and confirmed the partial-credit math exactly (`4 × max(0, 2−1)/3 = 1.33`), `NUMERIC` full credit within tolerance, both essays queued (including the skipped one showing `answer: null`), a grade-above-max-points rejection, the attempt staying `SUBMITTED` after grading only one of two pending items, then flipping to `GRADED` with the correct final total (`7.33/14`) after the last one — verified independently via `GET /attempts/:id` and `GET /assignments/mine`.
- `nest build` clean, all 6 e2e suites / 20 tests pass. `apps/web`: `tsc -b` clean on the first pass, `vite build` succeeds, dev server serves all new modules with no errors.
- **Not verified**: real browser click-through — same caveat as every prior phase, no browser-automation tool available here.

**Deviations from the Phase 4 plan / decisions made during the build:** none beyond what the plan file already called out up front. The `AssignmentsService.mine()` rewrite and the `MyQuizzesPage` "always show View" fix were both *explicitly planned* (named in the plan's "Decisions" section as a bundled fix, not something discovered mid-build) — flagging that distinction since recent phases' context entries had a habit of surfacing new deviations during implementation; this phase's build matched its plan exactly.

**Environment state right now:**
- Postgres running on `localhost:5432`; API running on `localhost:3000`; Vite dev server on `localhost:5173`.
- Dev DB now also has graded attempts (e.g. "Grading Test Quiz" at 7.33/14) from e2e tests and manual verification — same shared-dev-DB caveat as prior phases.
- Nothing committed to git yet.

---

## Phase 5 — Analytics — ✅ Complete

**Built:**
- `apps/api/src/analytics/`: `GET /quizzes/:quizId/analytics` (teacher/admin) — total vs. graded attempt counts, average/median score in both raw points and percent, a 10-bucket score-distribution histogram, pass rate (when the quiz has a `passMarkPercent`), and per-question stats (`percentCorrect` = share of responses earning full credit, `averagePercent` = mean `awardedPoints/points` — the second figure matters for partial-credit types where "correct" isn't binary). `GET /students/me/analytics` (student) — full attempt history across the tenant plus a chronological `GRADED`-only trend series and an overall average.
- `apps/web/src/features/analytics/`: `QuizAnalyticsPage` (`/teacher/quizzes/:id/analytics`, linked from the quiz builder next to "Grading queue") with stat tiles, a Recharts bar-chart histogram, and a horizontal bar chart ranking questions hardest-first; `StudentAnalyticsPage` (`/student/analytics`, linked from "My quizzes") with a Recharts line-chart trend and an attempt-history table.
- New e2e suite `analytics.e2e-spec.ts` (3 tests) — total is now 7 suites / 23 tests, all passing.

**Verified:**
- Manual curl-through-the-Vite-proxy pass against the **real dev DB** (not just synthetic test data): pulled up "Grading Test Quiz" (the mixed-type attempt from Phase 4's verification, graded at 7.33/14) and confirmed every figure by hand — `52.36%` average, `MCQ_MULTI` at `33.25%` average / `0%` fully-correct (matches its partial credit), `NUMERIC` at `100%`, both essays' `averagePercent` matching their manual grades exactly (`80%` and `0%`).
- The formal e2e suite additionally exercises a fully controlled 2-attempt dataset (one 100%, one 0%) and asserts the average/median/distribution/per-question/pass-rate numbers exactly, not just plausibly.
- `nest build` clean, all 7 e2e suites / 23 tests pass. `apps/web`: `tsc -b` clean, `vite build` succeeds (see deviation below re: bundle size), dev server serves all new modules with no errors.
- **Not verified**: real browser click-through (chart rendering, tooltips, responsiveness) — same standing caveat, no browser-automation tool available here.

**Deviations from the Phase 5 plan / decisions made during the build:**
- **Charting library was Recharts, not Tremor** — this was already flagged and decided *in the plan itself* (Tailwind v4/Tremor compatibility risk, neither Tremor nor shadcn were ever actually installed), not a mid-build surprise.
- **New, not previously flagged**: `vite build`'s production bundle grew from ~370KB to ~750KB (gzipped ~103KB → ~212KB) once Recharts was added, and Vite now warns about the >500KB chunk-size threshold. Not a functional problem and not worth chasing in this phase (code-splitting/lazy-loading the analytics routes would fix it), but worth noting before it's mistaken for a regression later — analytics pages are the only consumers of Recharts, so a `React.lazy()` split on those two routes would be the natural fix if bundle size ever actually matters (e.g. before a real deployment).

**Environment state right now:**
- Postgres running on `localhost:5432`; API running on `localhost:3000`; Vite dev server on `localhost:5173`.
- Dev DB unchanged in kind from Phase 4 (same graded attempts), plus a couple of new e2e-created quizzes ("Analytics Test Quiz", "Analytics Isolation Quiz").
- Nothing committed to git yet.

---

## Phase 6 — File Uploads — ✅ Complete

This closes out the original 7-phase roadmap (Phases 0–6). Every question type the platform committed to back in Phase 0 is now fully functional end to end.

**Built:**
- **MinIO**, native portable binary (`C:\minio\minio.exe`, data at `D:\minio-data`), same no-Docker treatment as Postgres — see README for start/stop.
- `apps/api/src/storage/`: `StorageService` wraps `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` against MinIO (`forcePathStyle: true`), self-provisions the `quiz-platform` bucket on API startup, hands out 5-minute presigned PUT/GET URLs.
- `apps/api/src/attempts/`: `POST /attempts/:id/responses/:questionId/upload-url` — validates attempt ownership/`IN_PROGRESS`, confirms the question is `FILE_UPLOAD`, returns a presigned PUT URL + a unique `fileKey`. No new "confirm upload" endpoint — the frontend saves the resulting `fileKey` through the *existing* Phase 3 autosave endpoint, whose DTO has supported `fileKey` since Phase 3 but had simply never been populated until now.
- `apps/api/src/grading/`: `GET /responses/:id/download-url` (same tenant-ownership chain as `gradeResponse`); `gradingQueue()` now includes `fileKey` in each item — a real gap the plan's own drafting surfaced (Phase 4 returned `answer` but never the separate `fileKey` column, so the grading UI had no way to ever link to an uploaded file).
- `apps/web/src/features/attempts/answer-input/file-upload-answer.tsx` replaces the static Phase 3 placeholder: client-side extension/size validation, upload-url request, direct browser→MinIO `PUT`, then autosave via the same `onChange` contract every other answer-input component uses.
- `apps/web/src/features/grading/grading-queue-page.tsx`: a "Download file" button that fetches a fresh presigned URL on click (not upfront — they expire in 5 minutes) and opens it in a new tab.
- New e2e suite `storage.e2e-spec.ts` (2 tests) — total is now **8 suites / 25 tests**, all passing.

**A real, unplanned bug found and fixed during the build**: `StorageService`'s initial `onModuleInit` also tried to set bucket CORS via the S3 `PutBucketCorsCommand` API (as planned). MinIO 501'd it — `NotImplemented: A header you provided implies functionality that is not implemented` — because newer `@aws-sdk/client-s3` versions attach a checksum trailer header by default that MinIO's `PutBucketCors` implementation doesn't accept, even though the same client's presigned PUT/GET URLs (which also carry checksum query params) work against MinIO just fine. Fixed by dropping the API call entirely and using MinIO's own `MINIO_API_CORS_ALLOW_ORIGIN` server-startup env var instead — simpler, and sidesteps the incompatibility rather than working around it. Confirmed this was the right call: the actual upload/download round trip (the thing that matters) was verified byte-for-byte both manually and in the e2e suite.

**Verified:**
- Full manual curl-through-the-Vite-proxy pass exceeding the plan's demo criterion: created a `FILE_UPLOAD` question, requested an upload URL, `PUT` a real file directly to MinIO, autosaved the `fileKey`, submitted, confirmed the file appeared in the grading queue, requested a download URL, and confirmed the fetched bytes matched the original content **exactly**. Also confirmed tenant isolation on both new endpoints (a Beta Academy teacher gets 404 trying to reach an Acme response's download URL).
- `nest build` clean, all 8 e2e suites / 25 tests pass — including a real round-trip test against live MinIO (upload, autosave, submit, grading-queue listing, download, byte-for-byte content check), not a mock, consistent with this project's testing philosophy in every prior phase.
- `apps/web`: `tsc -b` clean, `vite build` succeeds (bundle size unchanged from Phase 5 — no new heavy frontend dependency this phase).
- **Not verified**: the actual file-picker/drag-and-drop UX in a real browser — same standing caveat as every phase, no browser-automation tool available here. Curl simulated the exact PUT/GET calls a browser would make, but the `<input type="file">` interaction itself wasn't click-through tested.

**Deviations from the Phase 6 plan / decisions made during the build:**
- The CORS-mechanism swap above (`PutBucketCorsCommand` → `MINIO_API_CORS_ALLOW_ORIGIN`) is the only real deviation — everything else (presigned-URL architecture, reusing the existing autosave endpoint, the `gradingQueue()` `fileKey` fix, client-side-only size/extension validation) matched the plan as written.

**Environment state right now:**
- Postgres on `localhost:5432`, MinIO on `localhost:9000` (console `:9001`), API on `localhost:3000`, Vite dev server on `localhost:5173` — all four running.
- MinIO's `quiz-platform` bucket now holds a handful of real test files from e2e tests and manual verification.
- Nothing committed to git yet.

---

## Post-Phase 6 — Environment recovery incident

Shortly after Phase 6 wrapped up, both dev servers were found down and `packages/shared/package.json` had **`"type": "module"` back in it** — the exact setting Phase 2 deliberately removed to fix a CJS/ESM breakage. The cause of the reversion itself was never conclusively identified (no git history to diff against, since nothing's committed yet); it was fixed by simply removing the field again and rebuilding (`pnpm --filter @quiz-platform/shared build`).

Restarting the servers surfaced a **second, previously-latent bug**: with a truly fresh Vite dev server (no leftover `node_modules/.vite` dependency-optimization cache from earlier sessions), the browser threw `SyntaxError: ... does not provide an export named 'QuestionType'` — Vite was serving `packages/shared`'s CJS output raw via `/@fs/...` instead of pre-bundling it through esbuild's CJS→ESM interop. This had been silently masked since Phase 2 by a stale `.vite` cache from whenever it first happened to get optimized correctly; it was never actually a solid fix. **Real fix**: added `optimizeDeps: { include: ['@quiz-platform/shared'] }` to `apps/web/vite.config.ts` — this is the standard, documented pattern for a pnpm-linked workspace package that ships CJS, and doesn't depend on cache-warming order like the previous accidental "fix" did.

Both issues are now fixed at the root rather than papered over — confirmed via a fresh `rm -rf node_modules/.vite` + cold restart, not just "it works now that the cache is warm again". Full e2e suite (25/25) and `tsc -b`/`vite build` re-verified clean after the fix.

**Lesson for future sessions**: if `@quiz-platform/shared` named imports ever break in the browser again with an "export named X" error, check `apps/web/vite.config.ts`'s `optimizeDeps.include` first — don't just restart and assume a stale cache fixed it.

---

## Post-Phase 6 — UI redesign (shadcn/ui, Jira-leaning) — ✅ Complete

Not one of the original plan.md phases — a full visual redesign of every page in `apps/web`, requested after the 7-phase build was functionally complete. Scope was styling only: no API, schema, or business-logic changes anywhere in this pass.

**Built:**
- Installed shadcn/ui (`shadcn@4.19.0`, "radix-nova" style, Radix base) + `lucide-react`. The `shadcn` CLI's `init`/`add` commands have a real bug in this pnpm-workspace layout: `init` fails with "Could not load the workspace config" once alias validation passes, and `add` silently writes files into a literal `apps/web/@/...` folder instead of resolving the `@/*` alias to `src/`. Worked around by running `init` in an isolated scratch directory *outside* the pnpm workspace to obtain a correct `components.json`/theme `index.css`, and running `add <component>` inside the real project to fetch correct component source (which still lands in the bogus `@/` folder), then moving the fetched files from `apps/web/@/...` into `apps/web/src/...` by hand. If more components are ever added later, expect the same `@/` folder to reappear — just relocate it the same way.
- Theme (`apps/web/src/index.css`): shadcn's stock "neutral" base palette, with `--primary`/`--ring`/`--sidebar-primary`/`--sidebar-accent*` swapped to an Atlassian-style blue (`oklch(0.523 0.191 259.8)` ≈ `#0C66E4`) per the user's "Jira-leaning" choice — every component reads these as CSS variables, not literal colors, so this one swap re-themes the whole set. Light theme only, no dark mode. Font is self-hosted Geist Variable via `@fontsource-variable/geist` (no external font CDN).
- New `apps/web/src/auth/app-shell.tsx`: replaced the old top-bar `AppShell` with a Notion-style collapsible left sidebar (shadcn `Sidebar` block) — role-based nav (ADMIN: Dashboard/Quizzes/Members; STUDENT: My quizzes/Analytics), workspace name + role in the footer behind a `DropdownMenu` (Logout), active-route highlighting. `apps/web/src/main.tsx` now wraps the app in `TooltipProvider` (the sidebar's icon tooltips throw without one — caught via the Puppeteer QA pass below, not by `tsc`).
- Every page redesigned onto shadcn primitives (`Button`, `Card`, `Input`, `Select`, `Table`, `Badge`, `Dialog`-adjacent components, `Tabs`, `Checkbox`, `RadioGroup`, `Alert`, etc.) plus `lucide-react` icons throughout: login/request-workspace/loading screens, admin dashboard, members page, superadmin workspace-requests page (kept as its own non-sidebar top-bar layout, since superadmin isn't tenant-scoped), the full quiz builder (list/new/edit + all 9 question-type sub-editors), assignment panel, student my-quizzes + attempt-taking screen + all 9 answer-input components, grading queue, and both analytics pages (Recharts chart logic/data untouched, only chrome + two hardcoded chart colors changed to match the new primary blue).
- `StatusBadge` (quiz status) rebuilt as a `Badge` + small colored SVG dot ("chip") pattern — reused inline (not extracted to a shared component) for tenant-request status and attempt status elsewhere, per each page's own agent's judgment call.

**Verified:**
- `tsc -b --force` across the whole `apps/web` project: clean, zero errors (strict `noUnusedLocals`/`noUnusedParameters` included).
- `vite build` production bundle succeeds. Bundle grew further from Phase 5's already-noted size (now ~937KB / ~271KB gzip) from the added Radix/shadcn components + self-hosted font — same pre-existing "not a functional problem, revisit with code-splitting before a real deployment" situation flagged in Phase 5, not a new regression.
- **Real browser verification this time**, unlike every prior phase's standing caveat: set up a headless-Chrome + `puppeteer-core` screenshot pipeline (pointed at the machine's existing Chrome install, no download) driven through the actual login form, then navigated every route as ADMIN/STUDENT/superadmin with real seeded + freshly-created test data (a 4-question mixed-type quiz, assignments, a submitted+graded attempt, a second in-progress attempt, a pending tenant request). Caught and fixed one real bug this way (`TooltipProvider` missing, sidebar tooltips crashed on the very first render) that `tsc` could never have caught. Also clicked through the question-editor's type picker live (MCQ_MULTI/MATCHING/FILL_BLANK/NUMERIC) to confirm each sub-editor renders correctly.
- One screenshot false alarm worth recording: `page.screenshot({ fullPage: true })` on the two Recharts analytics pages intermittently captured completely empty chart boxes (axes and bars both missing, or axes-only) even though the chart was rendering correctly and interactively in the live page — a Puppeteer `fullPage` viewport-resize race with Recharts' `ResponsiveContainer` `ResizeObserver`, not an app bug. Confirmed via direct DOM inspection (bars present, correct fill/opacity/geometry) and by re-shooting with `fullPage: false`, which rendered the bars correctly every time. **Lesson for future sessions**: don't trust a `fullPage: true` Puppeteer screenshot of a Recharts (or any `ResponsiveContainer`-based) page as evidence of a rendering bug — re-check with a plain viewport screenshot first.

**Deviations / decisions made during the build:**
- Used 4 parallel background subagents (one per independent feature area: admin/members/superadmin, quiz builder, assignments/attempts, grading/analytics) after building the shared design system (theme, sidebar shell, `StatusBadge`) myself first — each agent worked on disjoint files with a shared written brief (design tokens, component list, hard rules against touching business logic), so there was no merge conflict risk. All four reported clean `tsc -b` independently; a final combined `tsc -b --force` after all four landed confirmed no cross-agent integration issues.
- `pnpm` is not on `PATH` in either shell in this environment (only `corepack pnpm` works); needed a small `pnpm.cmd` shim script (kept in the session scratch dir, not the repo) prepended to `PATH` so the `shadcn` CLI's own internal `pnpm add` child-process calls could resolve it.
- No new interaction patterns were added anywhere (no new confirm-dialogs, no changed validation, no new API calls) — this was strictly a visual pass, per explicit instruction to every subagent.

**Environment state right now:**
- Postgres, MinIO, API (`:3000`), and Vite dev server (`:5173`) all running, same as end of Phase 6.
- Dev DB now also has a few more QA-created records from this pass: quiz "World Geography Basics" (published, 4 questions, one graded attempt), quiz "Draft Quiz For QA" (empty draft, used only to click through question-type editors), membership `jamie@acme.test`, and a pending "Riverside High" tenant request — left in place rather than cleaned up, consistent with every prior phase's "shared dev DB, not an isolated test DB" note.
- Nothing committed to git yet (same as every prior phase).

## Post-Phase 6 — Student self-registration + assign-by-email + multi-tenant membership — ✅ Complete

Feature request: students should be able to register their own account, and
a teacher should be able to add a student to a quiz directly by email
(auto-joining them to that workspace). This surfaced — and the user
explicitly chose to reverse — a deliberate constraint from the
`role_collapse` migration: `Membership` was `@@unique([userId])` (one
membership, ever, across the whole platform). It's now
`@@unique([userId, tenantId])` — a user can belong to multiple tenants.

**Built:**
- Schema: `Membership` constraint relaxed as above
  (`prisma/migrations/20260827092007_membership_multi_tenant`). `prisma
  migrate dev` doesn't work in this non-interactive environment (see below)
  — migration SQL was hand-written (mirroring the inverse of what
  `role_collapse` did) and applied via `prisma migrate deploy`, which *is*
  supported non-interactively.
- `POST /auth/register` (public): creates a `User` with **zero**
  memberships. They can't log in until a teacher adds them — matches
  `login()`'s existing "no tenant access" rejection, no new state needed.
- Multi-membership login: `login()` now returns a third status,
  `choose-workspace`, when a user has >1 membership, carrying a short-lived
  (5 min) `selectionToken` (a signed JWT, `JWT_ACCESS_SECRET`, never added to
  the `AnyTokenPayload`/`JwtStrategy` union — verified manually, can't be
  used as a Bearer token) + the membership list. `POST
  /auth/select-workspace` completes it into real tokens. `POST
  /auth/switch-workspace` (authenticated) lets an already-logged-in user
  jump to a *different* one of their own memberships without logging out;
  `GET /auth/my-memberships` lists them all. Every existing 0-or-1-membership
  account is behavior-identical — confirmed via the full e2e suite.
- Assignment-by-email: `POST /assignments` now accepts `studentEmail` (in
  addition to the existing `studentMembershipId`). Resolves via a new
  `MembershipsService.findOrCreateStudentMembershipByEmail()` — errors
  clearly if no such user has registered yet (never silently creates a
  `User`; only `/auth/register` does that), auto-creates the STUDENT
  membership if the user exists but isn't a tenant member yet.
- Frontend: `/register` page (redirects to `/login?email=...` pre-filled on
  success, no confirmation screen — user's explicit choice), a
  `choose-workspace-step.tsx` rendered inline on the login page, a "Switch
  workspace" item + `Dialog` in the app-shell's sidebar user menu, and the
  assignment panel's student picker changed from a tenant-members-only
  dropdown to a plain email `Input` (since the whole point is assigning
  students who aren't tenant members yet).
- **The "request a new workspace" flow was deliberately left untouched** —
  it has the exact same one-membership-only guard
  (`tenant-requests.service.ts`), but the user explicitly chose not to
  relax it: someone can now be a member of multiple tenants via
  member-adding/assign-by-email, but still can't request/be granted a
  second brand-new workspace of their own via that specific flow.

**Verified:**
- `tsc -b --force` clean on both `apps/api` and `apps/web`, and `vite build`
  production bundle succeeds.
- Full backend e2e suite: 28/28 passing, including 3 new tests in
  `apps/api/test/auth-multi-tenant.e2e-spec.ts` covering registration,
  assign-by-email (success + "never registered" + "already different role"
  cases), choose-workspace, select-workspace, switch-workspace (including
  the forbidden-cross-user case), and `my-memberships`. The **pre-existing**
  suites (`assignments`, `memberships`, ...) all pass completely unmodified
  — confirms zero regression for the single-membership path every existing
  account is on.
- Full real-browser walkthrough via the headless-Chrome + Puppeteer pipeline
  (see the UI-redesign entry above for how that's set up), driving the
  *actual* new UI end-to-end: register → redirected to `/login` with email
  pre-filled → admin assigns by email from the assignment panel → student
  logs in (single workspace, straight to `/student`) → assigned a second
  workspace via a second tenant → student logs in again → sees the
  choose-workspace picker → selects one → uses the sidebar's "Switch
  workspace" dialog to jump to the other, without logging out.
- **This walkthrough caught two real bugs `tsc`/e2e tests couldn't have**:
  (1) Radix's `DropdownMenuTrigger asChild` overwrites the wrapped
  `SidebarMenuButton`'s `data-slot` attribute with its own
  (`dropdown-menu-trigger`, not `sidebar-menu-button`) — harmless for the
  app itself, but worth knowing if targeting that element in future
  automation. (2) A genuine bug: `switchWorkspace()` updated the access
  token but nothing invalidated React Query's cache, so every tenant-scoped
  query (quizzes, assignments, analytics, ...) kept showing the *previous*
  workspace's data after switching until an unrelated remount happened.
  Fixed by calling `queryClient.clear()` in `auth-context.tsx` after
  `login`'s `'ok'`/`'superadmin'` branches, `selectWorkspace`,
  `switchWorkspace`, and `logout` — confirmed fixed by re-running the same
  walkthrough and checking the post-switch screenshot shows the correct
  tenant's quiz.

**Deviations / environment notes:**
- `prisma migrate dev` refuses to run at all in this non-interactive shell
  environment ("Prisma Migrate has detected that the environment is
  non-interactive, which is not supported") — not just a prompt-skipping
  issue, it exits immediately. Worked around by hand-writing the migration
  SQL (following the exact pattern of the existing migrations — trivial for
  a single index change) and applying with `prisma migrate deploy`
  (officially the correct *non-interactive* command per Prisma's own error
  message). **For any future schema change in this environment, use this
  same hand-write-SQL-then-`migrate deploy` approach** rather than `migrate
  dev`.
- `npx prisma generate` fails with `EPERM: operation not permitted, rename
  ...query_engine-windows.dll.node...` whenever the API dev server
  (`nest start --watch`) is still running, since it holds the query engine
  DLL open. Stop the dev server first, `prisma generate`, then restart it.
- **Jest e2e suite flakiness under default parallel execution**: running
  `npx jest --config ./test/jest-e2e.json` (no flags) — which is what `npm
  run test:e2e` does — intermittently fails most of the suite with a
  bizarre `UnsupportedMediaTypeError: unsupported charset "UTF-8"` on
  requests that work perfectly fine otherwise. This is **resource
  contention from Jest's default parallel workers**, each spinning up a
  full separate NestJS app + Prisma connection pool against the same local
  Postgres instance simultaneously — not a code bug. `npx jest --config
  ./test/jest-e2e.json --runInBand` (serial) is 100% reliable (confirmed
  28/28 passing three times in a row this way, vs. intermittent failures in
  parallel mode). **If e2e tests ever look mysteriously broken in this
  environment, rerun with `--runInBand` before assuming a real regression.**

**Environment state right now:**
- Same services running as before (Postgres, MinIO, API `:3000`, Vite
  `:5173`) — the API dev server was restarted once mid-session (to release
  the Prisma DLL lock for `prisma generate`), no other service changes.
- Dev DB has more QA-created accounts/tenants from this session's browser
  walkthroughs (`flow-student-*@e2e.test`, a couple of auto-approved "Flow
  Beta School ..." tenants, etc.) — left in place, consistent with every
  prior phase's "shared dev DB, not isolated" note.
- Still nothing committed to git in this session beyond what was pushed to
  `github.com/iqbalahson29/test` earlier (see git history for that) — none
  of this feature's changes have been committed yet.

## Post-Phase 6 — Workspace directory, self-service join requests, profile editing — ✅ Complete

Follow-on to the previous entry: that phase left self-registered,
memberless students stuck at "This account has no tenant access" on login
— fully dependent on a teacher proactively assigning them by email. This
phase adds the missing student-initiated half.

**Built:**
- Login no longer rejects 0-membership accounts. `AuthService` gained a new
  `'account'`/`'account-refresh'` token type pair (unlike the
  `WorkspaceSelectionTokenPayload` from last phase, these **are** part of
  `AnyTokenPayload` — they're real Bearer-usable sessions, just scoped to
  no tenant yet) and a `resolveMembershipSession(userId, memberships)`
  helper shared between `login()` and `refresh()`'s new
  `'account-refresh'` branch. That sharing is what makes "upgrade"
  automatic: the moment a join request is approved or the user is
  assign-by-emailed, their next `/auth/refresh` (page reload, or the
  dashboard's manual "Check again" button) re-derives their membership
  count fresh and transparently promotes them to a real `'ok'` session —
  no polling infrastructure needed.
- New `POST/GET /auth/profile` (self-service name/email/password editing,
  any token type via bare `AuthGuard('jwt')` — email/password changes
  require `currentPassword`, name-only doesn't).
- New `workspace-join-requests` module: `GET /directory` (all tenants +
  this user's relationship to each: member/pending/neither), `POST /`
  (request to join), `GET /mine`, and tenant-scoped ADMIN-only `GET /`,
  `POST /:id/approve`, `POST /:id/reject` — mirrors the existing
  `tenant-requests` (superadmin-reviewed, creates a *new* tenant) pattern,
  but scoped to an existing tenant's own ADMIN instead. New
  `WorkspaceJoinRequest` Prisma model, reusing the existing
  `TenantRequestStatus` enum.
- Frontend: register now logs straight in (no more "redirect to /login
  pre-filled" — that workaround is gone now that login actually succeeds
  for 0-membership accounts) and lands on a new `/no-workspace` dashboard;
  a shared `<WorkspaceDirectory>` component (browse + request-to-join +
  "your requests" status list) is reused both there and at
  `/student/join-workspace` (reachable via a new sidebar nav item, per the
  user's choice that browsing/requesting works for already-active students
  too, not just onboarding); a new standalone `/profile` page reachable
  from every role's UI (sidebar dropdown, superadmin header, the
  no-workspace dashboard's header); `members-page.tsx` gained a "Join
  requests" approve/reject section using the exact same styling pattern as
  the superadmin's `tenant-requests-page.tsx`.
- Deliberately **not** touched: the "request a brand-new workspace" flow
  (`tenant-requests.service.ts`) keeps its own pre-existing
  one-membership-only guard as-is — the user explicitly chose not to
  relax that one, only member-adding/join-requests get multi-tenant
  support.

**Verified:**
- Backend: 31/31 e2e tests (2 new spec files:
  `auth-multi-tenant.e2e-spec.ts` had one assertion updated to match the
  deliberately-changed 0-membership-login behavior; new
  `workspace-join-requests.e2e-spec.ts` covers the full directory →
  request → duplicate-rejected → wrong-tenant-admin-blocked →
  approve/reject → login-upgrades flow, plus profile-update cases).
  **Confirmed `--runInBand` can still occasionally be transiently flaky in
  this environment** even though it's normally 100% reliable (one run hit
  a Prisma engine init error across most suites, next run was clean) —
  likely DB contention with the dev API server sharing the same local
  Postgres instance while both hit it hard simultaneously. Re-run before
  trusting a mysterious full-suite failure here, same advice as last
  phase's parallel-mode flakiness note, just a different trigger.
- Frontend: `tsc -b --force` clean, `oxlint` clean (only pre-existing
  warning classes, e.g. `set-state-in-effect` already present in
  `attempt-page.tsx` before this phase), `vite build` succeeds.
- Full real-browser walkthrough (headless Chrome + Puppeteer, per the
  pipeline set up in the UI-redesign phase): register → lands directly on
  `/no-workspace` (no login step) → request to join → admin sees it in
  Members page and approves → student logs back in, single membership now
  → lands on `/student` → edits name via `/profile` → visits
  `/student/join-workspace` and requests a second workspace, confirming
  the "your requests" history correctly shows both the new PENDING and the
  earlier APPROVED entry.
- **Caught one real bug this way that no automated test did**: the profile
  form always submits the (unchanged) `email` field alongside a name-only
  edit, and the backend's `updateProfile` originally checked "is email
  present in the payload" rather than "does it actually differ from the
  current value" — so every name-only save falsely demanded a
  `currentPassword`. Fixed in `AuthService.updateProfile` (compare
  `dto.email !== user.email`, not just `!== undefined`) and added a
  regression case to the e2e spec that submits the unchanged email
  alongside a name edit — the original e2e test had accidentally avoided
  the bug entirely by never including `email` in its name-only-update
  request, unlike what the real form does.

**Environment state right now:**
- Same services running as before. Dev DB has accumulated a large number
  of test tenants from repeated QA walkthroughs across this and the prior
  phase (many "Beta ..." / "Flow ..." workspaces) — left in place per the
  standing "shared dev DB" note.
- Still nothing committed to git beyond the one push to
  `github.com/iqbalahson29/test` from earlier in this session — none of
  this phase's or the prior phase's changes are committed yet.

<!-- Next entry goes above this line. Append one "## Phase N — <name> — status" section per phase, following the same shape: Built / Verified / Deviations / Environment state. -->
