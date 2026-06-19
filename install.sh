#!/usr/bin/env bash
# Skint â€” Proxmox LXC install script
# Run on the Proxmox host:
#   bash <(curl -fsSL https://your-server/install.sh)
# Or inside an existing Debian 13 LXC:
#   bash install.sh

set -euo pipefail

APP_DIR="/opt/skint"
APP_USER="skint"
DB_NAME="skint"
DB_USER="skint"
DB_PASS=$(tr -dc 'A-Za-z0-9' < /dev/urandom | head -c 32)
SESSION_SECRET=$(tr -dc 'A-Za-z0-9' < /dev/urandom | head -c 64)
BACKUP_DIR="/var/backups/skint"
PORT=3000

echo ""
echo "  ____  _  _     _   "
echo " / ___|| |/ /   (_)  "
echo " \\___ \\| ' / _ | |  "
echo "  ___) | . \\ | || |  "
echo " |____/|_|\\_\\|_||_|  "
echo "  self-hosted budget app"
echo ""

# â”€â”€ System deps â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
apt-get update -qq
apt-get install -y -qq curl gnupg2 lsb-release postgresql nodejs npm git

# Node 22 LTS if system node is too old (Debian 13 ships Node 22 natively)
NODE_VER=$(node --version 2>/dev/null | sed 's/v//' | cut -d. -f1 || echo 0)
if [ "$NODE_VER" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

# â”€â”€ PostgreSQL â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
systemctl enable postgresql
systemctl start postgresql

su -c "psql -tc \"SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'\" | grep -q 1 || \
       psql -c \"CREATE USER $DB_USER WITH PASSWORD '$DB_PASS'\"" postgres

su -c "psql -tc \"SELECT 1 FROM pg_database WHERE datname='$DB_NAME'\" | grep -q 1 || \
       psql -c \"CREATE DATABASE $DB_NAME OWNER $DB_USER\"" postgres

# â”€â”€ App user & directory â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
id -u $APP_USER &>/dev/null || useradd -r -s /bin/false -d $APP_DIR $APP_USER
mkdir -p $APP_DIR $BACKUP_DIR
chown $APP_USER:$APP_USER $BACKUP_DIR

# â”€â”€ Clone / update â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
if [ -d "$APP_DIR/.git" ]; then
  echo "Updating existing install..."
  git -C $APP_DIR pull
else
  echo "Cloning repository..."
  # Replace with your actual repo URL
  git clone https://github.com/Peaches337/budget-tool.git $APP_DIR
fi

chown -R $APP_USER:$APP_USER $APP_DIR

# â”€â”€ Environment â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
  echo "Generated .env (DB password and session secret randomised)"
fi

# â”€â”€ Install deps & build â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
cd $APP_DIR
sudo -u $APP_USER npm ci
sudo -u $APP_USER npm run build
sudo -u $APP_USER npm run migrate

# â”€â”€ Systemd service â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
cat > /etc/systemd/system/skint.service <<EOF
[Unit]
Description=Skint budget app
After=network.target postgresql.service

[Service]
Type=simple
User=$APP_USER
WorkingDirectory=$APP_DIR
EnvironmentFile=$APP_DIR/.env
ExecStart=/usr/bin/node build/index.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable skint
systemctl restart skint

# â”€â”€ Backup cron â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
cat > /etc/cron.d/skint-backup <<EOF
0 3 * * * postgres pg_dump $DB_NAME | gzip > $BACKUP_DIR/skint_\$(date +\%Y-\%m-\%d).sql.gz 2>/dev/null
15 3 * * * find $BACKUP_DIR -name "*.sql.gz" -mtime +30 -delete 2>/dev/null
EOF

echo ""
echo "âœ“ Skint installed and running on port $PORT"
echo ""
echo "  DB password saved to: $APP_DIR/.env"
echo "  Backups to:           $BACKUP_DIR (daily at 3am, 30-day retention)"
echo ""
echo "  Access: http://$(hostname -I | awk '{print $1}'):$PORT"
echo ""
