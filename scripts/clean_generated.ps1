param(
  [switch]$Dependencies
)

$ErrorActionPreference = "Stop"
$repoRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$packagePath = Join-Path $repoRoot "package.json"

if (-not (Test-Path -LiteralPath (Join-Path $repoRoot ".git"))) {
  throw "清理脚本只能在 Hero-Rush Git 仓库中运行。"
}

$package = Get-Content -LiteralPath $packagePath -Raw | ConvertFrom-Json
if ($package.name -ne "marvel-tcg") {
  throw "仓库身份校验失败：package.json name 不是 marvel-tcg。"
}

$targets = @(
  "dist",
  "coverage",
  "node_modules\.vite",
  "packages\game-core\dist",
  "packages\game-core\node_modules\.vite",
  "packages\protocol\dist",
  "server\dist",
  "server\node_modules\.vite"
)
if ($Dependencies) { $targets += "node_modules" }

$removed = @()
foreach ($relativePath in $targets) {
  $target = [IO.Path]::GetFullPath((Join-Path $repoRoot $relativePath))
  if (-not $target.StartsWith(($repoRoot + "\"), [StringComparison]::OrdinalIgnoreCase)) {
    throw "拒绝清理仓库外路径：$target"
  }
  if (-not (Test-Path -LiteralPath $target)) { continue }

  $item = Get-Item -LiteralPath $target -Force
  if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
    throw "拒绝递归清理联接目录：$target"
  }

  Remove-Item -LiteralPath $target -Recurse -Force
  $removed += $relativePath
}

if ($removed.Count -eq 0) {
  Write-Host "没有需要清理的生成内容。" -ForegroundColor Green
} else {
  Write-Host "已清理：$($removed -join ', ')" -ForegroundColor Green
}

if (-not $Dependencies) {
  Write-Host "依赖目录已保留；如需重新安装，可运行 clean_generated.ps1 -Dependencies。"
}
