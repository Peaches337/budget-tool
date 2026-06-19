#!/usr/bin/env bash
# Skint -- Proxmox LXC / Debian install script
# Usage on a fresh Debian LXC:
#   curl -fsSL https://raw.githubusercontent.com/Peaches337/budget-tool/main/install.sh | bash

set -euo pipefail

APP_DIR="/opt/skint"
APP_USER="skint"
DB_NAME="skint"
DB_USER="skint"
set +o pipefail
DB_PASS=$(tr -dc 'A-Za-z0-9' < /dev/urandom | head -c 32)
SESSION_SECRET=$(tr -dc 'A-Za-z0-9' < /dev/urandom | head -c 64)
set -o pipefail
BACKUP_DIR="/var/backups/skint"
PORT=3000

echo ""
echo "  ____  _    _       _"
echo " / ___|| | _(_)_ __ | |_"
echo " \\___ \\| |/ / | '_ \\| __|"
echo "  ___) |   <| | | | | |_"
echo " |____/|_|\\_\\_|_| |_|\\__|"
echo "  self-hosted budget app"
echo ""

# -- System deps ---------------------------------------------------------------
# Remove Proxmox enterprise repos that cause 401 errors on non-subscribed hosts
rm -f /etc/apt/sources.list.d/pve-enterprise.list \
      /etc/apt/sources.list.d/ceph.list \
      /etc/apt/sources.list.d/pve-no-subscription.list 2>/dev/null || true

apt-get update -qq 2>&1 | grep -v "^E:.*proxmox\|^W:.*proxmox" || true
apt-get install -y -qq curl gnupg2 lsb-release git postgresql postgresql-client

# Node 22 LTS
NODE_VER=$(node --version 2>/dev/null | sed 's/v//' | cut -d. -f1 || echo 0)
if [ "$NODE_VER" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y -qq nodejs
fi

# -- PostgreSQL ----------------------------------------------------------------
systemctl enable postgresql
systemctl start postgresql

su -c "psql -tc \"SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'\" | grep -q 1 || \
       psql -c \"CREATE USER $DB_USER WITH PASSWORD '$DB_PASS'\"" postgres

su -c "psql -tc \"SELECT 1 FROM pg_database WHERE datname='$DB_NAME'\" | grep -q 1 || \
       psql -c \"CREATE DATABASE $DB_NAME OWNER $DB_USER\"" postgres

# -- App user & directories ----------------------------------------------------
id -u $APP_USER &>/dev/null || useradd -r -s /bin/false -d $APP_DIR $APP_USER
mkdir -p $APP_DIR $BACKUP_DIR
chown $APP_USER:$APP_USER $BACKUP_DIR

# -- Clone / update ------------------------------------------------------------
if [ -d "$APP_DIR/.git" ]; then
  echo "Updating existing install..."
  git -C $APP_DIR pull
else
  echo "Cloning repository..."
  git clone https://github.com/Peaches337/budget-tool.git $APP_DIR
fi

chown -R $APP_USER:$APP_USER $APP_DIR

# -- Environment ---------------------------------------------------------------
if [ ! -f "$APP_DIR/.env" ]; then
  cat > $APP_DIR/.env <<EOF
DATABASE_URL=postgresql://$DB_USER:$DB_PASS@localhost:5432/$DB_NAME
SESSION_SECRET=$SESSION_SECRET
PORT=$PORT
BACKUP_PATH=$BACKUP_DIR
NODE_ENV=production
EOF
  chown $APP_USER:$APP_USER $APP_DIR/.env
  chmod 600 $APP_DIR/.env
  echo "Generated .env (credentials randomised)"
fi

# -- Install deps, build, migrate ----------------------------------------------
cd $APP_DIR
sudo -u $APP_USER npm ci --quiet
sudo -u $APP_USER npm run build
sudo -u $APP_USER node scripts/migrate.js

# -- Systemd service -----------------------------------------------------------
cat > /etc/systemd/system/skint.service <<EOF
[Unit]
Description=Skint budget app
After=network.target postgresql.service

[Service]
Type=simple
User=$APP_USER
WorkingDirectory=$APP_DIR
EnvironmentFile=$APP_DIR/.env
ExecStart=/usr/bin/node start.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable skint
systemctl restart skint

# -- Daily backup cron (via pg_dump, keeps 30 days) ----------------------------
cat > /etc/cron.d/skint-backup <<EOF
0 3 * * * $APP_USER pg_dump \$DATABASE_URL | gzip > $BACKUP_DIR/skint_\$(date +\%Y-\%m-\%d).sql.gz 2>/dev/null
15 3 * * * $APP_USER find $BACKUP_DIR -name "*.sql.gz" -mtime +30 -delete 2>/dev/null
EOF

echo ""
echo "  Skint is running on port $PORT"
echo ""
echo "  DB password:  saved to $APP_DIR/.env (root-readable only)"
echo "  Backups:      $BACKUP_DIR (daily 3am, 30-day retention)"
echo "  Service:      systemctl status skint"
echo ""
echo "  Open: http://$(hostname -I | awk '{print $1}'):$PORT"
echo ""
