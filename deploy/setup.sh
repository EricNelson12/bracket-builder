#!/usr/bin/env bash
# setup.sh — Deploy bracket-builder on a fresh Debian LXC
# Run as root from the repo root: bash deploy/setup.sh
set -euo pipefail

APP_DIR=/opt/bracket-builder
APP_USER=bracket
SERVICE=bracket-builder
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "==> Updating package index..."
apt-get update -qq

# ── Node.js 22 via signed NodeSource apt repo ──────────────────────────────
if ! command -v node &>/dev/null || [[ "$(node --version)" != v22* ]]; then
    echo "==> Installing Node.js 22..."
    apt-get install -y -qq curl ca-certificates gnupg
    curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
        | gpg --dearmor -o /usr/share/keyrings/nodesource.gpg
    echo "deb [signed-by=/usr/share/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" \
        > /etc/apt/sources.list.d/nodesource.list
    apt-get update -qq
    apt-get install -y -qq nodejs
fi
echo "    node $(node --version)  npm $(npm --version)"

# ── nginx ──────────────────────────────────────────────────────────────────
if ! command -v nginx &>/dev/null; then
    echo "==> Installing nginx..."
    apt-get install -y -qq nginx
fi

# ── ufw (basic firewall) ───────────────────────────────────────────────────
if command -v ufw &>/dev/null; then
    echo "==> Configuring firewall..."
    ufw allow 80/tcp
    ufw allow 443/tcp
    ufw allow OpenSSH
    ufw --force enable
    echo "    ufw status: $(ufw status | head -1)"
fi

# ── Dedicated user ─────────────────────────────────────────────────────────
if ! id "$APP_USER" &>/dev/null; then
    echo "==> Creating user '$APP_USER'..."
    useradd --system --no-create-home --shell /usr/sbin/nologin "$APP_USER"
fi

# ── App files ──────────────────────────────────────────────────────────────
echo "==> Syncing app to $APP_DIR..."
mkdir -p "$APP_DIR"
rsync -a --delete \
    --exclude='.git' \
    --exclude='deploy' \
    --exclude='node_modules' \
    --exclude='data' \
    "$REPO_ROOT/" "$APP_DIR/"

echo "==> Installing production dependencies..."
cd "$APP_DIR"
npm ci --omit=dev --quiet

# ── Ownership and permissions ──────────────────────────────────────────────
# App code is root-owned and read-only for the app user.
# Only the data directory is writable by the app user.
echo "==> Setting permissions..."
chown -R root:root "$APP_DIR"
chmod -R u=rwX,go=rX "$APP_DIR"

mkdir -p "$APP_DIR/data"
chown -R "$APP_USER:$APP_USER" "$APP_DIR/data"
chmod -R u=rwX,go= "$APP_DIR/data"

# ── systemd service ────────────────────────────────────────────────────────
echo "==> Installing systemd service..."
cp "$SCRIPT_DIR/bracket-builder.service" /etc/systemd/system/"$SERVICE".service
systemctl daemon-reload
systemctl enable "$SERVICE"
systemctl restart "$SERVICE"
echo "    $(systemctl is-active $SERVICE) — $SERVICE"

# ── nginx site ─────────────────────────────────────────────────────────────
echo "==> Configuring nginx..."
cp "$SCRIPT_DIR/nginx.conf" /etc/nginx/sites-available/"$SERVICE"
ln -sf /etc/nginx/sites-available/"$SERVICE" /etc/nginx/sites-enabled/"$SERVICE"
rm -f /etc/nginx/sites-enabled/default

nginx -t
systemctl reload nginx

# ── Health check ──────────────────────────────────────────────────────────
echo "==> Health check..."
sleep 2
if curl -sf http://localhost/api/tournaments > /dev/null; then
    echo "    OK — /api/tournaments responded"
else
    echo "    WARN — health check failed; check: journalctl -u $SERVICE -n 50"
fi

echo ""
echo "Done! Bracket Builder is running at http://$(hostname -I | awk '{print $1}')/"
echo "Logs: journalctl -u $SERVICE -f"
