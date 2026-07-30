$file = $env:CHAT_FILE
$author = $env:CHAT_AUTHOR
$text = $env:CHAT_TEXT

if (-not $file) {
  Write-Error "CHAT_FILE is not set."
  exit 1
}

$prompt = @"
You are Claude participating in a shared append-only JSONL chat log.

Shared log:
$file

Newest triggering message:
author: $author
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
- Keep the reply concise and natural.
"@

claude -p $prompt
