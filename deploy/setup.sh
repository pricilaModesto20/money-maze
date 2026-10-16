#!/usr/bin/env bash
# Installs (or updates) Money Maze on an Ubuntu server such as AWS Lightsail and keeps it running.
# Run in the server's terminal:
#   curl -fsSL https://raw.githubusercontent.com/<user>/<repo>/main/deploy/setup.sh | sudo bash -s -- https://github.com/<user>/<repo>.git
# Optional 2nd argument: the address for the QR code (defaults to http://<this server's public IP>).
set -euo pipefail

REPO="${1:?Pass the GitHub repository URL}"
APP_DIR=/opt/money-maze
KEY_FILE=/etc/money-maze.key

PUBLIC="${2:-$(curl -fsS https://checkip.amazonaws.com | tr -d '[:space:]')}"
case "$PUBLIC" in http*) PUBLIC_URL="$PUBLIC" ;; *) PUBLIC_URL="http://$PUBLIC" ;; esac

# Node.js 20 and git
if ! command -v node >/dev/null || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 18 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
command -v git >/dev/null || apt-get install -y git

# App code from GitHub (first run clones, later runs pull the latest version)
if [ -d "$APP_DIR/.git" ]; then
  sudo -u ubuntu git -C "$APP_DIR" pull --ff-only
else
  mkdir -p "$APP_DIR" && chown ubuntu:ubuntu "$APP_DIR"
  sudo -u ubuntu git clone "$REPO" "$APP_DIR"
fi
cd "$APP_DIR"
sudo -u ubuntu npm install --omit=dev --no-fund --no-audit

# Host key: created once, then kept so the host panel link never changes
[ -s "$KEY_FILE" ] || head -c 64 /dev/urandom | tr -dc 'a-z0-9' | head -c 10 > "$KEY_FILE"
chmod 600 "$KEY_FILE"
HOST_KEY="$(cat "$KEY_FILE")"

# Run as a service on port 80, restart automatically
cat > /etc/systemd/system/money-maze.service <<EOF
[Unit]
Description=Money Maze
After=network.target

[Service]
User=ubuntu
WorkingDirectory=$APP_DIR
Environment=PORT=80
Environment=PUBLIC_URL=$PUBLIC_URL
Environment=HOST_KEY=$HOST_KEY
AmbientCapabilities=CAP_NET_BIND_SERVICE
ExecStart=/usr/bin/node server.js
Restart=always

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable money-maze >/dev/null
systemctl restart money-maze
sleep 2
systemctl --no-pager --lines=5 status money-maze || true
echo
echo "================ MONEY MAZE IS ONLINE ================"
echo "Audience page (QR):  $PUBLIC_URL"
echo "Projector screen:    $PUBLIC_URL/screen"
echo "Host panel:          $PUBLIC_URL/host?key=$HOST_KEY"
echo "======================================================"
