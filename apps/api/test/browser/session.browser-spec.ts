import { test, expect, Page } from '@playwright/test';
import { fork, ChildProcess, execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
/**
 * The SPA exposes its session coordinator on `window.authTest` for these runs, and the
 * fixture server answers over IPC. Both were reached through `any`, which switched off the
 * no-unsafe-* rules for most of this file. Declaring the two bridges here keeps the rest of
 * the spec type-checked without changing what it exercises.
 */
interface SessionClaims {
  sub: string;
  sessionId: string;
  contextVersion: number;
  refreshGeneration: number;
  exp: number;
  type: string;
  tenantId?: string;
}
interface AuthTestBridge {
  acceptSessionResult(result: unknown): void;
  decodeClaims(token: string | null): SessionClaims | null;
  getAccessToken(): string | null;
  refreshSession(force?: boolean): Promise<unknown>;
  clearSession(expired?: boolean): void;
  retryConnection(): Promise<void>;
  writesPaused(): boolean;
  apiGet(path: string): Promise<unknown>;
  apiPost(path: string, body: Record<string, unknown>): Promise<unknown>;
  logoutSession(all?: boolean, forgetDevice?: boolean): Promise<void>;
  authOperation(
    path: string,
    body?: unknown,
    options?: {
      protected?: boolean;
      method?: string;
      completeSession?: boolean;
    },
  ): Promise<unknown>;
}
declare global {
  interface Window {
    authTest: AuthTestBridge;
  }
}
/** What the coordinator rejects with; the specs assert on the classified code. */
interface CoordinatorError {
  code?: string;
}
/** One reply from the fixture server, correlated by `id`. */
interface FixtureMessage {
  id?: number;
  ready?: boolean;
  error?: string;
  result?: unknown;
}
let server: ChildProcess,
  id = 0;
const calls = new Map<
  number,
  { resolve: (result: unknown) => void; reject: (error: Error) => void }
>();
function rpc<T = unknown>(command: string, data: Record<string, unknown> = {}) {
  return new Promise<T>((resolve, reject) => {
    const key = ++id;
    calls.set(key, { resolve: resolve, reject });
    server.send({ id: key, command, ...data });
  });
}
test.beforeAll(async () => {
  mkdirSync('/tmp/quiz-auth-browser', { recursive: true });
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-days',
      '1',
      '-subj',
      '/CN=localhost',
      '-addext',
      'subjectAltName=DNS:localhost,IP:127.0.0.1',
      '-keyout',
      '/tmp/quiz-auth-browser/key.pem',
      '-out',
      '/tmp/quiz-auth-browser/cert.pem',
    ],
    { stdio: 'ignore' },
  );
  execFileSync(
    resolve('../../packages/shared/node_modules/.bin/esbuild'),
    [
      'test/browser/client.ts',
      '--bundle',
      '--format=iife',
      '--platform=browser',
      '--outfile=/tmp/quiz-auth-browser/client.js',
    ],
    { stdio: 'ignore' },
  );
  server = fork(resolve('test/browser/server.ts'), [], {
    execArgv: ['-r', 'ts-node/register/transpile-only'],
    env: {
      ...process.env,
      AUTH_BROWSER_TEST_ORIGIN: 'https://localhost:55434',
    },
    stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
  });
  await new Promise<void>((resolve, reject) => {
    server.once('exit', () => reject(new Error('Fixture failed to start')));
    server.on('message', (m: FixtureMessage) => {
      if (m.ready) resolve();
      const call = m.id === undefined ? undefined : calls.get(m.id);
      if (call) {
        calls.delete(m.id!);
        if (m.error) call.reject(new Error(m.error));
        else call.resolve(m.result);
      }
    });
  });
});
test.afterAll(async () => {
  if (server) {
    server.kill('SIGTERM');
    await new Promise((resolve) => server.once('exit', resolve));
  }
});
test.beforeEach(async () => {
  await rpc('reset');
});
function result(
  version = 1,
  context = 1,
  session = '00000000-0000-4000-a000-000000000001',
  sub = 'user-1',
) {
  const payload = {
    sub,
    sessionId: session,
    contextVersion: context,
    refreshGeneration: version,
    exp: Math.floor(Date.now() / 1000) + 600,
    type: 'access',
    tenantId: 'tenant-' + context,
  };
  return {
    status: 'ok',
    accessToken:
      'test.' +
      Buffer.from(JSON.stringify(payload)).toString('base64url') +
      '.fixture',
    membership: {
      membershipId: 'member-' + context,
      tenantId: payload.tenantId,
      tenantName: 'Fixture',
      role: 'STUDENT',
    },
  };
}
async function harness(page: Page) {
  await page.goto('/__fixture');
  await page.waitForFunction(() => !!window.authTest);
}
async function apply(page: Page, value = result()) {
  await page.evaluate((v) => window.authTest.acceptSessionResult(v), value);
}
async function claims(page: Page) {
  return page.evaluate(() =>
    window.authTest.decodeClaims(window.authTest.getAccessToken()),
  );
}
test('OTP keyboard entry, no auto-submit, secure HttpOnly cookies and no persisted credentials', async ({
  page,
  context,
}) => {
  await rpc('user', { email: 'browser@example.test' });
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill('browser@example.test');
  await page.getByLabel('Password', { exact: true }).fill('Password123');
  const response = page.waitForResponse(
    (r) => r.url().endsWith('/auth/login') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  const challenge = (await (await response).json()) as { challengeId: string };
  const input = page.getByLabel('Six-digit verification code');
  await expect(input).toBeFocused();
  await expect(input).toHaveAttribute('autocomplete', 'one-time-code');
  await expect(page.getByRole('checkbox')).not.toBeChecked();
  const code = await rpc<string>('code', {
    challengeId: challenge.challengeId,
  });
  await input.fill(code);
  await expect(
    page.getByRole('button', { name: 'Verify code', exact: true }),
  ).toBeEnabled();
  await expect(input).toBeVisible();
  await page.getByRole('button', { name: 'Verify code', exact: true }).click();
  await expect(page).not.toHaveURL(/\/login$/);
  const cookies = await context.cookies();
  expect(
    cookies.some(
      (c) =>
        c.name === '__Host-refresh_token' &&
        c.httpOnly &&
        c.secure &&
        c.sameSite === 'Lax' &&
        c.path === '/',
    ),
  ).toBe(true);
  expect(await page.evaluate(() => document.cookie)).not.toContain(
    'refresh_token',
  );
  const storage = await page.evaluate(() =>
    JSON.stringify([
      Object.entries(localStorage),
      Object.entries(sessionStorage),
    ]),
  );
  expect(storage).not.toContain(code);
  expect(storage).not.toContain('Password123');
  expect(storage).not.toContain('accessToken');
});
test('eight parallel protected 401s produce exactly one refresh and one replay each', async ({
  page,
}) => {
  await harness(page);
  await apply(page);
  let refreshes = 0,
    calls = 0;
  await page.route('**/api/auth/refresh', async (route) => {
    refreshes++;
    await new Promise((r) => setTimeout(r, 100));
    await route.fulfill({ json: result(2) });
  });
  await page.route('**/api/probe', (route) => {
    calls++;
    return route.fulfill(
      route.request().headers().authorization?.includes(result().accessToken)
        ? { status: 401, json: { code: 'SESSION_INVALID' } }
        : { json: { ok: true } },
    );
  });
  const responses = await page.evaluate(() =>
    Promise.all(
      Array.from({ length: 8 }, () => window.authTest.apiGet('/probe')),
    ),
  );
  expect(responses).toHaveLength(8);
  expect(refreshes).toBe(1);
  expect(calls).toBe(16);
});
test('two tabs share refresh results and logout', async ({ page, context }) => {
  const other = await context.newPage();
  await harness(page);
  await harness(other);
  await apply(page);
  await expect
    .poll(() => claims(other))
    .toMatchObject({ refreshGeneration: 1 });
  let count = 0;
  await context.route('**/api/auth/refresh', async (route) => {
    count++;
    await new Promise((r) => setTimeout(r, 150));
    await route.fulfill({ json: result(2) });
  });
  await Promise.all([
    page.evaluate(() => window.authTest.refreshSession()),
    other.evaluate(() => window.authTest.refreshSession()),
  ]);
  expect(count).toBe(1);
  await page.evaluate(() => window.authTest.clearSession());
  await expect.poll(() => claims(other)).toBeNull();
});
for (const blocked of [false, true])
  test(`coordinates without Web Locks, storage blocked=${blocked}`, async ({
    page,
  }) => {
    await page.addInitScript((blocked) => {
      Object.defineProperty(navigator, 'locks', { value: undefined });
      if (blocked) {
        Object.defineProperty(window, 'localStorage', {
          get() {
            throw new DOMException('blocked', 'SecurityError');
          },
        });
      }
    }, blocked);
    await harness(page);
    await apply(page);
    let count = 0;
    await page.route('**/api/auth/refresh', (route) => {
      count++;
      return route.fulfill({ json: result(2) });
    });
    await page.evaluate(() =>
      Promise.all(
        Array.from({ length: 8 }, () => window.authTest.refreshSession()),
      ),
    );
    expect(count).toBe(1);
  });
test('logout during a refresh discards both local and late broadcast results', async ({
  page,
}) => {
  await harness(page);
  await apply(page);
  let release!: () => void;
  const pending = new Promise<void>((r) => (release = r));
  let started!: () => void;
  const begin = new Promise<void>((r) => (started = r));
  await page.route('**/api/auth/refresh', async (route) => {
    started();
    await pending;
    await route.fulfill({ json: result(2) });
  });
  const refresh = page.evaluate(() =>
    window.authTest.refreshSession().catch((e: CoordinatorError) => e.code),
  );
  await begin;
  await page.evaluate(() => window.authTest.clearSession());
  release();
  expect(await refresh).toBe('AUTH_CONTEXT_CHANGED');
  expect(await claims(page)).toBeNull();
  await page.evaluate((value) => {
    const channel = new BroadcastChannel('quiz-auth');
    channel.postMessage({
      owner: 'late-tab',
      version: 1,
      event: { type: 'result', result: value },
    });
    channel.close();
  }, result(2));
  expect(await claims(page)).toBeNull();
});
test('workspace/account changes during a POST never replay the old mutation', async ({
  page,
}) => {
  await harness(page);
  await apply(page);
  let sends = 0;
  let release!: () => void;
  const pending = new Promise<void>((r) => (release = r));
  let started!: () => void;
  const begin = new Promise<void>((r) => (started = r));
  await page.route('**/api/change', async (route) => {
    sends++;
    started();
    await pending;
    await route.fulfill({ status: 401, json: { code: 'SESSION_INVALID' } });
  });
  await page.route('**/api/auth/refresh', (route) =>
    route.fulfill({ json: result(3, 2) }),
  );
  const update = page.evaluate(() =>
    window.authTest
      .apiPost('/change', { title: 'Old workspace draft' })
      .catch((e: CoordinatorError) => e.code),
  );
  await begin;
  await apply(page, result(2, 2));
  release();
  expect(await update).toBe('AUTH_CONTEXT_CHANGED');
  expect(sends).toBe(1);
});
/**
 * F02 regressions. The test above covers a POST that receives a 401 *after* it was sent.
 * These cover the two windows before transmission: the operation waiting in the queue, and
 * the operation waiting on /auth/context. In both the account is replaced mid-wait, and the
 * requirement is stricter than "report a conflict" -- the mutation must never be sent at
 * all, because a conflict reported after transmission cannot undo a server-side write.
 */
test('an operation queued under one account sends nothing after the account is replaced', async ({
  page,
}) => {
  await harness(page);
  await apply(page);
  let sends = 0;
  await page.route('**/api/change', async (route) => {
    sends++;
    await route.fulfill({ json: { ok: true } });
  });

  // Occupy the coordinator so the second operation is still queued when the account changes.
  let releaseHolder!: () => void;
  const holderPending = new Promise<void>((r) => (releaseHolder = r));
  let holderStarted!: () => void;
  const holderRunning = new Promise<void>((r) => (holderStarted = r));
  await page.route('**/api/hold', async (route) => {
    holderStarted();
    await holderPending;
    await route.fulfill({ json: { ok: true } });
  });
  const holder = page.evaluate(() =>
    window.authTest
      .authOperation('/hold', {}, { protected: true })
      .catch((e: CoordinatorError) => e.code),
  );
  await holderRunning;

  // Queued behind the holder, captured while account A is current.
  const queued = page.evaluate(() =>
    window.authTest
      .authOperation(
        '/change',
        { title: 'Account A draft' },
        { protected: true },
      )
      .catch((e: CoordinatorError) => e.code),
  );
  // Account B becomes current before the queued callback ever begins.
  await apply(
    page,
    result(1, 1, '00000000-0000-4000-a000-000000000002', 'user-2'),
  );
  releaseHolder();
  await holder;

  expect(await queued).toBe('AUTH_CONTEXT_CHANGED');
  expect(sends).toBe(0);
});
test('an account change while /auth/context is in flight sends no mutation', async ({
  page,
}) => {
  await harness(page);
  await apply(page);
  let sends = 0;
  await page.route('**/api/change', async (route) => {
    sends++;
    await route.fulfill({ json: { ok: true } });
  });

  let releaseContext!: () => void;
  const contextPending = new Promise<void>((r) => (releaseContext = r));
  let contextStarted!: () => void;
  const contextRunning = new Promise<void>((r) => (contextStarted = r));
  await page.route('**/api/auth/context', async (route) => {
    contextStarted();
    await contextPending;
    await route.fulfill({ json: {} });
  });

  const update = page.evaluate(() =>
    window.authTest
      .authOperation(
        '/change',
        { title: 'Account A draft' },
        { protected: true },
      )
      .catch((e: CoordinatorError) => e.code),
  );
  await contextRunning;
  await apply(
    page,
    result(1, 1, '00000000-0000-4000-a000-000000000002', 'user-2'),
  );
  releaseContext();

  expect(await update).toBe('AUTH_CONTEXT_CHANGED');
  expect(sends).toBe(0);
});
test('a refresh within the same context still lets a queued operation through', async ({
  page,
}) => {
  await harness(page);
  await apply(page);
  let sends = 0;
  await page.route('**/api/change', async (route) => {
    sends++;
    await route.fulfill({ json: { ok: true } });
  });
  // Same user, same session, same context version: only the refresh generation moves. The
  // fencing must not treat an ordinary token rotation as an account change.
  await apply(page, result(2));

  const update = page.evaluate(() =>
    window.authTest.authOperation(
      '/change',
      { title: 'Same account' },
      { protected: true },
    ),
  );
  await expect(update).resolves.toEqual({ ok: true });
  expect(sends).toBe(1);
});
test('a failed logout is superseded by a new login instead of revoking it', async ({
  page,
}) => {
  await harness(page);
  await apply(page);
  // The logout cannot reach the server, so it stays pending.
  await page.route('**/api/auth/logout', (route) => route.abort('failed'));
  expect(
    await page.evaluate(() =>
      window.authTest
        .logoutSession()
        .then(() => 'resolved')
        .catch((e: CoordinatorError) => e.code ?? 'rejected'),
    ),
  ).not.toBe('resolved');

  // A new account signs in on the same browser.
  await apply(
    page,
    result(1, 1, '00000000-0000-4000-a000-000000000002', 'user-2'),
  );

  let logoutSends = 0;
  await page.unroute('**/api/auth/logout');
  await page.route('**/api/auth/logout', async (route) => {
    logoutSends++;
    await route.fulfill({ json: { ok: true } });
  });
  // With no logout outstanding, retryConnection falls through to an ordinary refresh for
  // the replacement session, so that endpoint answers as account B.
  await page.route('**/api/auth/refresh', (route) =>
    route.fulfill({
      json: result(2, 1, '00000000-0000-4000-a000-000000000002', 'user-2'),
    }),
  );
  // Anything that drives the pending queue must not replay the old logout as this account.
  await page.evaluate(() => window.authTest.retryConnection().catch(() => {}));

  expect(logoutSends).toBe(0);
  const current = await claims(page);
  expect(current?.sub).toBe('user-2');
});
test('offline/503 preserve state and pause mutations, online retry recovers; 403 never refreshes', async ({
  page,
  context,
}) => {
  await harness(page);
  await apply(page);
  await context.setOffline(true);
  expect(
    await page.evaluate(() =>
      window.authTest.refreshSession().catch((e: CoordinatorError) => e.code),
    ),
  ).toBe('OFFLINE');
  expect(await claims(page)).not.toBeNull();
  expect(await page.evaluate(() => window.authTest.writesPaused())).toBe(true);
  await page.route('**/api/auth/refresh', (route) =>
    route.fulfill({ status: 503, json: { code: 'AUTH_RETRY_LATER' } }),
  );
  await context.setOffline(false);
  await page.evaluate(() => window.authTest.refreshSession().catch(() => {}));
  expect(await claims(page)).not.toBeNull();
  await page.unroute('**/api/auth/refresh');
  let count = 0;
  await page.route('**/api/auth/refresh', (route) => {
    count++;
    return route.fulfill({ json: result(2) });
  });
  await page.evaluate(() => window.authTest.retryConnection());
  expect(await page.evaluate(() => window.authTest.writesPaused())).toBe(false);
  await page.route('**/api/forbidden', (route) =>
    route.fulfill({ status: 403, json: { code: 'FORBIDDEN' } }),
  );
  const before = count;
  await page.evaluate(() =>
    window.authTest.apiGet('/forbidden').catch(() => {}),
  );
  expect(count).toBe(before);
});
test('refresh race recovery stops after three attempts', async ({ page }) => {
  await harness(page);
  await apply(page);
  let count = 0;
  await page.route('**/api/auth/refresh', (route) => {
    count++;
    return route.fulfill({
      status: 409,
      json: { code: 'REFRESH_RACE', retryAfterSeconds: 1 },
    });
  });
  expect(
    await page.evaluate(() =>
      window.authTest.refreshSession().catch((e: CoordinatorError) => e.code),
    ),
  ).toBe('REFRESH_RACE');
  expect(count).toBe(3);
  expect(await claims(page)).not.toBeNull();
});
