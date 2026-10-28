#!/usr/bin/env bash
set -euo pipefail
umask 077
cd /opt/4reviewer
mkdir -p backups
stamp=$(date -u +%Y%m%dT%H%M%SZ)
output="backups/reviewer-${stamp}.dump.enc"
trap 'rm -f "${output}.tmp"' EXIT
docker exec for-reviewer-postgres-1 pg_dump -U reviewer_admin -d reviewer -Fc |
  openssl enc -aes-256-cbc -salt -pbkdf2 -iter 200000 -pass file:backup.key -out "${output}.tmp"
mv "${output}.tmp" "$output"
find backups -name 'reviewer-*.dump.enc' -mtime +14 -delete
printf 'Encrypted backup created: %s\n' "$output"
