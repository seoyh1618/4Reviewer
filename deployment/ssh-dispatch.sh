#!/usr/bin/env bash
set -euo pipefail
if [[ ${SSH_ORIGINAL_COMMAND:-} =~ ^deploy\ ([0-9a-f]{40})$ ]]; then
  exec sudo -n /usr/local/sbin/4reviewer-deploy "${BASH_REMATCH[1]}"
fi
echo 'Only the For Reviewer deployment command is allowed.' >&2
exit 2
