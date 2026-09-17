#!/usr/bin/env bash
# Run on the host with the CI-built archive already unpacked in releases/<commit>. Deploy is
# now fully automatic (every push to main that passes CI runs this), so there is no separate
# human rollout approval step -- the manifest/SPA/schema checks below are what stand in its
# place. This script never resets or seeds a DB.
set -euo pipefail
release_id=${1:?Usage: release.sh COMMIT}
[[ "$release_id" =~ ^[a-f0-9]{40}$ ]] || exit 2
release_root=/opt/quiz-platform
release_dir="$release_root/releases/$release_id"
[[ -d "$release_dir" && -f "$release_root/.env" ]]
exec 9>"$release_root/release.lock"
flock -n 9 || { echo 'Another release is running.' >&2; exit 1; }
ln -sfn "$release_root/.env" "$release_dir/.env"
export QUIZ_API_IMAGE="quiz-api:$release_id" QUIZ_OPERATIONS_IMAGE="quiz-operations:$release_id"

manifest="$release_dir/release-manifest/release-manifest.txt"
manifest_value() { [[ -f "$manifest" ]] && sed -n "s/^$1=//p" "$manifest" | head -1; }
# Must stay identical to how CI records spa_sha256 in deploy.yml. sha256sum prints each file's
# path, so the same files hashed from a different directory, or sorted in another locale, differ.
spa_hash() { (cd "$1" && find . -type f -print0 | LC_ALL=C sort -z | xargs -0 sha256sum | sha256sum | cut -d' ' -f1); }
compose() { docker compose -p quiz-platform --env-file "$release_root/.env" -f "$release_dir/docker-compose.prod.yml" "$@"; }

# The manifest records what CI actually built and tested. Verify the archive on this host is
# that same commit and SPA before anything is installed: a host whose configuration is fine
# can still be handed an artifact whose baked-in SPA settings were never tested.
if [[ -f "$manifest" ]]; then
  [[ "$(manifest_value commit)" == "$release_id" ]] || { echo 'Manifest commit does not match this release.' >&2; exit 1; }
  spa_now=$(spa_hash "$release_dir/apps/web/dist")
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

# Create dependencies and wait for them to be *ready*, not merely started. On a running host this
# is a no-op, so it happens before the maintenance switch: the rehearsal below needs the database.
compose up -d --wait postgres minio

# Storage must work from the API's network with the API's own S3 settings, and a fresh MinIO
# volume has no bucket yet. Checked here, while the site is still up: the API only logs a failed
# bucket check at startup, so a wrong endpoint or key used to show up as broken uploads instead.
docker run --rm --network quiz-platform_default --env-file "$release_root/.env" "$QUIZ_OPERATIONS_IMAGE" \
    node scripts/ensure-storage-bucket.mjs \
  || { echo 'Storage is not usable with the S3_* settings in .env (error above). Nothing was changed; the site is still up.' >&2; exit 1; }

# Rehearse the migration on a throwaway copy of the live database while the site is still up.
# CI only ever migrates an empty database, and two failures only this host can produce were
# otherwise discovered by the real migration, with the site already dark:
# - P1000 although .env is consistent: a data volume keeps the password it was initialized with.
#   POSTGRES_PASSWORD applies to an empty volume only, so editing .env later changes nothing.
# - A migration that fails on existing rows. A failed migration is also recorded in the real
#   database, and every later deploy then stops with P3009 until it is resolved by hand.
db_url=$(sed -n 's/^DATABASE_URL=//p' "$release_root/.env" | head -1)
db_query=''; [[ "$db_url" == *'?'* ]] && db_query="?${db_url#*\?}"
db_base=${db_url%%\?*}
db_name=${db_base##*/}
rehearsal_db="${db_name}_release_rehearsal"
drop_rehearsal() { compose exec -T postgres sh -c 'dropdb -U "$POSTGRES_USER" --if-exists --force "$1"' sh "$rehearsal_db"; }
drop_rehearsal
compose exec -T postgres bash -c 'set -eo pipefail; createdb -U "$POSTGRES_USER" "$1"
  pg_dump -U "$POSTGRES_USER" --no-owner "$2" | psql -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$1" >/dev/null' \
  bash "$rehearsal_db" "$db_name"
# `-e DATABASE_URL` without a value takes it from this environment, keeping the password out of argv.
if ! DATABASE_URL="${db_base%/*}/$rehearsal_db$db_query" docker run --rm --network quiz-platform_default \
    --env-file "$release_root/.env" -e DATABASE_URL "$QUIZ_OPERATIONS_IMAGE" pnpm exec prisma migrate deploy; then
  drop_rehearsal
  echo 'Migrations failed on a copy of the live database (Prisma error above). Nothing was changed; the site is still up.' >&2
  echo 'P1000: the password stored in the database differs from .env. P3009: an earlier attempt left a failed migration.' >&2
  exit 1
fi
drop_rehearsal

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
# A fresh host, or one whose old site files were removed, has no enabled site yet.
ln -sfn /etc/nginx/sites-available/quiz-platform /etc/nginx/sites-enabled/quiz-platform
nginx -t
systemctl reload nginx

docker run --rm --network quiz-platform_default --env-file "$release_root/.env" "$QUIZ_OPERATIONS_IMAGE" pnpm exec prisma migrate deploy

# Staging must be safe to re-run: `cp -a` into an existing directory nests a second copy,
# so a retried release would otherwise serve releases/<id>/dist instead of releases/<id>.
static_dir="/var/www/quiz-platform/releases/$release_id"
if [[ -e "$static_dir" ]]; then
  staged=$(spa_hash "$static_dir")
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

# Housekeeping for a release that is already live, so a failure here is reported but never fails
# the deploy. Each release leaves an unpacked archive, a copy of the SPA and multi-GB images;
# kept forever they fill the droplet's disk. The most recently activated releases stay complete
# for rollback.sh (directory, SPA and API image). Only the active release keeps its operations
# image, which is what migrations and `auth:bootstrap` run from.
keep_releases=3
printf '%s\n' "$release_id" >> "$release_root/release-history"
prune_old_releases() {
  local keep id
  keep=$(tac "$release_root/release-history" | awk 'NF && !seen[$0]++' | head -n "$keep_releases")
  for id in $({ find "$release_root/releases" /var/www/quiz-platform/releases "$release_root/nginx-backup" \
                  -mindepth 1 -maxdepth 1 -printf '%f\n' 2>/dev/null
                find "$release_root" -maxdepth 1 -name 'release-*.tar.gz' -printf '%f\n' | sed 's/^release-//; s/\.tar\.gz$//'
                docker image ls --format '{{.Tag}}' quiz-api
                docker image ls --format '{{.Tag}}' quiz-operations
              } | grep -E '^[a-f0-9]{40}$' | sort -u); do
    [[ "$id" == "$release_id" ]] || docker image rm "quiz-operations:$id" >/dev/null 2>&1 || true
    grep -qx "$id" <<<"$keep" && continue
    rm -rf "$release_root/releases/$id" "/var/www/quiz-platform/releases/$id" \
      "$release_root/nginx-backup/$id" "$release_root/release-$id.tar.gz"
    docker image rm "quiz-api:$id" >/dev/null 2>&1 || true
  done
  find /var/www/quiz-platform/releases -mindepth 1 -maxdepth 1 -name '*.staging' -exec rm -rf {} +
  docker image prune -f >/dev/null
  # Almost all build cache sits after `COPY . .`, which no later release can reuse; dropping it
  # costs the next build only the short toolchain setup before that line.
  docker builder prune -af >/dev/null
  echo "Releases kept for rollback: $(tr '\n' ' ' <<<"$keep")"
  df -h / | awk 'NR == 2 {print "Disk: " $4 " free of " $2}'
}
prune_old_releases || echo 'Warning: cleaning up old releases failed; check free disk space on the host.' >&2
