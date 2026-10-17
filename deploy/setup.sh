#!/usr/bin/env bash
# Installs (or updates) Money Maze on an Ubuntu server such as AWS Lightsail, with free HTTPS.
# Run in the server's terminal:
#   curl -fsSL https://raw.githubusercontent.com/<user>/<repo>/main/deploy/setup.sh | sudo bash -s -- https://github.com/<user>/<repo>.git
# Optional 2nd argument: your own domain name (defaults to <ip-with-dashes>.sslip.io, which needs no setup).
# The Lightsail firewall must allow HTTP (80) and HTTPS (443).
set -euo pipefail

REPO="${1:?Pass the GitHub repository URL}"
APP_DIR=/opt/money-maze
KEY_FILE=/etc/money-maze.key
IP="$(curl -fsS https://checkip.amazonaws.com | tr -d '[:space:]')"
DOMAIN="${2:-${IP//./-}.sslip.io}"
PUBLIC_URL="https://$DOMAIN"

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

# The app runs privately on port 3000; Caddy serves it to the world over HTTPS
cat > /etc/systemd/system/money-maze.service <<EOF
[Unit]
Description=Money Maze
After=network.target

[Service]
User=ubuntu
WorkingDirectory=$APP_DIR
Environment=PORT=3000
Environment=BIND=127.0.0.1
Environment=PUBLIC_URL=$PUBLIC_URL
Environment=HOST_KEY=$HOST_KEY
ExecStart=/usr/bin/node server.js
Restart=always

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable money-maze >/dev/null
systemctl restart money-maze   # frees port 80 if an older version was using it

# Caddy: gets and renews the HTTPS certificate automatically
command -v caddy >/dev/null || { apt-get update -q; apt-get install -y caddy; }
cat > /etc/caddy/Caddyfile <<EOF
$DOMAIN {
	reverse_proxy 127.0.0.1:3000
}

# Old links and QR codes that use the bare IP address go to the secure site
http://$IP {
	redir https://$DOMAIN{uri} permanent
}
EOF
systemctl enable caddy >/dev/null
systemctl restart caddy

echo "Waiting for the HTTPS certificate..."
for _ in $(seq 1 30); do
  if curl -fsS -o /dev/null "https://$DOMAIN/api/config" 2>/dev/null; then OK=1; break; fi
  sleep 3
done
echo
if [ "${OK:-}" = 1 ]; then
  echo "================ MONEY MAZE IS ONLINE (HTTPS) ================"
else
  echo "!! HTTPS is not answering yet. Check that the Lightsail firewall allows HTTPS (443),"
  echo "!! then run this command again. Details: sudo journalctl -u caddy --no-pager -n 30"
  echo "=============================================================="
fi
echo "Audience page (QR):  $PUBLIC_URL"
echo "Projector screen:    $PUBLIC_URL/screen"
echo "Host panel:          $PUBLIC_URL/host?key=$HOST_KEY"
echo "=============================================================="
