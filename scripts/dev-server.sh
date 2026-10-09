#!/bin/sh
# Start the legacy server for development and Inspector tests.
# Load .env locally so credentials never appear in command-line arguments.
cd "$(dirname "$0")/.." || exit 1
set -a
. ./.env
set +a
exec npx tsx src/stdio.ts
