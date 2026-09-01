param(
  [switch]$RequireCardPool
)

$ErrorActionPreference = "Stop"
$repoRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
if (-not (Test-Path -LiteralPath (Join-Path $repoRoot ".git"))) { throw "V2 门禁只能在 Hero-Rush 仓库执行。" }
Set-Location -LiteralPath $repoRoot

function Invoke-GateStep([string]$name, [scriptblock]$command) {
  Write-Host "[V2 gate] $name" -ForegroundColor Cyan
  & $command
  if ($LASTEXITCODE -ne 0) { throw "V2 门禁失败：$name" }
}

Invoke-GateStep "Workspace packages" { npm run build:packages }
Invoke-GateStep "TypeScript" { npx tsc --noEmit }
Invoke-GateStep "Automated tests" { npm test }
Invoke-GateStep "Rule-number coverage" { node scripts/report_v2_rule_coverage.mjs --strict }
Invoke-GateStep "Switch and rollback policy" { node scripts/check_v2_switch_gate.mjs }
Invoke-GateStep "Production build" { npm run build }
Invoke-GateStep "Storage budget" { pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/audit_storage.ps1 -Strict -AllowBuildOutput }
if ($RequireCardPool) {
  Invoke-GateStep "Complete card pool" { node scripts/report_v2_card_coverage.mjs --strict }
} else {
  Invoke-GateStep "Card coverage report" { node scripts/report_v2_card_coverage.mjs }
}
if ($RequireCardPool) {
  Write-Host "V2 production release gate passed." -ForegroundColor Green
} else {
  Write-Host "V2 framework gate passed; production card-pool release was not authorized by this gate." -ForegroundColor Green
}
