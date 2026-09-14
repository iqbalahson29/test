#!/usr/bin/env bash
# Roll back only to a previously validated release using this same auth schema.
# Database restoration is a separate runbook operation requiring invalidation.
set -euo pipefail
release_id=${1:?Usage: rollback.sh PREVIOUS_COMMIT}
[[ "$release_id" =~ ^[a-f0-9]{40}$ ]] || exit 2
release_root=/opt/quiz-platform
release_dir="$release_root/releases/$release_id"
[[ -f "$release_dir/deploy/auth-contract-v1" && -d "/var/www/quiz-platform/releases/$release_id" ]]
exec 9>"$release_root/release.lock"
flock -n 9
export QUIZ_API_IMAGE="quiz-api:$release_id"
docker image inspect "$QUIZ_API_IMAGE" >/dev/null
# The target must speak the schema currently in the database: rollback restores the
# API/SPA pair, never the schema.
[[ "$(cat "$release_dir/deploy/auth-contract-v1")" == "$(cat "$release_root/current/deploy/auth-contract-v1")" ]] \
  || { echo 'Schema contract differs; this needs the separate restore procedure.' >&2; exit 1; }

touch /var/www/quiz-platform/maintenance

# Restore the configuration that belongs with this release. Release installs nginx, logging
# and header files; leaving the newer ones in place would pair old code with new config.
for pair in "/etc/nginx/conf.d/quiz-logging.conf:logging.conf" \
            "/etc/nginx/snippets/quiz-security-headers.conf:security-headers.conf" \
            "/etc/nginx/sites-available/quiz-platform:nginx-quiz-platform.conf"; do
  dest=${pair%%:*}; name=${pair##*:}
  [[ -f "$release_dir/deploy/$name" ]] && install -m 644 "$release_dir/deploy/$name" "$dest"
done
nginx -t || { echo 'Restored nginx configuration is invalid; maintenance remains active.' >&2; exit 1; }
systemctl reload nginx

AUTH_RELEASE_ID="$release_id" \
docker compose -p quiz-platform --env-file "$release_root/.env" -f "$release_dir/docker-compose.prod.yml" up -d --no-build --no-deps api

# The same activation gate the forward release uses, still behind maintenance.
ready=''
for attempt in $(seq 1 30); do
  if body=$(curl --fail --silent http://127.0.0.1:3000/health/release); then ready=$body; break; fi
  [[ "$attempt" != 30 ]] || { echo 'Rollback readiness failed; maintenance remains active.' >&2; exit 1; }
  sleep 2
done
grep -q "\"releaseId\":\"$release_id\"" <<<"$ready" || { echo 'The running API is not the rollback target; maintenance remains active.' >&2; exit 1; }
grep -q '"status":"ok"' <<<"$ready" || { echo 'Auth schema readiness failed; maintenance remains active.' >&2; exit 1; }

ln -sfn "/var/www/quiz-platform/releases/$release_id" /var/www/quiz-platform/current.next
mv -Tf /var/www/quiz-platform/current.next /var/www/quiz-platform/current
ln -sfn "$release_dir" "$release_root/current.next"
mv -Tf "$release_root/current.next" "$release_root/current"
printf '%s\n' "$release_id" > "$release_root/active-release"
rm -f /var/www/quiz-platform/maintenance
echo "Rolled back to $release_id. Old capabilities remain valid; revoke separately if required."
