param(
  [switch]$Strict
)

$ErrorActionPreference = "Stop"
$repoRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$packagePath = Join-Path $repoRoot "package.json"

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
$assetFiles = @(Get-ChildItem -LiteralPath $assetPath -File -Filter "*.png" -ErrorAction SilentlyContinue)
$assetBytes = ($assetFiles | Measure-Object Length -Sum).Sum
$largestAsset = $assetFiles | Sort-Object Length -Descending | Select-Object -First 1

$assetNames = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
$assetFiles | ForEach-Object { [void]$assetNames.Add($_.Name) }
$referencedNames = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
$cardDataPath = Join-Path $repoRoot "public\cards.json"
if (Test-Path -LiteralPath $cardDataPath) {
  $cardData = Get-Content -LiteralPath $cardDataPath -Raw
  [regex]::Matches($cardData, '/cards/([^"?]+\.png)', [Text.RegularExpressions.RegexOptions]::IgnoreCase) |
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
  [pscustomobject]@{ Item = "Tracked card PNGs"; MiB = To-MiB $assetBytes; BudgetMiB = 600; Policy = "达到预算后必须先做 CDN/对象存储决策" }
  [pscustomobject]@{ Item = "Git metadata"; MiB = To-MiB (Get-DirectoryBytes (Join-Path $repoRoot ".git")); BudgetMiB = 250; Policy = "禁止在普通功能提交中重写历史" }
  [pscustomobject]@{ Item = "Dependencies"; MiB = To-MiB (Get-DirectoryBytes (Join-Path $repoRoot "node_modules")); BudgetMiB = 180; Policy = "仅保留主仓库一套" }
  [pscustomobject]@{ Item = "Build output"; MiB = To-MiB (Get-DirectoryBytes (Join-Path $repoRoot "dist")); BudgetMiB = 0; Policy = "验收或发布后清理" }
)

$violations = @($measurements | Where-Object { $_.MiB -gt $_.BudgetMiB })
$singleAssetLimitMiB = 5
if ($largestAsset -and $largestAsset.Length -gt ($singleAssetLimitMiB * 1MB)) {
  $violations += [pscustomobject]@{
    Item = "Largest card PNG"
    MiB = To-MiB $largestAsset.Length
    BudgetMiB = $singleAssetLimitMiB
    Policy = $largestAsset.Name
  }
}
if ($orphanAssets.Count -gt 0) {
  $violations += [pscustomobject]@{ Item = "Orphan card PNGs"; MiB = $orphanAssets.Count; BudgetMiB = 0; Policy = ($orphanAssets.Name -join ", ") }
}
if ($missingAssets.Count -gt 0) {
  $violations += [pscustomobject]@{ Item = "Missing card PNGs"; MiB = $missingAssets.Count; BudgetMiB = 0; Policy = ($missingAssets -join ", ") }
}
if ($duplicateExtraCount -gt 0) {
  $violations += [pscustomobject]@{ Item = "Duplicate card PNGs"; MiB = $duplicateExtraCount; BudgetMiB = 0; Policy = "按 SHA-256 识别" }
}

Write-Host "Hero-Rush storage audit" -ForegroundColor Cyan
Write-Host "Repository: $repoRoot"
Write-Host "Card PNG files: $($assetFiles.Count)"
Write-Host "Referenced card PNGs: $($referencedNames.Count)"
Write-Host "Orphan / missing / duplicate extras: $($orphanAssets.Count) / $($missingAssets.Count) / $duplicateExtraCount"
$measurements | Format-Table -AutoSize
if ($largestAsset) {
  Write-Host "Largest card PNG: $($largestAsset.Name) ($(To-MiB $largestAsset.Length) MiB)"
}

if ($violations.Count -gt 0) {
  Write-Host "Storage budget warnings:" -ForegroundColor Yellow
  $violations | Format-Table -AutoSize -Wrap
  if ($Strict) { exit 2 }
} else {
  Write-Host "All storage budgets and asset integrity checks are within limits." -ForegroundColor Green
}
