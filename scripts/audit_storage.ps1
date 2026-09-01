param(
  [switch]$Strict,
  [switch]$AllowBuildOutput
)

$ErrorActionPreference = "Stop"
$repoRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$packagePath = Join-Path $repoRoot "package.json"
$externalAssetRoot = [IO.Path]::GetFullPath($(if ($env:HERO_RUSH_ASSET_ROOT) { $env:HERO_RUSH_ASSET_ROOT } else { Join-Path (Split-Path -Parent $repoRoot) "assets" }))

if ($externalAssetRoot.StartsWith("C:\", [StringComparison]::OrdinalIgnoreCase)) {
  throw "外置卡图资产不得位于 C 盘：$externalAssetRoot"
}
if ($externalAssetRoot.StartsWith($repoRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
  throw "外置卡图资产必须位于 Git 工作树之外：$externalAssetRoot"
}

if (-not (Test-Path -LiteralPath (Join-Path $repoRoot ".git"))) {
  throw "存储审计只能在 Hero-Rush Git 仓库中运行。"
}

$package = Get-Content -LiteralPath $packagePath -Raw | ConvertFrom-Json
if ($package.name -ne "marvel-tcg") {
  throw "仓库身份校验失败：package.json name 不是 marvel-tcg。"
}

function Get-DirectoryBytes([string]$path) {
  if (-not (Test-Path -LiteralPath $path)) { return 0L }
  $sum = 0L
  Get-ChildItem -LiteralPath $path -Recurse -Force -File -ErrorAction SilentlyContinue |
    ForEach-Object { $sum += $_.Length }
  return $sum
}

function To-MiB([long]$bytes) {
  return [math]::Round($bytes / 1MB, 2)
}

$assetPath = Join-Path $repoRoot "public\cards"
$assetFiles = @(
  Get-ChildItem -LiteralPath $assetPath -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Extension -in @(".png", ".webp") }
)
$assetBytes = ($assetFiles | Measure-Object Length -Sum).Sum
$largestAsset = $assetFiles | Sort-Object Length -Descending | Select-Object -First 1

$assetNames = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
$assetFiles | ForEach-Object { [void]$assetNames.Add($_.Name) }
$referencedNames = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
$cardDataPath = Join-Path $repoRoot "public\cards.json"
if (Test-Path -LiteralPath $cardDataPath) {
  $cardData = Get-Content -LiteralPath $cardDataPath -Raw
  [regex]::Matches($cardData, '/cards/([^"?]+\.(?:png|webp))', [Text.RegularExpressions.RegexOptions]::IgnoreCase) |
    ForEach-Object { [void]$referencedNames.Add($_.Groups[1].Value) }
}
$orphanAssets = @($assetFiles | Where-Object { -not $referencedNames.Contains($_.Name) })
$missingAssets = @($referencedNames | Where-Object { -not $assetNames.Contains($_) })
$duplicateGroups = @(
  $assetFiles | Get-FileHash -Algorithm SHA256 | Group-Object Hash | Where-Object { $_.Count -gt 1 }
)
$duplicateExtraCount = ($duplicateGroups | ForEach-Object { $_.Count - 1 } | Measure-Object -Sum).Sum
if ($null -eq $duplicateExtraCount) { $duplicateExtraCount = 0 }

$canonicalBytes = 0L
Get-ChildItem -LiteralPath $repoRoot -Force | Where-Object {
  $_.Name -notin @(".git", "node_modules", "dist", ".cache", ".tmp")
} | ForEach-Object {
  if ($_.PSIsContainer) { $canonicalBytes += Get-DirectoryBytes $_.FullName }
  else { $canonicalBytes += $_.Length }
}

$measurements = @(
  [pscustomobject]@{ Item = "Canonical working data"; MiB = To-MiB $canonicalBytes; BudgetMiB = 650; Policy = "源码、文档和发布资产" }
  [pscustomobject]@{ Item = "Tracked card assets"; MiB = To-MiB $assetBytes; BudgetMiB = 600; Policy = "新图默认 WebP；达到预算后必须先做 CDN/对象存储决策" }
  [pscustomobject]@{ Item = "Git metadata"; MiB = To-MiB (Get-DirectoryBytes (Join-Path $repoRoot ".git")); BudgetMiB = 620; Policy = "完整当前卡图对象的硬下限；CI 使用 blob:none，禁止在普通功能提交中重写历史" }
  [pscustomobject]@{ Item = "Dependencies"; MiB = To-MiB (Get-DirectoryBytes (Join-Path $repoRoot "node_modules")); BudgetMiB = 180; Policy = "仅保留主仓库一套" }
  [pscustomobject]@{ Item = "Build output"; MiB = To-MiB (Get-DirectoryBytes (Join-Path $repoRoot "dist")); BudgetMiB = $(if ($AllowBuildOutput) { 20 } else { 0 }); Policy = "不得复制 public/cards；验收或发布后清理" }
  [pscustomobject]@{ Item = "External originals"; MiB = To-MiB (Get-DirectoryBytes (Join-Path $externalAssetRoot "original")); BudgetMiB = 650; Policy = "F 盘唯一原图归档；永不自动删除" }
  [pscustomobject]@{ Item = "Derived object store"; MiB = To-MiB (Get-DirectoryBytes (Join-Path $externalAssetRoot "store")); BudgetMiB = 300; Policy = "内容寻址三档 WebP；超预算先清理未引用对象" }
  [pscustomobject]@{ Item = "Asset transfer cache"; MiB = To-MiB (Get-DirectoryBytes (Join-Path $externalAssetRoot "transfer")); BudgetMiB = 320; Policy = "发布后可删除的可再生产物" }
)

$violations = @($measurements | Where-Object { $_.MiB -gt $_.BudgetMiB })
$releaseRoot = Join-Path $externalAssetRoot "releases"
$releaseCount = if (Test-Path -LiteralPath $releaseRoot) { @(Get-ChildItem -LiteralPath $releaseRoot -Directory).Count } else { 0 }
if ($releaseCount -gt 3) {
  $violations += [pscustomobject]@{ Item = "Asset release manifests"; MiB = $releaseCount; BudgetMiB = 3; Policy = "默认保留最近 3 版；先运行 cards:assets:prune 预演" }
}
$singleAssetLimitMiB = 5
if ($largestAsset -and $largestAsset.Length -gt ($singleAssetLimitMiB * 1MB)) {
  $violations += [pscustomobject]@{
    Item = "Largest card asset"
    MiB = To-MiB $largestAsset.Length
    BudgetMiB = $singleAssetLimitMiB
    Policy = $largestAsset.Name
  }
}
if ($orphanAssets.Count -gt 0) {
  $violations += [pscustomobject]@{ Item = "Orphan card assets"; MiB = $orphanAssets.Count; BudgetMiB = 0; Policy = ($orphanAssets.Name -join ", ") }
}
if ($missingAssets.Count -gt 0) {
  $violations += [pscustomobject]@{ Item = "Missing card assets"; MiB = $missingAssets.Count; BudgetMiB = 0; Policy = ($missingAssets -join ", ") }
}
if ($duplicateExtraCount -gt 0) {
  $violations += [pscustomobject]@{ Item = "Duplicate card assets"; MiB = $duplicateExtraCount; BudgetMiB = 0; Policy = "按 SHA-256 识别" }
}

Write-Host "Hero-Rush storage audit" -ForegroundColor Cyan
Write-Host "Repository: $repoRoot"
Write-Host "External asset root: $externalAssetRoot"
Write-Host "Card asset files: $($assetFiles.Count)"
Write-Host "Referenced card assets: $($referencedNames.Count)"
Write-Host "Orphan / missing / duplicate extras: $($orphanAssets.Count) / $($missingAssets.Count) / $duplicateExtraCount"
Write-Host "External asset releases: $releaseCount"
$measurements | Format-Table -AutoSize
if ($largestAsset) {
  Write-Host "Largest card asset: $($largestAsset.Name) ($(To-MiB $largestAsset.Length) MiB)"
}

if ($violations.Count -gt 0) {
  Write-Host "Storage budget warnings:" -ForegroundColor Yellow
  $violations | Format-Table -AutoSize -Wrap
  if ($Strict) { exit 2 }
} else {
  Write-Host "All storage budgets and asset integrity checks are within limits." -ForegroundColor Green
}
