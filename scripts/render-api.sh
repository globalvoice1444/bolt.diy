#!/usr/bin/env bash
# Host-locked wrapper for the Render REST API.
#
# The origin is built here, not passed in, so this script cannot be aimed at
# any host other than api.render.com. RENDER_API_KEY is read from the
# environment and only ever reaches curl's Authorization header -- it is never
# echoed, logged or written to disk.
#
#   ./scripts/render-api.sh GET  /v1/services?limit=50
#   ./scripts/render-api.sh POST /v1/services @payload.json
#
# Do NOT add curl's -L/--location here. Redirects are deliberately not followed:
# following one would replay the Authorization header at whatever host the
# redirect names, which is exactly the leak the fixed origin above prevents.
set -euo pipefail

method="${1:?usage: render-api.sh <METHOD> <path> [body|@file.json]}"
path="${2:?usage: render-api.sh <METHOD> <path> [body|@file.json]}"
body="${3:-}"

: "${RENDER_API_KEY:?RENDER_API_KEY is not set in the environment}"

case "$path" in
  /*) ;;
  *) printf 'path must be an absolute API path starting with /\n' >&2; exit 2 ;;
esac

args=(--silent --show-error --write-out '\nHTTP %{http_code}\n'
      --request "$method"
      --header 'Accept: application/json'
      --header "Authorization: Bearer ${RENDER_API_KEY}")

if [ -n "$body" ]; then
  args+=(--header 'Content-Type: application/json' --data "$body")
fi

curl "${args[@]}" "https://api.render.com${path}"
