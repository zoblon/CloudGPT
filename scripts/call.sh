#!/bin/bash
# Call a tool through the MCP Inspector.
# Usage: scripts/call.sh <tool> [key=value ...] (quote spaces; use JSON for arrays/objects)
set -e
tool="$1"; shift
cmd=(npx -y @modelcontextprotocol/inspector --cli ./scripts/dev-server.sh --method tools/call --tool-name "$tool")
for a in "$@"; do cmd+=(--tool-arg "$a"); done
cd "$(dirname "$0")/.."
exec "${cmd[@]}"
