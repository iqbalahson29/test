#!/usr/bin/env bash
# Run on the host with the reviewed archive already unpacked in releases/<commit>.
# The operator creates auth-release-approved containing the exact reviewed commit
# after completing the rollout runbook. This script never resets or seeds a DB.
set -euo pipefail
release_id=${1:?Usage: release.sh COMMIT}
[[ "$release_id" =~ ^[a-f0-9]{40}$ ]] || exit 2
release_root=/opt/quiz-platform
release_dir="$release_root/releases/$release_id"
[[ -d "$release_dir" && -f "$release_root/.env" ]]
[[ "$(cat "$release_root/auth-release-approved")" == "$release_id" ]] || { echo 'This release has no recorded rollout approval.' >&2; exit 1; }
exec 9>"$release_root/release.lock"
flock -n 9 || { echo 'Another release is running.' >&2; exit 1; }
ln -sfn "$release_root/.env" "$release_dir/.env"
export QUIZ_API_IMAGE="quiz-api:$release_id" QUIZ_OPERATIONS_IMAGE="quiz-operations:$release_id"

manifest="$release_dir/release-manifest/release-manifest.txt"
manifest_value() { [[ -f "$manifest" ]] && sed -n "s/^$1=//p" "$manifest" | head -1; }

# The manifest records what CI actually built and tested. Verify the archive on this host is
# that same commit and SPA before anything is installed: a host whose configuration is fine
# can still be handed an artifact whose baked-in SPA settings were never tested.
if [[ -f "$manifest" ]]; then
  [[ "$(manifest_value commit)" == "$release_id" ]] || { echo 'Manifest commit does not match this release.' >&2; exit 1; }
  spa_now=$(cd "$release_dir/apps/web/dist" && find . -type f -print0 | LC_ALL=C sort -z | xargs -0 sha256sum | sha256sum | cut -d' ' -f1)
  [[ "$(manifest_value spa_sha256)" == "$spa_now" ]] || { echo 'SPA bundle does not match the tested manifest.' >&2; exit 1; }
  [[ "$(manifest_value schema_contract)" == "$(cat "$release_dir/deploy/auth-contract-v1")" ]] || { echo 'Schema contract does not match the tested manifest.' >&2; exit 1; }
else
  echo 'No release manifest in this archive; refusing to activate an unverified artifact.' >&2
  exit 1
fi

docker build --target operations -t "$QUIZ_OPERATIONS_IMAGE" -f "$release_dir/apps/api/Dockerfile" "$release_dir"
docker build --target runtime -t "$QUIZ_API_IMAGE" -f "$release_dir/apps/api/Dockerfile" "$release_dir"
# The generated client must initialize in the image that will actually serve traffic.
docker run --rm --network none "$QUIZ_API_IMAGE" node verify-prisma-runtime.mjs
docker run --rm --env-file "$release_root/.env" "$QUIZ_OPERATIONS_IMAGE" pnpm auth:config-check

# The SPA's Google settings are baked at build time and the API validator cannot inspect
# them. Compare the tested build's public configuration with this host's runtime policy;
# a deliberately Google-disabled build is valid only when both agree.
host_google=$(sed -n 's/^AUTH_GOOGLE_ENABLED=//p' "$release_root/.env" | head -1)
host_google=${host_google:-false}
built_google=$(manifest_value google_enabled); built_google=${built_google:-false}
[[ "$host_google" == "$built_google" ]] || { echo "Google policy mismatch: host=$host_google artifact=$built_google" >&2; exit 1; }
if [[ "$host_google" == 'true' ]]; then
  host_client=$(sed -n 's/^GOOGLE_CLIENT_ID=//p' "$release_root/.env" | head -1)
  [[ "$host_client" == "$(manifest_value google_client_id)" ]] || { echo 'Google client id differs between host and tested artifact.' >&2; exit 1; }
fi


# The database password is in .env twice: POSTGRES_PASSWORD initializes the cluster
# (docker-compose.prod.yml) and the password inside DATABASE_URL is what the API and the
# migration below authenticate with. Nothing else compares them, so a mismatch reached the
# migration as a P1000 -- past the maintenance switch, with the site already dark.
db_password=$(sed -n 's/^POSTGRES_PASSWORD=//p' "$release_root/.env" | head -1)
url_password=$(sed -n 's|^DATABASE_URL=postgres\(ql\)\{0,1\}://[^:]*:\([^@]*\)@.*|\2|p' "$release_root/.env" | head -1)
[[ -n "$db_password" && -n "$url_password" ]] || { echo 'POSTGRES_PASSWORD or the DATABASE_URL password is missing from .env.' >&2; exit 1; }
# `docker compose --env-file` strips surrounding quotes and expands $VAR; the plain
# `docker run --env-file` that migrates does neither. Either character makes the two disagree
# at runtime while reading as identical in the file.
both_passwords="$db_password$url_password"
[[ "$both_passwords" != *'"'* && "$both_passwords" != *"'"* && "$both_passwords" != *'$'* ]] \
  || { echo 'Quotes or $ in the database password are read differently by compose and docker run; use neither.' >&2; exit 1; }
# A password holding URL-reserved characters is percent-encoded in DATABASE_URL only, so the
# encoded form of that half is an equally valid match for the raw POSTGRES_PASSWORD.
[[ "$db_password" == "$url_password" || "$db_password" == "$(printf '%b' "${url_password//%/\\x}")" ]] \
  || { echo 'POSTGRES_PASSWORD and the password in DATABASE_URL differ; the migration would fail with P1000.' >&2; exit 1; }
mkdir -p /var/www/quiz-platform/releases
# Every failure after this point intentionally leaves maintenance in place.
touch /var/www/quiz-platform/maintenance
# Keep a copy of the configuration this release replaces so rollback can restore the pair.
backup_dir="$release_root/nginx-backup/$release_id"
mkdir -p "$backup_dir"
for pair in "/etc/nginx/conf.d/quiz-logging.conf:quiz-logging.conf" \
            "/etc/nginx/snippets/quiz-security-headers.conf:quiz-security-headers.conf" \
            "/etc/nginx/sites-available/quiz-platform:quiz-platform"; do
  src=${pair%%:*}; name=${pair##*:}
  [[ -f "$src" && ! -f "$backup_dir/$name" ]] && cp -a "$src" "$backup_dir/$name"
done
install -m 644 "$release_dir/deploy/logging.conf" /etc/nginx/conf.d/quiz-logging.conf
install -m 644 "$release_dir/deploy/security-headers.conf" /etc/nginx/snippets/quiz-security-headers.conf
install -m 644 "$release_dir/deploy/nginx-quiz-platform.conf" /etc/nginx/sites-available/quiz-platform
nginx -t
systemctl reload nginx

# Create dependencies and wait for them to be *ready*, not merely started, before the one
# explicit migration invocation. An empty or cold host otherwise reaches migrate first.
docker compose -p quiz-platform --env-file "$release_root/.env" -f "$release_dir/docker-compose.prod.yml" up -d --wait postgres minio
docker run --rm --network quiz-platform_default --env-file "$release_root/.env" "$QUIZ_OPERATIONS_IMAGE" pnpm exec prisma migrate deploy

# Staging must be safe to re-run: `cp -a` into an existing directory nests a second copy,
# so a retried release would otherwise serve releases/<id>/dist instead of releases/<id>.
static_dir="/var/www/quiz-platform/releases/$release_id"
if [[ -e "$static_dir" ]]; then
  staged=$(find "$static_dir" -type f -print0 | sort -z | xargs -0 sha256sum | sha256sum | cut -d' ' -f1)
  [[ "$staged" == "$(manifest_value spa_sha256)" ]] || { echo 'Existing staged SPA differs from this release; remove it before retrying.' >&2; exit 1; }
else
  rm -rf "$static_dir.staging"
  cp -a "$release_dir/apps/web/dist" "$static_dir.staging"
  mv -T "$static_dir.staging" "$static_dir"
fi

# The container is told which release it is, so the gate below can confirm the running
# process is this build rather than a survivor of a previous attempt.
AUTH_RELEASE_ID="$release_id" \
docker compose -p quiz-platform --env-file "$release_root/.env" -f "$release_dir/docker-compose.prod.yml" up -d --no-build --no-deps api

# Activation gate, still behind maintenance and over the loopback port only. `/health` alone
# answers SELECT 1, which a previous release on the wrong schema would also answer.
ready=''
for attempt in $(seq 1 30); do
  if body=$(curl --fail --silent http://127.0.0.1:3000/health/release); then ready=$body; break; fi
  [[ "$attempt" != 30 ]] || { echo 'Readiness failed; maintenance remains active.' >&2; exit 1; }
  sleep 2
done
grep -q "\"releaseId\":\"$release_id\"" <<<"$ready" || { echo 'The running API is not this release; maintenance remains active.' >&2; exit 1; }
grep -q '"status":"ok"' <<<"$ready" || { echo 'Auth schema readiness failed; maintenance remains active.' >&2; exit 1; }
# Storage must be usable before the public proxy reopens; a logged failure is not evidence.
docker compose -p quiz-platform --env-file "$release_root/.env" -f "$release_dir/docker-compose.prod.yml" \
  exec -T minio mc ready local >/dev/null || { echo 'Storage is not ready; maintenance remains active.' >&2; exit 1; }

ln -sfn "/var/www/quiz-platform/releases/$release_id" /var/www/quiz-platform/current.next
mv -Tf /var/www/quiz-platform/current.next /var/www/quiz-platform/current
ln -sfn "$release_dir" "$release_root/current.next"
mv -Tf "$release_root/current.next" "$release_root/current"
printf '%s\n' "$release_id" > "$release_root/active-release"
rm -f /var/www/quiz-platform/maintenance
echo 'Matching API and SPA release activated. Complete the runbook smoke checks.'
