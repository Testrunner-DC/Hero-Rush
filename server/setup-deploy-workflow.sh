#!/usr/bin/env bash
# 一次性配置正式服自动发布账号、目录、systemd、Nginx 和最小 sudo 权限。
set -Eeuo pipefail
umask 027

export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

readonly DEPLOY_USER="hero-deploy"
readonly APP_USER="hero-rush"
readonly APP_GROUP="hero-rush"
readonly DEPLOY_ROOT="/opt/hero-rush-v2-deploy"
readonly RELEASES_DIR="${DEPLOY_ROOT}/releases"
readonly SHARED_DIR="${DEPLOY_ROOT}/shared"
readonly CURRENT_LINK="${DEPLOY_ROOT}/current"
readonly LEGACY_REPO="/opt/hero-rush-v2"
readonly INSTALL_PATH="/usr/local/sbin/hero-rush-v2-deploy"
readonly SUDOERS_FILE="/etc/sudoers.d/hero-rush-v2-deploy"
readonly PUBLIC_KEY_FILE="${1:-}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "初始化脚本必须由 root 执行。" >&2
  exit 77
fi
if [[ ! -d "$LEGACY_REPO" || ! -f "${LEGACY_REPO}/.env" ]]; then
  echo "未找到现有正式服目录或 .env：${LEGACY_REPO}" >&2
  exit 66
fi

if ! getent group "$APP_GROUP" >/dev/null; then
  groupadd --system "$APP_GROUP"
fi
if ! id -u "$APP_USER" >/dev/null 2>&1; then
  useradd --system --gid "$APP_GROUP" --home-dir "$DEPLOY_ROOT" --no-create-home --shell /usr/sbin/nologin "$APP_USER"
fi
if ! id -u "$DEPLOY_USER" >/dev/null 2>&1; then
  useradd --create-home --shell /bin/bash "$DEPLOY_USER"
fi
usermod -a -G "$APP_GROUP" "$DEPLOY_USER"

install -d -o "$DEPLOY_USER" -g "$APP_GROUP" -m 2770 "$DEPLOY_ROOT" "$RELEASES_DIR"
install -d -o "$DEPLOY_USER" -g "$APP_GROUP" -m 0750 "$SHARED_DIR"
install -o "$DEPLOY_USER" -g "$APP_GROUP" -m 0640 "${LEGACY_REPO}/.env" "${SHARED_DIR}/.env"
chgrp "$APP_GROUP" "${LEGACY_REPO}/.env"
chmod 0640 "${LEGACY_REPO}/.env"

if [[ ! -e "$CURRENT_LINK" ]]; then
  ln -s "$LEGACY_REPO" "$CURRENT_LINK"
elif [[ ! -L "$CURRENT_LINK" ]]; then
  echo "${CURRENT_LINK} 已存在且不是符号链接，拒绝覆盖。" >&2
  exit 65
fi
chown -h "$DEPLOY_USER:$APP_GROUP" "$CURRENT_LINK"

install -o root -g root -m 0755 "${LEGACY_REPO}/server/deploy-release.sh" "$INSTALL_PATH"

cat > "$SUDOERS_FILE" <<EOF
${DEPLOY_USER} ALL=(root) NOPASSWD: /usr/bin/systemctl restart hero-rush-v2-relay.service
EOF
chmod 0440 "$SUDOERS_FILE"
visudo -cf "$SUDOERS_FILE"

if [[ -n "$PUBLIC_KEY_FILE" ]]; then
  if [[ ! -s "$PUBLIC_KEY_FILE" ]]; then
    echo "部署公钥文件不存在或为空：${PUBLIC_KEY_FILE}" >&2
    exit 66
  fi
  install -d -o "$DEPLOY_USER" -g "$DEPLOY_USER" -m 0700 "/home/${DEPLOY_USER}/.ssh"
  install -o "$DEPLOY_USER" -g "$DEPLOY_USER" -m 0600 "$PUBLIC_KEY_FILE" "/home/${DEPLOY_USER}/.ssh/authorized_keys"
fi

SERVICE_NAME="hero-rush-v2-relay" \
NGINX_SITE_NAME="hero-rush-v2" \
REPO_DIR="$CURRENT_LINK" \
DOMAIN="hero-v2.grand-umi.com" \
PORT="8093" \
SERVICE_USER="$APP_USER" \
SERVICE_GROUP="$APP_GROUP" \
bash "${LEGACY_REPO}/server/deploy-server.sh"

systemctl is-active --quiet hero-rush-v2-relay.service
curl --fail --silent --show-error --output /dev/null https://hero-v2.grand-umi.com/battle

echo "正式服一键发布基础设施已配置完成。"
