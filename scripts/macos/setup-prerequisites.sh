#!/usr/bin/env bash
set -euo pipefail

skip_node_install=0
skip_claude_install=0
skip_codex_install=0
skip_login_prompts=0

for arg in "$@"; do
  case "$arg" in
    --skip-node-install) skip_node_install=1 ;;
    --skip-claude-install) skip_claude_install=1 ;;
    --skip-codex-install) skip_codex_install=1 ;;
    --skip-login-prompts) skip_login_prompts=1 ;;
    -h|--help)
      cat <<'EOF'
Usage: ./scripts/macos/setup-prerequisites.sh [options]

Options:
  --skip-node-install
  --skip-claude-install
  --skip-codex-install
  --skip-login-prompts
EOF
      exit 0
      ;;
    *)
      echo "Unknown option: $arg" >&2
      exit 2
      ;;
  esac
done

step() {
  printf '\n==> %s\n' "$1"
}

ok() {
  printf 'OK: %s\n' "$1"
}

warn() {
  printf 'WARN: %s\n' "$1"
}

have() {
  command -v "$1" >/dev/null 2>&1
}

run_checked() {
  printf '> %s\n' "$*"
  "$@"
}

ensure_shell_path() {
  export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.npm-global/bin:$HOME/.local/bin:$PATH"
}

install_node_pkg() {
  step "Downloading the official Node.js LTS installer"
  local index version pkg_path
  index="$(curl -fsSL https://nodejs.org/dist/index.json)" || return 1
  version="$(printf '%s' "$index" | tr '}' '\n' | grep -m1 '"lts":"' | sed -E 's/.*"version":"([^"]+)".*/\1/')"
  [ -n "$version" ] || return 1
  pkg_path="$(mktemp -d)/node-${version}.pkg"
  run_checked curl -fL "https://nodejs.org/dist/${version}/node-${version}.pkg" -o "$pkg_path" || return 1
  step "Installing Node.js ${version}"
  echo "The macOS Installer will open now. Complete it (your admin password is required)."
  echo "This script waits for the installer to finish, then continues automatically."
  open -W "$pkg_path"
}

ensure_node() {
  step "Checking Node.js and npm"
  ensure_shell_path

  if have node && have npm; then
    run_checked node --version
    run_checked npm --version
    ok "Node.js and npm are available."
    return
  fi

  if [ "$skip_node_install" -eq 1 ]; then
    echo "Node.js or npm is missing, and --skip-node-install was provided." >&2
    exit 1
  fi

  if have brew; then
    step "Installing Node.js with Homebrew"
    run_checked brew install node
  else
    if ! install_node_pkg; then
      cat >&2 <<'EOF'
Could not download the Node.js installer automatically.
Install Node.js LTS from https://nodejs.org/, open a new Terminal window, then rerun this script.
EOF
      exit 1
    fi
  fi

  ensure_shell_path
  hash -r 2>/dev/null || true
  if ! have node || ! have npm; then
    echo "Node.js is still not found. If the installer completed, open a new Terminal window and rerun this script." >&2
    exit 1
  fi
  run_checked node --version
  run_checked npm --version
  ok "Node.js and npm are available."
}

ensure_npm_prefix() {
  local prefix
  prefix="$(npm config get prefix 2>/dev/null || true)"
  [ -n "$prefix" ] || prefix="/usr/local"

  if [ -w "$prefix/lib/node_modules" ]; then
    return
  fi
  if [ ! -e "$prefix/lib/node_modules" ] && [ -w "$prefix/lib" ]; then
    return
  fi

  step "Configuring npm to install global packages in your home folder"
  echo "The default npm folder ($prefix) needs admin rights, so global installs go to ~/.npm-global instead."
  mkdir -p "$HOME/.npm-global"
  run_checked npm config set prefix "$HOME/.npm-global"
  ensure_shell_path

  if ! grep -qs '\.npm-global/bin' "$HOME/.zshrc" 2>/dev/null; then
    printf '\nexport PATH="$HOME/.npm-global/bin:$PATH"\n' >> "$HOME/.zshrc"
    ok "Added ~/.npm-global/bin to PATH in ~/.zshrc"
  fi
  ok "npm global installs now go to ~/.npm-global (no admin password needed)."
}

ensure_claude() {
  step "Installing or updating Claude Code"
  ensure_shell_path

  if [ "$skip_claude_install" -eq 0 ]; then
    run_checked npm install -g @anthropic-ai/claude-code
  fi

  ensure_shell_path
  if ! have claude; then
    echo "The claude command is not available. Open a new Terminal window and rerun this script." >&2
    exit 1
  fi

  run_checked claude --version
  ok "Claude Code is installed."
}

ensure_codex() {
  step "Installing or updating Codex CLI"
  ensure_shell_path

  if [ "$skip_codex_install" -eq 0 ]; then
    if ! npm install -g @openai/codex; then
      echo "Codex npm install failed. Check your npm permissions, then rerun this script." >&2
      exit 1
    fi
  fi

  ensure_shell_path
  if ! have codex; then
    echo "The codex command is not available. Open a new Terminal window and rerun this script." >&2
    exit 1
  fi

  run_checked codex --version
  ok "Codex CLI is installed."
}

run_login_prompts() {
  if [ "$skip_login_prompts" -eq 1 ]; then
    warn "Skipping login prompts. Run claude and codex manually before using Local Chat Viewer automation."
    return
  fi

  step "Claude login"
  echo "A Claude Code session will open next. Complete login if prompted, then type /exit to return here."
  read -r -p "Press Enter to launch Claude"
  claude

  step "Codex login"
  echo "A Codex session will open next. Choose Sign in with ChatGPT if prompted, complete browser login, then exit Codex."
  read -r -p "Press Enter to launch Codex"
  codex
}

run_final_checks() {
  step "Final verification"
  ensure_shell_path
  run_checked command -v claude
  run_checked command -v codex
  run_checked claude --version
  run_checked codex --version

  cat <<'EOF'

Run these two commands after login to confirm both CLIs can answer headless prompts:
  claude -p "reply with OK"
  codex exec "reply with OK"
EOF
}

ensure_node
ensure_npm_prefix
ensure_claude
ensure_codex
run_login_prompts
run_final_checks

printf '\nOK: Prerequisite setup finished. Launch Local Chat Viewer next.\n'
