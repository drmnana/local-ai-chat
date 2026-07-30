# Local Chat Viewer prerequisite bootstrap for Windows.
# Installs or updates Node.js, Claude Code, and Codex CLI, then launches login checks.

[CmdletBinding()]
param(
  [switch]$SkipNodeInstall,
  [switch]$SkipClaudeInstall,
  [switch]$SkipCodexInstall,
  [switch]$SkipLoginPrompts
)

$ErrorActionPreference = "Stop"

function Write-Step {
  param([string]$Message)
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Write-Ok {
  param([string]$Message)
  Write-Host "OK: $Message" -ForegroundColor Green
}

function Write-Warn {
  param([string]$Message)
  Write-Host "WARN: $Message" -ForegroundColor Yellow
}

function Test-Command {
  param([string]$Name)
  return $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Refresh-Path {
  $machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
  $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
  $env:Path = @($machinePath, $userPath) -join ";"
}

function Invoke-Checked {
  param(
    [string]$FilePath,
    [string[]]$Arguments
  )

  Write-Host "> $FilePath $($Arguments -join ' ')"
  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed with exit code ${LASTEXITCODE}: $FilePath $($Arguments -join ' ')"
  }
}

function Ensure-Node {
  Write-Step "Checking Node.js and npm"
  Refresh-Path

  if ((Test-Command "node") -and (Test-Command "npm")) {
    Invoke-Checked "node" @("--version")
    Invoke-Checked "npm" @("--version")
    Write-Ok "Node.js and npm are available."
    return
  }

  if ($SkipNodeInstall) {
    throw "Node.js or npm is missing, and -SkipNodeInstall was provided."
  }

  if (-not (Test-Command "winget")) {
    throw "Node.js or npm is missing and winget is not available. Install Node.js LTS from https://nodejs.org/, reopen PowerShell, then rerun this script."
  }

  Write-Step "Installing Node.js LTS with winget"
  Invoke-Checked "winget" @(
    "install",
    "--id", "OpenJS.NodeJS.LTS",
    "-e",
    "--accept-package-agreements",
    "--accept-source-agreements"
  )

  Refresh-Path
  if (-not ((Test-Command "node") -and (Test-Command "npm"))) {
    throw "Node.js was installed, but node/npm are not visible yet. Close PowerShell, open a new PowerShell window, and rerun this script."
  }

  Invoke-Checked "node" @("--version")
  Invoke-Checked "npm" @("--version")
  Write-Ok "Node.js and npm are available."
}

function Ensure-Claude {
  Write-Step "Installing or updating Claude Code"
  Refresh-Path

  if (-not $SkipClaudeInstall) {
    Invoke-Checked "npm" @("install", "-g", "@anthropic-ai/claude-code")
    Refresh-Path
  }

  if (-not (Test-Command "claude")) {
    throw "The claude command is not available. Reopen PowerShell and rerun this script."
  }

  Invoke-Checked "claude" @("--version")
  Write-Ok "Claude Code is installed."
}

function Ensure-Codex {
  Write-Step "Installing or updating Codex CLI"
  Refresh-Path

  if (-not $SkipCodexInstall) {
    try {
      Invoke-Checked "powershell" @(
        "-NoProfile",
        "-ExecutionPolicy", "ByPass",
        "-Command", "irm https://chatgpt.com/codex/install.ps1 | iex"
      )
    } catch {
      Write-Warn "Codex standalone installer failed. Falling back to npm install -g @openai/codex."
      Invoke-Checked "npm" @("install", "-g", "@openai/codex")
    }
    Refresh-Path
  }

  if (-not (Test-Command "codex")) {
    throw "The codex command is not available. Reopen PowerShell and rerun this script."
  }

  Invoke-Checked "codex" @("--version")
  Write-Ok "Codex CLI is installed."
}

function Run-LoginPrompts {
  if ($SkipLoginPrompts) {
    Write-Warn "Skipping login prompts. Run claude and codex manually before using Local Chat Viewer automation."
    return
  }

  Write-Step "Claude login"
  Write-Host "A Claude Code session will open next. Complete login if prompted, then type /exit to return here."
  Read-Host "Press Enter to launch Claude"
  & claude

  Write-Step "Codex login"
  Write-Host "A Codex session will open next. Choose Sign in with ChatGPT if prompted, complete browser login, then exit Codex."
  Read-Host "Press Enter to launch Codex"
  & codex
}

function Run-FinalChecks {
  Write-Step "Final verification"
  Refresh-Path
  Invoke-Checked "where.exe" @("claude")
  Invoke-Checked "where.exe" @("codex")
  Invoke-Checked "claude" @("--version")
  Invoke-Checked "codex" @("--version")

  Write-Host ""
  Write-Host "Run these two commands after login to confirm both CLIs can answer headless prompts:" -ForegroundColor Yellow
  Write-Host '  claude -p "reply with OK"'
  Write-Host '  codex exec "reply with OK"'
}

try {
  Ensure-Node
  Ensure-Claude
  Ensure-Codex
  Run-LoginPrompts
  Run-FinalChecks

  Write-Host ""
  Write-Ok "Prerequisite setup finished. Install or launch Local Chat Viewer next."
} catch {
  Write-Host ""
  Write-Host "Setup failed: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
