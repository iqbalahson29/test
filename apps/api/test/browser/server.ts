import '../test-env';
import 'reflect-metadata';
import { createServer } from 'node:https';
import { request as httpRequest } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import {
  makeApp,
  resetDatabase,
  createUser,
  latestCode,
} from '../auth-test-helpers';
import { OtpService } from '../../src/auth/otp.service';
const root = resolve(__dirname, '../../../web/dist'),
  fixtureRoot = resolve('/tmp/quiz-auth-browser');
async function main() {
  const { app, db, mail, clock } = await makeApp();
  await app.listen(55433, '127.0.0.1');
  const mime: Record<string, string> = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.mjs': 'text/javascript',
    '.css': 'text/css',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
  };
  const server = createServer(
    {
      key: readFileSync(fixtureRoot + '/key.pem'),
      cert: readFileSync(fixtureRoot + '/cert.pem'),
    },
    (req, res) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Referrer-Policy', 'no-referrer');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('Cache-Control', 'no-store');
      // Production sends Cross-Origin-Opener-Policy from nginx (deploy/security-headers.conf)
      // and the API sends its own through helmet, which this proxy forwards untouched. It is
      // left off the documents served here because a COOP document makes Playwright's Firefox
      // lose the navigation's load event -- page.goto then hangs until the test times out even
      // though the page is complete. Nothing in these specs depends on the header.
      if (req.url?.startsWith('/api/')) {
        const proxy = httpRequest(
          {
            hostname: '127.0.0.1',
            port: 55433,
            path: req.url.slice(4),
            method: req.method,
            headers: {
              ...req.headers,
              'x-forwarded-for': req.socket.remoteAddress ?? '127.0.0.1',
              'x-forwarded-proto': 'https',
            },
          },
          (upstream) => {
            res.writeHead(upstream.statusCode ?? 503, upstream.headers);
            upstream.pipe(res);
          },
        );
        proxy.on('error', () => {
          res.statusCode = 503;
          res.end();
        });
        req.pipe(proxy);
        return;
      }
      if (req.url === '/__fixture') {
        res.setHeader('Content-Type', 'text/html');
        res.end(
          '<!doctype html><html><body><script src="/__fixture.js"></script></body></html>',
        );
        return;
      }
      if (req.url === '/__fixture.js') {
        res.setHeader('Content-Type', 'text/javascript');
        res.end(readFileSync(fixtureRoot + '/client.js'));
        return;
      }
      const url = new URL(req.url ?? '/', 'https://localhost'),
        candidate = resolve(root, '.' + decodeURIComponent(url.pathname));
      const path =
        candidate.startsWith(root + '/') &&
        existsSync(candidate) &&
        statSync(candidate).isFile()
          ? candidate
          : root + '/index.html';
      res.setHeader(
        'Content-Type',
        mime[extname(path)] ?? 'application/octet-stream',
      );
      res.end(readFileSync(path));
    },
  );
  server.listen(55434, '127.0.0.1', () => process.send?.({ ready: true }));
  process.on(
    'message',
    (m: {
      id: number;
      command: string;
      email?: string;
      challengeId?: string;
      ms?: number;
    }) => {
      void (async () => {
        if (m.command === 'reset') {
          await app.get(OtpService).drain();
          await resetDatabase(db);
          mail.messages.length = 0;
          return true;
        }
        if (m.command === 'user')
          return (await createUser(app, { email: m.email, verified: true })).id;
        if (m.command === 'code') return latestCode(app, mail, m.challengeId!);
        if (m.command === 'advance') {
          clock.advance(m.ms!);
          return true;
        }
        return null;
      })()
        .then((result) => process.send?.({ id: m.id, result }))
        .catch(() =>
          process.send?.({ id: m.id, error: 'Test fixture operation failed' }),
        );
    },
  );
  process.on('SIGTERM', () => {
    server.close();
    void app.close().finally(() => process.exit());
  });
}
void main().catch(() => {
  process.stderr.write('Browser fixture startup failed\n');
  process.exit(1);
});
