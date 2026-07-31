#!/usr/bin/env bash
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/../.." && pwd)"

export CLAUDE_TRIGGER_CMD="$here/claude-reply.sh"

cd "$root"
exec node trigger.js
