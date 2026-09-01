#!/usr/bin/env bash
set -Eeuo pipefail

readonly deploy_command="/usr/local/sbin/hero-rush-v2-deploy"
original_command="${SSH_ORIGINAL_COMMAND:-}"

if [[ "$original_command" =~ ^/usr/local/sbin/hero-rush-v2-deploy[[:space:]]([0-9a-f]{40})$ ]]; then
  exec "$deploy_command" "${BASH_REMATCH[1]}"
fi

printf '拒绝执行非 Hero-Rush V2 发布命令。\n' >&2
exit 126
