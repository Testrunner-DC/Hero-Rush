# ============================================================
#  deploy-hero.ps1 — 一键部署 hero.grand-umi.com (香港 @ 8.210.155.25)
#  用法:
#    .\deploy-hero.ps1                  # 推已提交的代码并触发香港重建
#    .\deploy-hero.ps1 -Commit "说明"   # 先提交当前改动再推+部署
#  流程: 提交 → pull合并协作者改动 → push(失败即中止) → ssh香港 git pull+build → 验证200
#  服务器: /opt/hero-rush 为本仓库 clone,Caddy 静态托管 dist/,构建完成即生效
#  注: 本文件必须存为 UTF-8 with BOM,否则 PS5.1 按GBK解码中文会语法报错。
# ============================================================
param(
  [string]$Commit = ""
)
$ErrorActionPreference = "Stop"
$SRV  = "root@8.210.155.25"
$repo = "D:\Self\CYJZ\Hero-Rush"
Set-Location $repo

function Die($msg) { Write-Host $msg -ForegroundColor Red; exit 1 }

Write-Host "===== [1/4] 提交本地改动 =====" -ForegroundColor Cyan
$dirty = git status --porcelain
if ($dirty) {
  if ($Commit) {
    git add -A
    git commit -m $Commit
    if ($LASTEXITCODE -ne 0) { Die "git commit 失败,已中止" }
  } else {
    Write-Host "有未提交改动:" -ForegroundColor Yellow
    git status --short
    Die "请先提交,或用  .\deploy-hero.ps1 -Commit `"说明`"  自动提交后再部署。"
  }
}

Write-Host "===== [2/4] 同步远端(先合并协作者改动,避免push被拒) =====" -ForegroundColor Cyan
git pull --no-rebase --no-edit origin main
if ($LASTEXITCODE -ne 0) { Die "git pull 失败(可能有冲突),请手动解决后重试,本次未部署。" }

Write-Host "===== [3/4] 推送 GitHub =====" -ForegroundColor Cyan
git push origin main
if ($LASTEXITCODE -ne 0) { Die "git push 失败,已中止(未部署)。请重试。" }

Write-Host "===== [4/4] 触发香港重建 + 验证 =====" -ForegroundColor Cyan
ssh $SRV "cd /opt/hero-rush && git pull && npm install --no-audit --no-fund && npm run build"
if ($LASTEXITCODE -ne 0) { Die "香港构建报错,线上仍是旧版本。请查上方输出。" }

# 用 curl.exe --noproxy 绕过本机代理(127.0.0.1:9098),否则代理会把直连香港的请求误判为失败
$code = & curl.exe -s --noproxy '*' -o NUL -w "%{http_code}" -L "https://hero.grand-umi.com/"
if ($code -eq "200") {
  Write-Host "线上首页 HTTP 200 ✓ 部署成功" -ForegroundColor Green
} else {
  Write-Host "线上验证: HTTP $code (非200,检查香港 Caddy/dist)" -ForegroundColor Red
}
