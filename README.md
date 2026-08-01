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

## macOS Beta Install

The macOS port is source-based for the first test round (no `.dmg` yet). The whole setup is one script plus two launch commands. These steps were verified end to end on a real Mac.

### One-time setup (about 10 minutes)

1. **Download the project.** On the GitHub page choose `Code` > `Download ZIP`, then double-click the ZIP in Downloads to unzip it. (Or `git clone` if you use git.)
2. **Open Terminal in the project folder.** Open Terminal, type `cd ` (with a space after it), drag the unzipped folder from Finder onto the Terminal window, and press Enter. Every command below assumes you are in this folder.
3. **Run the installer:**

   ```bash
   bash scripts/macos/install.sh
   ```

   One script does everything: it checks for Node.js and installs it if missing, installs or updates Claude Code and Codex CLI, walks you through both logins, verifies both CLIs answer, copies the app to `~/Applications/Local Chat Viewer`, and creates the two launcher commands in `~/.local/bin`.

4. **Complete the two logins when prompted.** The installer opens the real Claude Code app in your terminal on purpose - this is the login step, not a hang. Sign in if asked (a browser window may open), then type `/exit` and press Enter to return to the installer. It then does the same for Codex: sign in with ChatGPT, then exit. The installer resumes automatically and finishes with a "setup is complete" style message.

### Running it (every time)

Open two Terminal windows and leave both running:

- **Terminal 1 - backend + viewer** (this IS the server; there is no separate backend to start):

  ```bash
  ~/.local/bin/local-chat-viewer
  ```

- **Terminal 2 - trigger worker** (launches Claude and Codex when messages arrive):

  ```bash
  ~/.local/bin/local-chat-viewer-trigger
  ```

  Wait for `Trigger watcher running` and the lines showing the built-in claude and codex launchers.

Then open `http://localhost:3000` in your browser, start a conversation, and send a test message like `hello both`. Terminal 2 should show `[trigger:claude]` and `[trigger:codex]` lines with no errors, and both replies should appear in the chat.

**Known limitation:** the page does not auto-refresh yet - reload the browser tab to see new replies. Live polling is planned.

### macOS Troubleshooting

- **`install.sh: No such file or directory`** - Terminal is not inside the project folder. Type `cd ` (with a space) and drag the project folder onto Terminal, press Enter, then rerun the command. Alternatively type `bash ` and drag the `install.sh` file itself onto Terminal.
- **Claude "takes over" the terminal during install** - expected; that is the login step. Sign in, then type `/exit` (or press `Ctrl+C` twice) to hand control back to the installer.
- **Send button does nothing in the browser** - check the address bar reads `http://localhost:3000`, not `file://...` (the raw HTML file cannot talk to the server), and confirm Terminal 1 is still running the viewer.
- **`spawn codex ENOENT` or `No such file` errors in Terminal 2** - you are running an old copy. Re-download the ZIP (or `git pull`), rerun `bash scripts/macos/install.sh`, and restart both terminals.
- **`command not found` for the launchers** - use the full paths shown above, or add `export PATH="$HOME/.local/bin:$PATH"` to `~/.zshrc` and open a new Terminal.

Advanced: `install.sh` runs `scripts/macos/setup-prerequisites.sh` automatically; you only need to run it directly if you want its skip flags (`--skip-login-prompts`, `--skip-node-install`, `--skip-claude-install`, `--skip-codex-install`). The experimental macOS SEA build script at `scripts/macos/build-sea.sh` is not release-ready until built and tested on macOS.

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
