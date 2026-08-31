param(
  [string]$AssetRoot = $(if ($env:HERO_RUSH_ASSET_ROOT) { $env:HERO_RUSH_ASSET_ROOT } else { Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) "assets" }),
  [string]$Server = "root@8.210.155.25",
  [string]$RemoteRoot = "/opt/hero-rush-static/card-assets",
  [switch]$Upload
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$assetRootPath = [IO.Path]::GetFullPath($AssetRoot)
if ($assetRootPath.StartsWith("C:\", [StringComparison]::OrdinalIgnoreCase)) {
  throw "卡图发布缓存不得位于 C 盘。"
}
if ($assetRootPath.StartsWith($repoRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
  throw "卡图发布缓存必须位于 Git 工作树之外。"
}

function Invoke-External {
  param(
    [Parameter(Mandatory = $true, Position = 0)][string]$Executable,
    [Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments
  )
  & $Executable @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "命令失败（$LASTEXITCODE）：$Executable $($Arguments -join ' ')"
  }
}

$python = Join-Path $repoRoot ".venv\Scripts\python.exe"
$manifestPath = Join-Path $assetRootPath "current\card-assets.manifest.json"
$preloadPath = Join-Path $assetRootPath "current\card-assets.preload.json"
$storeRoot = Join-Path $assetRootPath "store"
foreach ($required in @($python, $manifestPath, $preloadPath, $storeRoot)) {
  if (-not (Test-Path -LiteralPath $required)) { throw "缺少卡图发布输入：$required" }
}

Push-Location $repoRoot
try {
  Invoke-External $python "scripts\card_asset_release.py" "audit"
}
finally { Pop-Location }

$manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding utf8 | ConvertFrom-Json
$assetVersion = [string]$manifest.assetVersion
if ($assetVersion -notmatch '^[0-9a-f]{64}$') { throw "assetVersion 格式无效。" }

$expected = @{}
foreach ($card in $manifest.cards.PSObject.Properties.Value) {
  foreach ($variant in $card.variants.PSObject.Properties) {
    $relative = ([string]$variant.Value).Replace('/', [IO.Path]::DirectorySeparatorChar)
    if ($relative -notmatch '^objects[\\/][0-9a-f]{2}[\\/][0-9a-f]{64}[\\/](thumb-240|board-480|detail-960)\.webp$') {
      throw "manifest 包含异常对象路径：$relative"
    }
    $full = Join-Path $storeRoot $relative
    if (-not (Test-Path -LiteralPath $full -PathType Leaf)) { throw "缺少对象：$full" }
    $expected[$relative.Replace('\', '/')] = (Get-Item -LiteralPath $full).Length
  }
}

$pending = @($expected.Keys | Sort-Object)
if ($Upload) {
  $remoteInventoryText = & ssh -o BatchMode=yes $Server "mkdir -p '$RemoteRoot/objects'; cd '$RemoteRoot'; find objects -type f -printf '%P\t%s\n'"
  if ($LASTEXITCODE -ne 0) { throw "无法读取服务器卡图对象清单。" }
  $remoteInventory = @{}
  foreach ($line in $remoteInventoryText) {
    if ($line -match '^(.+)\t([0-9]+)$') {
      $remoteInventory["objects/$($Matches[1])"] = [long]$Matches[2]
    }
  }
  $pending = @($expected.Keys | Where-Object {
    -not $remoteInventory.ContainsKey($_) -or $remoteInventory[$_] -ne $expected[$_]
  } | Sort-Object)
}

$pendingBytes = [long](($pending | ForEach-Object { $expected[$_] } | Measure-Object -Sum).Sum)
Write-Host "卡图发布版本：$assetVersion"
Write-Host "完整对象文件：$($expected.Count)；待传：$($pending.Count)；待传字节：$pendingBytes"
if (-not $Upload) {
  Write-Host "发布预演完成；未指定 -Upload，不连接或修改服务器。"
  exit 0
}

$transferRoot = Join-Path $assetRootPath "transfer\$assetVersion"
New-Item -ItemType Directory -Force -Path $transferRoot | Out-Null
$listPath = Join-Path $transferRoot "objects.txt"
$archivePath = Join-Path $transferRoot "hero-card-assets-$assetVersion.tar.gz"
$releaseManifestPath = Join-Path $transferRoot "card-assets.manifest.json"
$releasePreloadPath = Join-Path $transferRoot "card-assets.preload.json"
[IO.File]::WriteAllLines($listPath, $pending, [Text.UTF8Encoding]::new($false))
Copy-Item -LiteralPath $manifestPath -Destination $releaseManifestPath -Force
Copy-Item -LiteralPath $preloadPath -Destination $releasePreloadPath -Force
if (Test-Path -LiteralPath $archivePath) { Remove-Item -LiteralPath $archivePath -Force }
Invoke-External "tar.exe" "-czf" $archivePath "-C" $storeRoot "-T" $listPath
$archiveSha256 = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()

$incoming = "/opt/hero-rush-assets-incoming/$assetVersion"
Invoke-External "ssh.exe" "-o" "BatchMode=yes" $Server "mkdir -p '$incoming'"
Invoke-External "scp.exe" "-o" "BatchMode=yes" $archivePath $releaseManifestPath $releasePreloadPath "${Server}:$incoming/"
Invoke-External "ssh.exe" "-o" "BatchMode=yes" $Server (
  "bash /opt/hero-rush/server/publish-card-assets.sh deploy '$assetVersion' '$archiveSha256' " +
  "'$incoming/hero-card-assets-$assetVersion.tar.gz' '$incoming/card-assets.manifest.json' '$incoming/card-assets.preload.json'"
)

$publicManifest = & curl.exe --fail --silent --show-error --noproxy '*' "https://hero.grand-umi.com/card-assets/card-assets.manifest.json"
if ($LASTEXITCODE -ne 0) { throw "公网卡图 manifest 请求失败。" }
$publicVersion = [string](($publicManifest | ConvertFrom-Json).assetVersion)
if ($publicVersion -ne $assetVersion) { throw "公网卡图版本不匹配：$publicVersion" }
$sampleRelative = [string]($manifest.cards.PSObject.Properties.Value | Select-Object -First 1).variants.thumbWebp
$manifestHeaders = & curl.exe --fail --silent --show-error --noproxy '*' -I "https://hero.grand-umi.com/card-assets/card-assets.manifest.json"
$objectHeaders = & curl.exe --fail --silent --show-error --noproxy '*' -I "https://hero.grand-umi.com/card-assets/$sampleRelative"
if (($manifestHeaders -join "`n") -notmatch '(?im)^cache-control:.*max-age=300.*must-revalidate') {
  throw "公网卡图 manifest 缓存头不符合五分钟重校验策略。"
}
if (($objectHeaders -join "`n") -notmatch '(?im)^cache-control:.*max-age=31536000.*immutable') {
  throw "公网内容寻址卡图未启用一年 immutable 缓存。"
}
Write-Host "卡图独立发布完成并通过公网版本验证：$assetVersion"
