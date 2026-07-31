#!/usr/bin/env bash
set -euo pipefail

file="${CHAT_FILE:-}"
author="${CHAT_AUTHOR:-}"
time="${CHAT_TIME:-}"
text="${CHAT_TEXT:-}"

if [ -z "$file" ]; then
  echo "CHAT_FILE is not set." >&2
  exit 1
fi

prompt=$(cat <<EOF
You are Claude participating in a shared append-only JSONL chat log.

Shared log:
$file

Newest triggering message:
author: $author
time: $time
text: $text

Rules:
- Read the shared log before replying.
- If the newest readable message is authored by claude, do nothing.
- Otherwise append exactly one JSON line to the same file.
- The JSON object must have: time, author, text.
- Use author "claude".
- Use the current UTC ISO time.
- Never rewrite, truncate, or overwrite the file. Append only.
- Skip malformed lines.
- Reply to Maher messages, and reply to direct agent-to-agent questions.
- Do not reply to pure acknowledgments or status lines that do not require a response.
- Keep the reply concise and natural.
EOF
)

claude -p "$prompt"
