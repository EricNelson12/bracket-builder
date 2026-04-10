# Bracket Builder

Single-elimination tournament bracket manager. Create tournaments, seed teams, and record match results through a browser UI.

## Development

```bash
npm install
npm start        # http://localhost:3000
npm test
```

## Deploy (Debian LXC + nginx)

### 1. Clone the repo on the LXC

```bash
git clone <your-repo-url> /tmp/bracket-builder
cd /tmp/bracket-builder
```

### 2. Run the setup script as root

```bash
sudo bash deploy/setup.sh
```

This will:
- Install Node.js 22 (via signed NodeSource apt repo) and nginx
- Copy the app to `/opt/bracket-builder` (root-owned, read-only)
- Create a dedicated `bracket` system user
- Create `/opt/bracket-builder/data/` (writable only by `bracket`)
- Install and start the `bracket-builder` systemd service
- Configure nginx as a reverse proxy on port 80
- Open ports 80, 443, and SSH in ufw (if installed)
- Run a health check against `/api/tournaments`

### 3. Verify

```bash
systemctl status bracket-builder
curl http://localhost/api/tournaments
```

### Updates

```bash
cd /tmp/bracket-builder
git pull
sudo bash deploy/setup.sh   # idempotent — safe to re-run
```

### Logs

```bash
journalctl -u bracket-builder -f
```

## Data

Tournament data is stored in `/opt/bracket-builder/data/tournaments.json`. It is preserved across updates since `setup.sh` excludes the `data/` directory when syncing.
