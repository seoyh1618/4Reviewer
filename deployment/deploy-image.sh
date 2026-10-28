#!/usr/bin/env bash
set -euo pipefail
umask 077
revision=${1:-}
[[ "$revision" =~ ^[0-9a-f]{40}$ ]] || { echo 'Invalid revision' >&2; exit 2; }
cd /opt/4reviewer
exec 9>/opt/4reviewer/deploy.lock
flock -w 300 9
# The restricted deployment key can upload an image and update this project only.
gzip -dc | docker load
image="for-reviewer:${revision}"
[[ $(docker image inspect "$image" --format '{{.Config.User}}') == 'node' ]] || exit 2
compose=(docker compose --project-directory /opt/4reviewer -f compose.yml --env-file .env)
/opt/4reviewer/bin/backup.sh
cp .env .env.previous
set -a
source .env
set +a
# Migrations run separately from the restricted application role.
PGPASSWORD="$POSTGRES_ADMIN_PASSWORD" docker run --rm --network for-reviewer_database \
  --memory 256m --cpus .5 --read-only --cap-drop ALL --security-opt no-new-privileges:true \
  -e PGHOST=postgres -e PGPORT=5432 -e PGUSER=reviewer_admin -e PGPASSWORD \
  -e PGDATABASE=reviewer -e PGSCHEMA=reviewer "$image" node server/migrate.mjs
sed -i "s|^APP_IMAGE=.*|APP_IMAGE=${image}|;s|^APP_REVISION=.*|APP_REVISION=${revision}|" .env
# Values read by compose come from the file, not the preceding migration environment.
unset APP_IMAGE APP_REVISION
if "${compose[@]}" up -d --no-deps --wait --wait-timeout 90 app; then
  "${compose[@]}" up -d --no-deps proxy
  # nginx resolves a replaced app container when reloaded.
  "${compose[@]}" exec -T proxy nginx -s reload
  printf '%s\n' "$revision" > deployed-revision
  printf 'Deployed %s\n' "$revision"
else
  cp .env.previous .env
  previous_image=$(sed -n 's/^APP_IMAGE=//p' .env)
  if docker image inspect "$previous_image" >/dev/null 2>&1; then
    "${compose[@]}" up -d --no-deps --wait --wait-timeout 90 app
    echo 'Application deployment failed; previous app restored.' >&2
  else
    echo 'Initial application deployment failed; no previous image exists.' >&2
  fi
  exit 1
fi
