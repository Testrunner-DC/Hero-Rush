#!/usr/bin/env bash
# Hero Rush V2 正式服原子发布器。仅接受完整 Git 提交 SHA。
set -Eeuo pipefail
# Nginx 需要读取 release 下的 dist；正式环境文件仍单独固定为 0640。
umask 022

export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

readonly REPO_URL="https://github.com/Testrunner-DC/Hero-Rush.git"
readonly DEPLOY_ROOT="/opt/hero-rush-v2-deploy"
readonly RELEASES_DIR="${DEPLOY_ROOT}/releases"
readonly SHARED_DIR="${DEPLOY_ROOT}/shared"
readonly CURRENT_LINK="${DEPLOY_ROOT}/current"
readonly LEGACY_REPO="/opt/hero-rush-v2"
readonly SERVICE_NAME="hero-rush-v2-relay"
readonly NGINX_SITE_NAME="hero-rush-v2"
readonly DOMAIN="hero-v2.grand-umi.com"
readonly PORT="8093"
readonly TEST_PORT="18093"
readonly KEEP_RELEASES="3"
readonly DEPLOY_USER="hero-deploy"
readonly SERVICE_GROUP="hero-rush"

TARGET_SHA="${1:-}"
if [[ ! "$TARGET_SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "用法：$0 <40 位 Git 提交 SHA>" >&2
  exit 64
fi
if [[ "$(id -un)" != "$DEPLOY_USER" ]]; then
  echo "发布器必须由 ${DEPLOY_USER} 执行。" >&2
  exit 77
fi

exec 9>"${DEPLOY_ROOT}/.deploy.lock"
if ! flock -n 9; then
  echo "已有正式服发布正在执行，请稍后重试。" >&2
  exit 75
fi

log() {
  printf '[%s] %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*"
}

atomic_link() {
  local target="$1"
  local link="$2"
  local next_link="${link}.next.$$"
  ln -s "$target" "$next_link"
  mv -Tf "$next_link" "$link"
}

previous_target=""
release_dir=""
rollout_started="false"
test_pid=""

rollback() {
  local status=$?
  trap - ERR

  if [[ -n "$test_pid" ]] && kill -0 "$test_pid" 2>/dev/null; then
    kill "$test_pid" 2>/dev/null || true
    wait "$test_pid" 2>/dev/null || true
  fi

  if [[ "$rollout_started" == "true" && -n "$previous_target" && -d "$previous_target" ]]; then
    log "健康检查失败，回滚到 ${previous_target}"
    atomic_link "$previous_target" "$CURRENT_LINK"
    sudo /usr/bin/systemctl restart "${SERVICE_NAME}.service" || true
  fi

  log "发布失败，失败版本保留在 ${release_dir:-未创建} 供排查。"
  exit "$status"
}
trap rollback ERR

mkdir -p "$RELEASES_DIR" "$SHARED_DIR"

if [[ ! -e "$CURRENT_LINK" ]]; then
  if [[ ! -d "$LEGACY_REPO" ]]; then
    echo "首次迁移失败：未找到旧版本 ${LEGACY_REPO}。" >&2
    exit 66
  fi
  atomic_link "$LEGACY_REPO" "$CURRENT_LINK"
fi
if [[ ! -L "$CURRENT_LINK" ]]; then
  echo "${CURRENT_LINK} 必须是符号链接，拒绝覆盖。" >&2
  exit 65
fi

previous_target="$(readlink -f "$CURRENT_LINK")"
if [[ ! -f "${SHARED_DIR}/.env" ]]; then
  if [[ ! -f "${previous_target}/.env" ]]; then
    echo "缺少正式服环境配置，无法发布。" >&2
    exit 66
  fi
  install -m 0600 "${previous_target}/.env" "${SHARED_DIR}/.env"
fi

release_id="$(date -u '+%Y%m%d%H%M%S')-${TARGET_SHA:0:12}"
release_dir="${RELEASES_DIR}/${release_id}"
if [[ -e "$release_dir" ]]; then
  echo "发布目录意外重复：${release_dir}" >&2
  exit 73
fi

log "拉取提交 ${TARGET_SHA}"
reference_repo="$previous_target"
while IFS= read -r candidate; do
  if git -C "$candidate" rev-parse --git-dir >/dev/null 2>&1; then
    reference_repo="$candidate"
    break
  fi
done < <(find "$RELEASES_DIR" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' | sort -rn | cut -d' ' -f2-)

git clone --quiet --no-checkout \
  --reference-if-able "$reference_repo" --dissociate \
  "$REPO_URL" "$release_dir"
git -C "$release_dir" fetch --quiet --depth 1 origin "$TARGET_SHA"
git -C "$release_dir" checkout --quiet --detach FETCH_HEAD
if [[ "$(git -C "$release_dir" rev-parse HEAD)" != "$TARGET_SHA" ]]; then
  echo "服务器检出的提交与目标不一致。" >&2
  exit 74
fi
install -g "$SERVICE_GROUP" -m 0640 "${SHARED_DIR}/.env" "${release_dir}/.env"

log "安装依赖并构建新版本"
npm --prefix "$release_dir" ci --no-audit --no-fund
npm --prefix "$release_dir" run build
npm --prefix "${release_dir}/server" run build
test -s "${release_dir}/dist/index.html"
test -s "${release_dir}/server/dist/index.js"

if ss -ltnH "sport = :${TEST_PORT}" | grep -q .; then
  echo "预检端口 ${TEST_PORT} 已被占用。" >&2
  exit 69
fi

log "在隔离端口启动服务预检"
(
  cd "${release_dir}/server"
  env \
    PORT="$TEST_PORT" \
    HOST="127.0.0.1" \
    NODE_ENV="production" \
    BATTLE_V2_ENABLED="true" \
    BATTLE_V2_ENFORCE_CARD_POOL="true" \
    node dist/index.js
) > "${release_dir}/server-smoke.log" 2>&1 &
test_pid=$!

test_ready="false"
for _ in $(seq 1 30); do
  if ! kill -0 "$test_pid" 2>/dev/null; then
    break
  fi
  if ss -ltnH "sport = :${TEST_PORT}" | grep -q .; then
    test_ready="true"
    break
  fi
  sleep 0.5
done
if [[ "$test_ready" != "true" ]]; then
  tail -50 "${release_dir}/server-smoke.log" >&2 || true
  false
fi
kill "$test_pid"
wait "$test_pid" 2>/dev/null || true
test_pid=""

log "原子切换到新版本 ${release_id}"
atomic_link "$release_dir" "$CURRENT_LINK"
rollout_started="true"

sudo /usr/bin/systemctl restart "${SERVICE_NAME}.service"

service_ready="false"
for _ in $(seq 1 30); do
  if systemctl is-active --quiet "${SERVICE_NAME}.service" \
    && ss -ltnH "sport = :${PORT}" | grep -q .; then
    service_ready="true"
    break
  fi
  sleep 0.5
done
if [[ "$service_ready" != "true" ]]; then
  echo "正式服务未在预期时间内监听 127.0.0.1:${PORT}。" >&2
  false
fi

log "验证 HTTPS 与 WSS"
curl --fail --silent --show-error --retry 5 --retry-delay 2 \
  --output /dev/null "https://${DOMAIN}/"
curl --fail --silent --show-error --retry 5 --retry-delay 2 \
  --output /dev/null "https://${DOMAIN}/battle"
node "${CURRENT_LINK}/scripts/smoke-production-v2.mjs" \
  "wss://${DOMAIN}/ws/" "https://${DOMAIN}"
systemctl is-active --quiet "$SERVICE_NAME"

printf '%s\n' "$release_dir" > "${SHARED_DIR}/last-successful-release"
rollout_started="false"
trap - ERR

log "清理旧发布，仅保留最近 ${KEEP_RELEASES} 个"
mapfile -t all_releases < <(
  find "$RELEASES_DIR" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' \
    | sort -rn \
    | cut -d' ' -f2-
)
for ((index = KEEP_RELEASES; index < ${#all_releases[@]}; index++)); do
  candidate="$(readlink -f "${all_releases[$index]}")"
  case "$candidate" in
    "${RELEASES_DIR}"/*)
      if [[ "$candidate" != "$(readlink -f "$CURRENT_LINK")" ]]; then
        rm -rf --one-file-system -- "$candidate"
      fi
      ;;
    *)
      echo "跳过不在发布目录内的清理目标：${candidate}" >&2
      ;;
  esac
done

log "发布成功：${TARGET_SHA}"
echo "DEPLOYED_SHA=${TARGET_SHA}"
