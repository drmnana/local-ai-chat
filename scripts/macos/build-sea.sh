#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$root"

dist="$root/dist/macos"
index_path="$root/index.html"
asset_path="$root/asset-index.js"
bundle_path="$dist/bundle.cjs"
sea_config_path="$dist/sea-config.json"
sea_blob_path="$dist/sea-prep.blob"
binary_path="$dist/local-chat-viewer"

mkdir -p "$dist"

node -e 'const fs = require("fs"); process.stdout.write("module.exports = " + JSON.stringify(fs.readFileSync(process.argv[1], "utf8")) + ";\n");' "$index_path" > "$asset_path"

npx esbuild server.js --bundle --platform=node --target=node24 --outfile="$bundle_path" --external:fsevents

node -e 'const fs = require("fs"); const [main, output] = process.argv.slice(1); fs.writeFileSync(process.argv[3], JSON.stringify({ main, output, disableExperimentalSEAWarning: true, useCodeCache: false, useSnapshot: false }, null, 2) + "\n");' "$bundle_path" "$sea_blob_path" "$sea_config_path"

node --experimental-sea-config "$sea_config_path"
cp "$(command -v node)" "$binary_path"
npx postject "$binary_path" NODE_SEA_BLOB "$sea_blob_path" \
  --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 \
  --overwrite

cp "$root/scripts/macos/claude-reply.sh" "$root/scripts/macos/start-trigger.sh" "$dist/"
chmod +x "$binary_path" "$dist/claude-reply.sh" "$dist/start-trigger.sh"

echo "Built $binary_path"
