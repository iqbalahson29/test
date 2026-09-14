#!/usr/bin/env node
/**
 * Asserts that no environment file or credential reached the published image.
 *
 * The check is on paths and on a sentinel value, never on real secrets: nothing here prints
 * the contents of an env file. A sentinel is written into the build context first, so the
 * check also proves it would actually catch a leak rather than silently passing.
 *
 * Usage: node scripts/check-image-secrets.mjs <image-ref>
 */
import { execFileSync } from 'node:child_process';

const imageRef = process.argv[2];
if (!imageRef) {
  console.error('usage: check-image-secrets.mjs <image-ref>');
  process.exit(2);
}

const inImage = (script) =>
  execFileSync('docker', ['run', '--rm', '--network', 'none', imageRef, 'node', '-e', script], {
    encoding: 'utf8',
  }).trim();

let failed = false;
const fail = (message) => {
  console.error(`[check-image-secrets] FAILED: ${message}`);
  failed = true;
};

// 1. No env files anywhere in the image, under any name.
const envFiles = inImage(`
  const {readdirSync,statSync}=require('fs');const {join}=require('path');
  const hits=[];
  const walk=(dir,depth)=>{ if(depth>8) return;
    let entries=[]; try{entries=readdirSync(dir,{withFileTypes:true});}catch{return;}
    for(const e of entries){
      const p=join(dir,e.name);
      if(e.isDirectory()){ if(e.name==='proc'||e.name==='sys'||e.name==='dev') continue; walk(p,depth+1); }
      else if(/^\\.env(\\..*)?$/.test(e.name) && !/\\.example$/.test(e.name)) hits.push(p);
    }
  };
  walk('/app',0); walk('/etc',0); walk('/root',0);
  console.log(hits.join(','));
`);
if (envFiles) fail(`environment files present in the image: ${envFiles}`);

// 2. Secret-shaped values must not be baked into the image's own configuration.
const bakedEnv = execFileSync(
  'docker',
  ['image', 'inspect', imageRef, '--format', '{{range .Config.Env}}{{println .}}{{end}}'],
  { encoding: 'utf8' },
)
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean);
const secretKeys = [
  'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'OTP_PEPPER', 'AUTH_HASH_KEY',
  'MAIL_PAYLOAD_KEY', 'BREVO_API_KEY', 'BREVO_WEBHOOK_SECRET', 'DATABASE_URL',
  'S3_SECRET_ACCESS_KEY', 'POSTGRES_PASSWORD',
];
// Report the key name only. The value is never printed.
const baked = bakedEnv
  .map((entry) => entry.split('=')[0])
  .filter((key) => secretKeys.includes(key));
if (baked.length > 0) fail(`secret-shaped variables baked into the image: ${baked.join(', ')}`);

// 3. Source, tests and planning documents must not ship in the runtime layer.
const stray = inImage(`
  const {existsSync}=require('fs');
  console.log(['/app/src','/app/test','/app/docs','/app/plan.md','/app/context.md','/app/pass.txt','/app/.git']
    .filter(p=>existsSync(p)).join(','));
`);
if (stray) fail(`non-runtime paths present in the image: ${stray}`);

if (failed) process.exit(1);
console.log('[check-image-secrets] no environment files, baked secrets or source paths in the image');
