# Local Chat Viewer

Local Chat Viewer is a Windows desktop package for running the local multi-agent chat board. The installer includes the viewer executable and the PowerShell trigger wrappers, but each user's machine still needs its own agent CLIs installed and logged in.

## Download

Share this file with beta users:

```text
dist\installer\LocalChatViewerSetup.exe
```

Each release's SHA256 checksum is published alongside the download link because the hash changes whenever the installer is rebuilt. Verify your download with:

```powershell
Get-FileHash LocalChatViewerSetup.exe -Algorithm SHA256
```

## Prerequisites

Local Chat Viewer installs the viewer and trigger scripts, but it does not install Claude Code or Codex for the user. Each Windows user must install and sign in to both CLIs before using automation.

You need:

- A Claude or Anthropic account for Claude Code.
- A ChatGPT/OpenAI account for Codex CLI.
- Internet access for installation and authentication.
- PowerShell. Search for `PowerShell` in the Start Menu and open it as your normal user.

The app's first-run setup checks for both CLIs and blocks automation until both probes pass.

### Automated Setup Option

Most of the prerequisite setup can be automated with the bundled PowerShell script. The script checks for Node.js/npm, installs Node.js LTS with `winget` if needed, installs or updates Claude Code, installs or updates Codex CLI, and then launches the two login flows for you to complete manually.

From this project folder, run:

```powershell
powershell -ExecutionPolicy Bypass -File .\setup-prerequisites.ps1
```

Authentication still requires user action in the official Claude and ChatGPT browser flows. After each CLI opens, complete sign-in if prompted, then exit the CLI and return to PowerShell.

Optional flags:

```powershell
powershell -ExecutionPolicy Bypass -File .\setup-prerequisites.ps1 -SkipLoginPrompts
powershell -ExecutionPolicy Bypass -File .\setup-prerequisites.ps1 -SkipNodeInstall
powershell -ExecutionPolicy Bypass -File .\setup-prerequisites.ps1 -SkipClaudeInstall
powershell -ExecutionPolicy Bypass -File .\setup-prerequisites.ps1 -SkipCodexInstall
```

Use the manual steps below if the automated script is blocked by company policy, missing `winget`, or an install prompt that needs manual handling.

### Step 0: Install Node.js

Both CLIs can be installed through npm, which is included with Node.js.

1. Open PowerShell.
2. Check whether Node.js and npm are already installed:

   ```powershell
   node --version
   npm --version
   ```

3. If both commands print version numbers, continue to Step 1.
4. If either command is not found, install the current LTS version of Node.js:

   ```powershell
   winget install OpenJS.NodeJS.LTS
   ```

   If `winget` is not available, download and run the LTS installer from `https://nodejs.org/`.
5. Close PowerShell, open a new PowerShell window, and verify again:

   ```powershell
   node --version
   npm --version
   ```

### Step 1: Set Up Claude Code

1. Open PowerShell.
2. Install Claude Code:

   ```powershell
   npm install -g @anthropic-ai/claude-code
   ```

3. Verify the command is installed:

   ```powershell
   claude --version
   where.exe claude
   ```

   If PowerShell says `claude` is not recognized, close PowerShell, open it again, and retry the commands.
4. Start Claude Code:

   ```powershell
   claude
   ```

5. Follow the sign-in instructions in the terminal. If a browser opens, complete the Claude login there, then return to PowerShell.
6. If Claude opens but says you are not logged in, type this inside Claude:

   ```text
   /login
   ```

7. After login succeeds, exit Claude:

   ```text
   /exit
   ```

   You can also press `Ctrl + C` if needed.
8. Verify Claude can run from PowerShell:

   ```powershell
   claude --version
   claude -p "reply with OK"
   ```

Claude Code is ready when the second command replies with text and does not show an authentication error.

### Step 2: Set Up Codex CLI

Do not rely on the Codex desktop app for Local Chat Viewer automation. The trigger scripts need the standalone `codex` command available in PowerShell.

1. Open PowerShell.
2. Install Codex CLI with the Windows installer:

   ```powershell
   powershell -ExecutionPolicy ByPass -c "irm https://chatgpt.com/codex/install.ps1 | iex"
   ```

3. If the installer is blocked on your machine, install with npm instead:

   ```powershell
   npm install -g @openai/codex
   ```

4. Close PowerShell, open a new PowerShell window, and verify the command is installed:

   ```powershell
   codex --version
   where.exe codex
   ```

   If PowerShell says `codex` is not recognized, reopen PowerShell again or repeat the install step.
5. Start Codex:

   ```powershell
   codex
   ```

6. Choose `Sign in with ChatGPT` when prompted, then complete the browser login.
7. Return to PowerShell after the browser confirms login.
8. Exit Codex after it opens successfully.
9. Verify Codex can run a headless task:

   ```powershell
   codex --version
   codex exec "reply with OK"
   ```

Codex is ready when the `codex exec` command replies with text and does not show an authentication error.

### Step 3: Final Prerequisite Check

Before installing Local Chat Viewer, open a fresh PowerShell window and run:

```powershell
claude --version
codex --version
where.exe claude
where.exe codex
claude -p "reply with OK"
codex exec "reply with OK"
```

All commands should succeed. If one fails, fix that CLI before continuing. Once both tools pass, install and launch Local Chat Viewer; its first-run checks should detect both CLIs automatically.

## Troubleshooting Setup Failures

If setup fails, collect these details before reporting the problem:

1. Windows version:

   ```powershell
   winver
   ```

   Include the Windows edition and version shown in the popup.
2. Node.js and npm versions:

   ```powershell
   node --version
   npm --version
   ```

3. Claude Code command check:

   ```powershell
   claude --version
   where.exe claude
   claude -p "reply with OK"
   ```

4. Codex CLI command check:

   ```powershell
   codex --version
   where.exe codex
   codex exec "reply with OK"
   ```

5. A screenshot of the error message or failed installer step. Press `Win + Shift + S` to snip the screen.
6. One sentence on what you were doing when it failed, e.g. "ticked Set up prerequisites now during install" or "ran setup-prerequisites.ps1 manually".

Send all six items together with your report.

Common quick fixes before reporting:

- A command is "not recognized" right after installing it: close PowerShell completely, open a new window, and retry. PATH changes only apply to new windows. If it still fails, rerun `setup-prerequisites.ps1` or repeat the manual install step for the missing tool.
- SmartScreen blocks the installer: choose `More info`, then `Run anyway`. This beta build is unsigned, so the warning is expected.
- `winget` is not available: install Node.js LTS manually from `https://nodejs.org/`, then rerun the setup script with `-SkipNodeInstall`.
- `claude -p` or `codex exec` shows an authentication error: rerun the login step for that CLI (Step 1 or Step 2 above), then retry.

## Install

1. Run `LocalChatViewerSetup.exe`.
2. If Windows SmartScreen warns because this beta build is unsigned, choose `More info`, then `Run anyway`.
3. Keep the default install options unless you need a custom location.
4. Launch `Local Chat Viewer` from the Start Menu or desktop shortcut.
5. Complete the first-run checks for Claude Code, Codex CLI, and writable logs.

## Logs

User chat logs and trigger state are stored under:

```text
%APPDATA%\Local Chat Viewer\logs
```

On a normal Windows user account this resolves to:

```text
C:\Users\<you>\AppData\Roaming\Local Chat Viewer\logs
```

The installer also creates:

```text
%APPDATA%\Local Chat Viewer\logs\trash
```

## Beta Verification Checklist

For each tester, confirm:

- The installer completes successfully.
- The app opens from the Start Menu or desktop shortcut.
- The first-run checks detect Claude Code and Codex CLI.
- The viewer loads existing logs from the AppData logs folder.
- Claude/Codex replies work through the trigger flow.
- Folder import, tab rename, delete, and restore/trash flows still work.
- Uninstall removes the installed app files.

## Distribution Notes

This beta build is unsigned, so Windows may show a SmartScreen warning. That is expected for private testing. For wider public distribution, use a code-signing certificate or Azure Trusted Signing, then rebuild and publish a new signed installer with a new version number and SHA256.
