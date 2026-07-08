#!/bin/bash
# ============================================================
# deploy-server.sh — 香港服务器联机服务端部署脚本
# 由 deploy-hero.ps1 在 SSH 时远程触发
# 功能：确保 systemd 服务 + Caddy WebSocket 代理已配置
# ============================================================
set -e

SERVICE_NAME="hero-rush-relay"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
CADDY_FILE="/etc/caddy/Caddyfile"
PORT=8082

# ── 1. systemd 服务 ──
if [ ! -f "$SERVICE_FILE" ]; then
  echo "创建 systemd 服务: $SERVICE_NAME (端口 $PORT)"
  cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=Hero Rush Online Relay Server
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/hero-rush/server
ExecStart=/usr/bin/node /opt/hero-rush/server/dist/index.js
Restart=on-failure
RestartSec=5
Environment=PORT=$PORT

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
  systemctl enable "$SERVICE_NAME"
  echo "服务已创建并启用"
fi

# ── 2. Caddy WebSocket 反代 ──
if ! grep -q "hero.grand-umi.com.*/ws" "$CADDY_FILE" 2>/dev/null; then
  echo "添加 Caddy WebSocket 反向代理路由"
  # 在 hero.grand-umi.com 块内插入 ws 路由（在 root 指令之前）
  sed -i '/hero.grand-umi.com {/a\
    # WebSocket 联机对战中继服务\
    handle_path \/ws\/* {\
        reverse_proxy localhost:'"$PORT"'\
    }' "$CADDY_FILE"
  systemctl reload caddy
  echo "Caddy 已重载"
fi

# ── 3. 启动/重启服务 ──
systemctl restart "$SERVICE_NAME"
echo "$SERVICE_NAME 已重启"

# ── 4. 验证 ──
sleep 1
if systemctl is-active --quiet "$SERVICE_NAME"; then
  echo "✓ $SERVICE_NAME 运行中"
else
  echo "✕ $SERVICE_NAME 未运行"
  systemctl status "$SERVICE_NAME" --no-pager | tail -5
  exit 1
fi
