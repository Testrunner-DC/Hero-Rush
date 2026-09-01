#!/usr/bin/env bash
set -Eeuo pipefail
umask 027

export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

readonly domain="hero-v2.grand-umi.com"
readonly deploy_root="/opt/hero-rush-v2-deploy"
readonly releases_root="${deploy_root}/releases"
readonly shared_root="${deploy_root}/shared"
readonly current_link="${deploy_root}/current"
readonly legacy_repo="/opt/hero-rush-v2"
readonly config_root="/etc/hero-rush-v2"
readonly server_env="${config_root}/server.env"
readonly server_ready="${config_root}/server.ready"
readonly asset_link="/opt/hero-rush-static/card-assets/current"
readonly app_group="hero-rush"
readonly deploy_user="hero-deploy"
readonly app_user="hero-rush"
readonly service_name="hero-rush-v2-relay"
readonly deploy_command="/usr/local/sbin/hero-rush-v2-deploy"
readonly ssh_entry_command="/usr/local/sbin/hero-rush-v2-ssh-entry"
readonly smoke_dir="/usr/local/lib/hero-rush-v2"
readonly sudoers_file="/etc/sudoers.d/hero-rush-v2-deploy"
readonly port="8093"

fail() { printf '[Hero V2 初始化] 错误：%s\n' "$*" >&2; exit 1; }
log() { printf '[Hero V2 初始化] %s\n' "$*"; }

[[ $EUID -eq 0 ]] || fail "必须由 root 执行"
[[ $# -eq 1 ]] || fail "用法：sudo bash server/setup-deploy-workflow.sh /root/hero-deploy.pub"
public_key_file="$1"
[[ -f "$public_key_file" && ! -L "$public_key_file" ]] || fail "部署公钥文件不存在或是符号链接"
public_key="$(tr -d '\r\n' < "$public_key_file")"
[[ "$public_key" =~ ^ssh-(ed25519|rsa|ecdsa-[^[:space:]]+)[[:space:]][A-Za-z0-9+/=]+([[:space:]].*)?$ ]] \
  || fail "部署公钥格式无效"

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
source_deployer="${script_dir}/deploy-release.sh"
source_ssh_entry="${script_dir}/hero-rush-v2-ssh-entry.sh"
source_smoke="$(cd -- "${script_dir}/../scripts" && pwd -P)/smoke-production-v2.mjs"
source_server_setup="${script_dir}/deploy-server.sh"
for source_file in "$source_deployer" "$source_ssh_entry" "$source_smoke" "$source_server_setup"; do
  [[ -f "$source_file" && ! -L "$source_file" ]] || fail "缺少初始化源文件：${source_file}"
done
bash -n "$source_deployer"
bash -n "$source_ssh_entry"
bash -n "$source_server_setup"
node --check "$source_smoke"

for command_name in git npm node nginx certbot curl flock sudo visudo ss; do
  command -v "$command_name" >/dev/null || fail "服务器缺少命令：${command_name}"
done
[[ "$(command -v systemctl)" == "/usr/bin/systemctl" ]] \
  || fail "systemctl 必须位于 /usr/bin/systemctl，以匹配最小化 sudoers 规则"
node_major="$(node -p 'Number(process.versions.node.split(".")[0])')"
[[ "$node_major" -ge 22 ]] || fail "需要 Node.js 22 或更高版本，当前为 $(node --version)"
[[ -d "$legacy_repo" && -f "${legacy_repo}/.env" ]] || fail "缺少现有正式服目录或 .env：${legacy_repo}"
[[ -e "$asset_link" ]] || fail "卡图发布链接不存在：${asset_link}"

getent group "$app_group" >/dev/null || groupadd --system "$app_group"
if ! id "$app_user" >/dev/null 2>&1; then
  useradd --system --gid "$app_group" --home-dir "$deploy_root" --no-create-home --shell /usr/sbin/nologin "$app_user"
fi
if ! id "$deploy_user" >/dev/null 2>&1; then
  useradd --create-home --shell /bin/bash "$deploy_user"
fi
deploy_primary_group="$(id -gn "$deploy_user")"

install -d -o "$deploy_user" -g "$app_group" -m 2755 "$deploy_root" "$releases_root"
install -d -o "$deploy_user" -g "$app_group" -m 0750 "$shared_root"
install -d -o root -g root -m 0755 "$config_root" "$smoke_dir"

frontend_env="${shared_root}/frontend.env"
if [[ ! -e "$frontend_env" ]]; then
  grep -E '^VITE_(SUPABASE_URL|SUPABASE_ANON_KEY|CARD_ASSET_CDN|CARD_ASSET_MANIFEST|BATTLE_V2_WS_URL)=' \
    "${legacy_repo}/.env" > "$frontend_env" || true
  grep -q '^VITE_CARD_ASSET_MANIFEST=' "$frontend_env" \
    || printf 'VITE_CARD_ASSET_MANIFEST=/card-assets/card-assets.manifest.json\n' >> "$frontend_env"
  grep -q '^VITE_BATTLE_V2_WS_URL=' "$frontend_env" \
    || printf 'VITE_BATTLE_V2_WS_URL=wss://hero-v2.grand-umi.com/ws/\n' >> "$frontend_env"
fi
chown "$deploy_user:$app_group" "$frontend_env"
chmod 0640 "$frontend_env"

if [[ ! -e "$server_env" ]]; then
  install -o root -g "$app_group" -m 0640 "${legacy_repo}/.env" "$server_env"
fi
chown root:"$app_group" "$server_env"
chmod 0640 "$server_env"
install -o root -g root -m 0644 /dev/null "$server_ready"

if [[ ! -e "$current_link" ]]; then
  ln -s "$legacy_repo" "$current_link"
elif [[ ! -L "$current_link" ]]; then
  fail "${current_link} 已存在且不是符号链接，拒绝覆盖"
fi
chown -h "$deploy_user:$app_group" "$current_link"

install -o root -g root -m 0755 "$source_deployer" "$deploy_command"
install -o root -g root -m 0755 "$source_ssh_entry" "$ssh_entry_command"
install -o root -g root -m 0755 "$source_smoke" "${smoke_dir}/smoke-production-v2.mjs"

install -d -o "$deploy_user" -g "$deploy_primary_group" -m 0700 "/home/${deploy_user}/.ssh"
authorized_keys="/home/${deploy_user}/.ssh/authorized_keys"
authorized_entry="restrict,command=\"${ssh_entry_command}\" ${public_key}"
printf '%s\n' "$authorized_entry" > "$authorized_keys"
chown "$deploy_user:$deploy_primary_group" "$authorized_keys"
chmod 0600 "$authorized_keys"

cat > "$sudoers_file" <<EOF
${deploy_user} ALL=(root) NOPASSWD: /usr/bin/systemctl restart ${service_name}.service
EOF
chmod 0440 "$sudoers_file"
visudo -cf "$sudoers_file" >/dev/null

SERVICE_NAME="$service_name" \
NGINX_SITE_NAME="hero-rush-v2" \
REPO_DIR="$current_link" \
ENV_FILE="$server_env" \
DOMAIN="$domain" \
PORT="$port" \
SERVICE_USER="$app_user" \
SERVICE_GROUP="$app_group" \
bash "$source_server_setup"

systemctl is-active --quiet "${service_name}.service" || fail "V2 服务未启动"
curl --fail --silent --show-error --output /dev/null "https://${domain}/battle"

log "正式服一键发布基础设施已配置完成。"
log "前端公共配置：${frontend_env}"
log "服务端私密配置：${server_env}"
