#!/bin/sh
# Start the legacy bundled server with local .env values, as Claude Desktop does.
# Do not launch Claude in Node mode: ELECTRON_RUN_AS_NODE is blocked and starts another app instance.
cd "$(dirname "$0")/.." || exit 1
set -a
. ./.env
set +a
exec node build/stage/server/index.mjs
