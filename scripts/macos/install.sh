#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
app_dir="$HOME/Applications/Local Chat Viewer"
bin_dir="$HOME/.local/bin"

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
