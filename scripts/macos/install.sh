#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
app_dir="$HOME/Applications/Local Chat Viewer"
bin_dir="$HOME/.local/bin"

export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.npm-global/bin:$HOME/.local/bin:$PATH"

if ! command -v npm >/dev/null 2>&1; then
  echo "Node.js/npm not found. Running prerequisite setup first..."
  "$root/scripts/macos/setup-prerequisites.sh"
  export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.npm-global/bin:$HOME/.local/bin:$PATH"
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is still not available. Install Node.js LTS from https://nodejs.org/, open a new Terminal, and rerun this script." >&2
  exit 1
fi

mkdir -p "$app_dir" "$bin_dir"

cp "$root/server.js" "$root/trigger.js" "$root/index.html" "$root/asset-index.js" "$root/package.json" "$root/package-lock.json" "$app_dir/"
mkdir -p "$app_dir/scripts/macos"
cp "$root/scripts/macos/"*.sh "$app_dir/scripts/macos/"
chmod +x "$app_dir/scripts/macos/"*.sh

(
  cd "$app_dir"
  npm ci --omit=dev
)

cat > "$bin_dir/local-chat-viewer" <<EOF
#!/usr/bin/env bash
cd "$app_dir"
exec node server.js
EOF

cat > "$bin_dir/local-chat-viewer-trigger" <<EOF
#!/usr/bin/env bash
exec "$app_dir/scripts/macos/start-trigger.sh"
EOF

chmod +x "$bin_dir/local-chat-viewer" "$bin_dir/local-chat-viewer-trigger"

cat <<EOF
Installed Local Chat Viewer to:
  $app_dir

Launch the viewer:
  $bin_dir/local-chat-viewer

Launch the trigger worker in a second Terminal:
  $bin_dir/local-chat-viewer-trigger

If $bin_dir is not on PATH, add this to ~/.zshrc:
  export PATH="\$HOME/.local/bin:\$PATH"
EOF
