#!/usr/bin/env bash
# 在正式服务器上配置 Hero Rush 联机中继与 Nginx 站点。
set -euo pipefail

SERVICE_NAME="hero-rush-relay"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
NGINX_SITE="/etc/nginx/sites-available/hero-rush"
NGINX_LINK="/etc/nginx/sites-enabled/hero-rush"
REPO_DIR="/opt/hero-rush"
ACME_ROOT="/var/www/certbot"
DOMAIN="hero.grand-umi.com"
PORT="8092"
NODE_BIN="$(command -v node)"

install -d -m 0755 "$ACME_ROOT"

# 先开放 ACME 校验路径，首次部署时用于签发证书。
if [ ! -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]; then
  cat > "$NGINX_SITE" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};

    location ^~ /.well-known/acme-challenge/ {
        root ${ACME_ROOT};
        default_type text/plain;
    }

    location / {
        root ${REPO_DIR}/dist;
        try_files \$uri \$uri/ /index.html;
    }
}
EOF
  ln -sfn "$NGINX_SITE" "$NGINX_LINK"
  nginx -t
  systemctl reload nginx
  certbot certonly --webroot -w "$ACME_ROOT" -d "$DOMAIN" \
    --non-interactive --agree-tos --register-unsafely-without-email
fi

# 正式 HTTPS、单页应用回退和 WebSocket 反向代理。
cat > "$NGINX_SITE" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};

    location ^~ /.well-known/acme-challenge/ {
        root ${ACME_ROOT};
        default_type text/plain;
    }

    location / {
        return 308 https://${DOMAIN}\$request_uri;
    }
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ${DOMAIN};

    ssl_certificate /etc/letsencrypt/live/${DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${DOMAIN}/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_session_cache shared:HeroRushTls:10m;
    ssl_session_timeout 1d;
    ssl_session_tickets off;

    add_header X-Content-Type-Options nosniff always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;

    location /ws/ {
        proxy_pass http://127.0.0.1:${PORT}/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_read_timeout 75s;
        proxy_send_timeout 15s;
        proxy_connect_timeout 3s;
        proxy_buffering off;
    }

    location /assets/ {
        root ${REPO_DIR}/dist;
        try_files \$uri =404;
        expires 7d;
        add_header Cache-Control "public, immutable";
    }

    location / {
        root ${REPO_DIR}/dist;
        try_files \$uri \$uri/ /index.html;
    }
}
EOF

ln -sfn "$NGINX_SITE" "$NGINX_LINK"
nginx -t
systemctl reload nginx

cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=Hero Rush Online Relay Server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=${REPO_DIR}/server
EnvironmentFile=-${REPO_DIR}/.env
Environment=PORT=${PORT}
Environment=HOST=127.0.0.1
Environment=NODE_ENV=production
ExecStart=${NODE_BIN} ${REPO_DIR}/server/dist/index.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
systemctl restart "$SERVICE_NAME"

if ! systemctl is-active --quiet "$SERVICE_NAME"; then
  systemctl status "$SERVICE_NAME" --no-pager | tail -20
  exit 1
fi

echo "${SERVICE_NAME} 已在 127.0.0.1:${PORT} 对外提供联机服务"
