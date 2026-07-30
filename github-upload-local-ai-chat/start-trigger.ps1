$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$env:CLAUDE_TRIGGER_CMD = "powershell -NoProfile -ExecutionPolicy Bypass -File `"$here\claude-reply.ps1`""

Set-Location $here
node trigger.js
