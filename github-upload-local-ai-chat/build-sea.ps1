$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $root

$dist = Join-Path $root "dist"
$indexPath = Join-Path $root "index.html"
$assetPath = Join-Path $root "asset-index.js"
$bundlePath = Join-Path $dist "bundle.cjs"
$seaConfigPath = Join-Path $dist "sea-config.json"
$seaBlobPath = Join-Path $dist "sea-prep.blob"
$exePath = Join-Path $dist "local-chat-viewer.exe"

New-Item -ItemType Directory -Force -Path $dist | Out-Null

$indexJson = node -e "const fs = require('fs'); process.stdout.write(JSON.stringify(fs.readFileSync(process.argv[1], 'utf8')));" "$indexPath"
if ($LASTEXITCODE -ne 0) { throw "index.html encoding failed with exit code $LASTEXITCODE" }
Set-Content -LiteralPath $assetPath -Value "module.exports = $indexJson;" -Encoding UTF8

npx esbuild server.js --bundle --platform=node --target=node24 --outfile="$bundlePath" --external:fsevents
if ($LASTEXITCODE -ne 0) { throw "esbuild failed with exit code $LASTEXITCODE" }

$seaConfig = @{
  main = $bundlePath
  output = $seaBlobPath
  disableExperimentalSEAWarning = $true
  useCodeCache = $false
  useSnapshot = $false
} | ConvertTo-Json -Depth 4
Set-Content -LiteralPath $seaConfigPath -Value $seaConfig -Encoding UTF8

node --experimental-sea-config "$seaConfigPath"
if ($LASTEXITCODE -ne 0) { throw "node SEA preparation failed with exit code $LASTEXITCODE" }

Copy-Item -LiteralPath (Get-Command node).Source -Destination $exePath -Force
npx postject "$exePath" NODE_SEA_BLOB "$seaBlobPath" `
  --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 `
  --overwrite
if ($LASTEXITCODE -ne 0) { throw "postject failed with exit code $LASTEXITCODE" }

Copy-Item -LiteralPath (Join-Path $root "claude-reply.ps1"),(Join-Path $root "start-trigger.ps1") -Destination $dist -Force

Write-Host "Built $exePath"
