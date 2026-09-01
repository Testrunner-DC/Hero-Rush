#!/usr/bin/env bash
set -Eeuo pipefail
umask 022

export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

readonly repository_url="https://github.com/Testrunner-DC/Hero-Rush.git"
readonly deploy_root="/opt/hero-rush-v2-deploy"
readonly repository="${deploy_root}/repository"
readonly releases_root="${deploy_root}/releases"
readonly shared_root="${deploy_root}/shared"
readonly current_link="${deploy_root}/current"
readonly server_ready="/etc/hero-rush-v2/server.ready"
readonly asset_link="/opt/hero-rush-static/card-assets/current"
readonly lock_file="${deploy_root}/.deploy.lock"
readonly service_name="hero-rush-v2-relay.service"
readonly deploy_user="hero-deploy"
readonly smoke_port="18093"
readonly production_site="https://hero-v2.grand-umi.com/battle"
readonly production_ws="wss://hero-v2.grand-umi.com/ws/"
readonly smoke_script="/usr/local/lib/hero-rush-v2/smoke-production-v2.mjs"

fail() { printf '[Hero V2 发布] 错误：%s\n' "$*" >&2; exit 1; }
log() { printf '[Hero V2 发布] %s\n' "$*"; }

sha="${1:-}"
[[ "$sha" =~ ^[0-9a-f]{40}$ ]] || fail "只接受 40 位小写 Git 提交 SHA"
[[ "$(id -un)" == "$deploy_user" ]] || fail "发布器只能由 ${deploy_user} 账号执行"

for command_name in git npm node curl flock tar sudo ss; do
  command -v "$command_name" >/dev/null || fail "服务器缺少命令：${command_name}"
done
[[ -x /usr/bin/systemctl ]] || fail "服务器缺少 /usr/bin/systemctl"
[[ -f "$smoke_script" && ! -L "$smoke_script" ]] || fail "正式服冒烟脚本未正确安装"
[[ -d "$deploy_root" && ! -L "$deploy_root" ]] || fail "发布根目录异常"
[[ -d "$releases_root" && ! -L "$releases_root" ]] || fail "release 目录异常"
[[ -d "$shared_root" && ! -L "$shared_root" ]] || fail "共享配置目录异常"
[[ -f "${shared_root}/frontend.env" && ! -L "${shared_root}/frontend.env" ]] || fail "缺少 shared/frontend.env"
[[ -f "$server_ready" && ! -L "$server_ready" ]] || fail "服务端配置尚未由管理员标记为就绪"
[[ -e "$asset_link" ]] || fail "卡图发布链接不存在：${asset_link}"

exec 9>"$lock_file"
flock -n 9 || fail "已有正式服发布正在执行"

if [[ ! -d "${repository}/.git" ]]; then
  [[ ! -e "$repository" ]] || fail "repository 路径存在但不是 Git 仓库"
  log "初始化部分克隆发布仓库"
  git clone --filter=blob:none --no-checkout "$repository_url" "$repository"
fi
[[ "$(git -C "$repository" remote get-url origin)" == "$repository_url" ]] || fail "发布仓库 origin 不符合预期"

log "获取 main 并校验提交 ${sha}"
git -C "$repository" fetch --filter=blob:none --prune origin \
  +refs/heads/main:refs/remotes/origin/main
git -C "$repository" cat-file -e "${sha}^{commit}" 2>/dev/null || fail "提交不存在"
git -C "$repository" merge-base --is-ancestor "$sha" origin/main || fail "提交不在 origin/main 历史中"

release_id="$(date -u +%Y%m%dT%H%M%SZ)-${sha:0:12}"
release_dir="${releases_root}/${release_id}"
[[ ! -e "$release_dir" ]] || fail "release 已存在：${release_id}"
mkdir -m 0755 "$release_dir"
printf '%s\n' "$sha" > "${release_dir}/REVISION"
printf 'building\n' > "${release_dir}/STATUS"

next_link="${deploy_root}/.next-${sha}-$$"
switched=0
completed=0
previous_target=""
cleanup() {
  code=$?
  rm -f -- "$next_link"
  if [[ $completed -ne 1 && -d "$release_dir" ]]; then
    printf 'failed\n' > "${release_dir}/STATUS"
    log "失败版本保留：${release_dir}"
  fi
  exit "$code"
}
trap cleanup EXIT

log "导出确定提交到独立 release"
git -C "$repository" archive --format=tar "$sha" | tar -xf - -C "$release_dir"
if [[ -d "${release_dir}/public/cards" ]]; then
  [[ -z "$(find "${release_dir}/public/cards" -type f -print -quit)" ]] \
    || fail "发布归档错误地包含 legacy 卡图"
fi

log "安装依赖并构建前后端"
(
  cd "$release_dir"
  set -a
  source "${shared_root}/frontend.env"
  set +a
  [[ -n "${VITE_SUPABASE_URL:-}" && -n "${VITE_SUPABASE_ANON_KEY:-}" ]] \
    || fail "frontend.env 缺少 Supabase 公共配置"
  npm ci --no-audit --no-fund
  npm run build
  npm run build -w hero-rush-server
  npm prune --omit=dev --no-audit --no-fund
)

test -s "${release_dir}/dist/index.html"
test -s "${release_dir}/server/dist/index.js"
ln -s "$asset_link" "${release_dir}/dist/card-assets"
chmod -R a+rX "$release_dir"

if ss -ltnH "sport = :${smoke_port}" | grep -q .; then
  fail "预检端口 ${smoke_port} 已被占用"
fi

log "隔离启动 V2 服务预检"
(
  exec 9>&-
  cd "$release_dir"
  PORT="$smoke_port" HOST="127.0.0.1" NODE_ENV="production" \
    BATTLE_V2_ENABLED="true" BATTLE_V2_ENFORCE_CARD_POOL="true" ALLOW_GUESTS="true" \
    node server/dist/index.js > server-smoke.log 2>&1 &
  smoke_pid=$!
  stop_smoke() {
    kill "$smoke_pid" 2>/dev/null || true
    wait "$smoke_pid" 2>/dev/null || true
  }
  trap stop_smoke EXIT
  ready=0
  for _ in $(seq 1 30); do
    if curl --fail --silent --show-error "http://127.0.0.1:${smoke_port}/api/health" \
      | grep -q '"battleV2Enabled":true'; then
      ready=1
      break
    fi
    sleep 1
  done
  [[ $ready -eq 1 ]] || fail "隔离启动预检失败，查看 ${release_dir}/server-smoke.log"
)

if [[ -L "$current_link" ]]; then
  previous_target="$(readlink -f "$current_link")"
fi

log "原子切换线上 release"
ln -s "$release_dir" "$next_link"
mv -Tf "$next_link" "$current_link"
switched=1
sudo -n /usr/bin/systemctl restart "$service_name"

rollback() {
  [[ $switched -eq 1 && -n "$previous_target" && -d "$previous_target" ]] || return 1
  rollback_link="${deploy_root}/.rollback-${sha}-$$"
  ln -s "$previous_target" "$rollback_link"
  mv -Tf "$rollback_link" "$current_link"
  sudo -n /usr/bin/systemctl restart "$service_name"
  log "已自动恢复上一个 release：${previous_target}"
}

log "执行本机健康检查"
health_ok=0
for _ in $(seq 1 30); do
  if curl --fail --silent --show-error "http://127.0.0.1:8093/api/health" \
    | grep -q '"battleV2Enabled":true'; then
    health_ok=1
    break
  fi
  sleep 1
done
if [[ $health_ok -ne 1 ]]; then
  rollback || true
  fail "切换后本机健康检查失败"
fi

log "执行 HTTPS 与双客户端 WSS 冒烟"
if ! node "$smoke_script" "$production_site" "$production_ws"; then
  rollback || true
  fail "切换后公开网络冒烟失败"
fi

printf 'active\n' > "${release_dir}/STATUS"
completed=1

log "保留最近三个 release"
current_target="$(readlink -f "$current_link")"
mapfile -t stale_releases < <(
  find "$releases_root" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' \
    | sort -rn | tail -n +4 | cut -d' ' -f2-
)
for stale in "${stale_releases[@]}"; do
  [[ "$stale" == "${releases_root}/"* && "$stale" != "$current_target" && ! -L "$stale" ]] || continue
  rm -rf --one-file-system -- "$stale"
done

log "发布完成：${sha}"
trap - EXIT
