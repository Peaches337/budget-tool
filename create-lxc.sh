#!/usr/bin/env bash
# create-lxc.sh — Run on the Proxmox HOST to create and install a Skint LXC
# Usage: bash <(curl -fsSL https://raw.githubusercontent.com/Peaches337/budget-tool/main/create-lxc.sh)

set -euo pipefail

# ── Must run as root on Proxmox ───────────────────────────────────────────────
if [ "$(id -u)" != "0" ]; then
  echo "Error: run this script as root on the Proxmox host." >&2
  exit 1
fi
if ! command -v pct &>/dev/null; then
  echo "Error: pct not found — is this a Proxmox host?" >&2
  exit 1
fi

# ── Require whiptail ──────────────────────────────────────────────────────────
if ! command -v whiptail &>/dev/null; then
  apt-get install -y whiptail &>/dev/null || true
fi
if ! command -v whiptail &>/dev/null; then
  echo "Error: whiptail is required but could not be installed." >&2
  exit 1
fi

TITLE="Skint — LXC Setup"

# ── Welcome ───────────────────────────────────────────────────────────────────
whiptail --title "$TITLE" --msgbox \
"Welcome to the Skint installer for Proxmox VE.

This wizard will create a Debian 12 LXC container and
install Skint inside it automatically.

Press OK to begin." 14 58

# ── Suggest next free CTID ────────────────────────────────────────────────────
NEXT_ID=$(pvesh get /cluster/nextid 2>/dev/null || echo 200)

# ── Container settings ────────────────────────────────────────────────────────
CT_ID=$(whiptail --title "$TITLE" --inputbox \
  "Container ID" 8 42 "$NEXT_ID" 3>&1 1>&2 2>&3) || exit 0

CT_NAME=$(whiptail --title "$TITLE" --inputbox \
  "Hostname" 8 42 "skint" 3>&1 1>&2 2>&3) || exit 0

CT_MEM=$(whiptail --title "$TITLE" --inputbox \
  "Memory (MB)" 8 42 "1024" 3>&1 1>&2 2>&3) || exit 0

CT_SWAP=$(whiptail --title "$TITLE" --inputbox \
  "Swap (MB)" 8 42 "512" 3>&1 1>&2 2>&3) || exit 0

CT_CPUS=$(whiptail --title "$TITLE" --inputbox \
  "CPU cores" 8 42 "2" 3>&1 1>&2 2>&3) || exit 0

CT_DISK=$(whiptail --title "$TITLE" --inputbox \
  "Disk size (GB)" 8 42 "8" 3>&1 1>&2 2>&3) || exit 0

CT_STORAGE=$(whiptail --title "$TITLE" --inputbox \
  "Storage pool" 8 42 "local-lvm" 3>&1 1>&2 2>&3) || exit 0

CT_BRIDGE=$(whiptail --title "$TITLE" --inputbox \
  "Network bridge" 8 42 "vmbr0" 3>&1 1>&2 2>&3) || exit 0

# ── Network ───────────────────────────────────────────────────────────────────
NET_CHOICE=$(whiptail --title "$TITLE" --menu \
  "IP assignment" 12 52 2 \
  "1" "DHCP (automatic)" \
  "2" "Static IP" \
  3>&1 1>&2 2>&3) || exit 0

if [ "$NET_CHOICE" = "2" ]; then
  CT_IP=""
  while [ -z "$CT_IP" ]; do
    CT_IP=$(whiptail --title "$TITLE" --inputbox \
      "Static IP with prefix (e.g. 192.168.1.100/24)" 8 58 "" 3>&1 1>&2 2>&3) || exit 0
  done

  CT_GW=""
  while [ -z "$CT_GW" ]; do
    CT_GW=$(whiptail --title "$TITLE" --inputbox \
      "Gateway (e.g. 192.168.1.1)" 8 50 "" 3>&1 1>&2 2>&3) || exit 0
  done

  NET_CONFIG="ip=${CT_IP},gw=${CT_GW}"
else
  NET_CONFIG="ip=dhcp"
fi

# ── DNS ───────────────────────────────────────────────────────────────────────
CT_DNS=$(whiptail --title "$TITLE" --inputbox \
  "DNS server" 8 42 "1.1.1.1" 3>&1 1>&2 2>&3) || exit 0

# ── Root password ─────────────────────────────────────────────────────────────
CT_PASS=""
CT_PASS2="x"
while [ "$CT_PASS" != "$CT_PASS2" ] || [ -z "$CT_PASS" ]; do
  if [ "$CT_PASS" != "$CT_PASS2" ] && [ -n "$CT_PASS" ]; then
    whiptail --title "$TITLE" --msgbox "Passwords do not match — please try again." 8 42
  fi
  CT_PASS=$(whiptail --title "$TITLE" --passwordbox \
    "Root password for the container" 8 50 3>&1 1>&2 2>&3) || exit 0
  CT_PASS2=$(whiptail --title "$TITLE" --passwordbox \
    "Confirm root password" 8 50 3>&1 1>&2 2>&3) || exit 0
done

# ── Summary / confirm ─────────────────────────────────────────────────────────
whiptail --title "$TITLE" --yesno \
"Ready to create the container:

  LXC ID:    $CT_ID
  Hostname:  $CT_NAME
  Memory:    ${CT_MEM} MB  (swap ${CT_SWAP} MB)
  CPUs:      $CT_CPUS
  Disk:      ${CT_DISK} GB on $CT_STORAGE
  Network:   $CT_BRIDGE — $NET_CONFIG
  DNS:       $CT_DNS

Proceed?" 18 56 || exit 0

# ── Download Debian 12 template ───────────────────────────────────────────────
echo ""
echo "→ Checking for Debian 12 template..."
TMPL_STORAGE="local"
TMPL=$(pveam list $TMPL_STORAGE 2>/dev/null | awk '/debian-12/' | tail -1 | awk '{print $1}')
if [ -z "$TMPL" ]; then
  echo "  Downloading Debian 12 template..."
  pveam update
  TMPL_NAME=$(pveam available --section system 2>/dev/null | awk '/debian-12/' | tail -1 | awk '{print $2}')
  if [ -z "$TMPL_NAME" ]; then
    echo "Error: could not find Debian 12 template. Check: pveam available --section system" >&2
    exit 1
  fi
  pveam download $TMPL_STORAGE "$TMPL_NAME"
  TMPL="${TMPL_STORAGE}:vztmpl/${TMPL_NAME}"
else
  echo "  Found: $TMPL"
fi

# ── Create the container ──────────────────────────────────────────────────────
echo ""
echo "→ Creating LXC $CT_ID ($CT_NAME)..."
pct create "$CT_ID" "$TMPL" \
  --hostname "$CT_NAME" \
  --memory "$CT_MEM" \
  --swap "$CT_SWAP" \
  --cores "$CT_CPUS" \
  --rootfs "${CT_STORAGE}:${CT_DISK}" \
  --net0 "name=eth0,bridge=${CT_BRIDGE},${NET_CONFIG}" \
  --nameserver "$CT_DNS" \
  --password "$CT_PASS" \
  --unprivileged 1 \
  --features nesting=1 \
  --start 1

echo "→ Container started. Waiting for network..."
sleep 5

# ── Run Skint install inside the container ────────────────────────────────────
echo ""
echo "→ Running Skint install inside LXC $CT_ID..."
echo ""
pct exec "$CT_ID" -- bash -c \
  "curl -fsSL 'https://raw.githubusercontent.com/Peaches337/budget-tool/main/install.sh?$(date +%s)' | bash"

# ── Get IP for display ────────────────────────────────────────────────────────
CT_ACTUAL_IP=$(pct exec "$CT_ID" -- hostname -I 2>/dev/null | awk '{print $1}' || echo "see container console")

# ── Done ─────────────────────────────────────────────────────────────────────
whiptail --title "$TITLE" --msgbox \
"  Installation complete!

  Open Skint:
  http://${CT_ACTUAL_IP}:3000

  Manage container:
    pct stop $CT_ID  / pct start $CT_ID
    pct enter $CT_ID  (root shell)
    systemctl status skint  (inside container)" 16 56

echo ""
echo "Done. Open Skint: http://${CT_ACTUAL_IP}:3000"
echo ""
