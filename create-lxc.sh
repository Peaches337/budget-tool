#!/usr/bin/env bash
# create-lxc.sh — Run on the Proxmox HOST to create and install a Skint LXC
# Usage: bash <(curl -fsSL https://raw.githubusercontent.com/Peaches337/budget-tool/main/create-lxc.sh)

set -euo pipefail

# ── Colours ───────────────────────────────────────────────────────────────────
GRN='\033[0;32m'; YLW='\033[1;33m'; RED='\033[0;31m'; RST='\033[0m'; BLD='\033[1m'

echo ""
echo -e "${BLD}  ____  _    _       _${RST}"
echo -e "${BLD} / ___|| | _(_)_ __ | |_${RST}"
echo -e "${BLD} \\___ \\| |/ / | '_ \\| __|${RST}"
echo -e "${BLD}  ___) |   <| | | | | |_${RST}"
echo -e "${BLD} |____/|_|\\_\\_|_| |_|\\__|${RST}"
echo -e "  LXC setup for Proxmox"
echo ""

# ── Must run as root on Proxmox ───────────────────────────────────────────────
if [ "$(id -u)" != "0" ]; then
  echo -e "${RED}Error: run this script as root on the Proxmox host.${RST}" >&2
  exit 1
fi
if ! command -v pct &>/dev/null; then
  echo -e "${RED}Error: pct not found — is this a Proxmox host?${RST}" >&2
  exit 1
fi

# ── Helper: prompt with default ───────────────────────────────────────────────
ask() {
  local prompt="$1" default="$2" var_name="$3"
  local answer
  read -rp "$(echo -e "  ${YLW}${prompt}${RST} [${default}]: ")" answer
  eval "$var_name=\"${answer:-$default}\""
}

ask_required() {
  local prompt="$1" var_name="$2"
  local answer
  while true; do
    read -rp "$(echo -e "  ${YLW}${prompt}${RST}: ")" answer
    if [ -n "$answer" ]; then
      eval "$var_name=\"$answer\""
      break
    fi
    echo -e "  ${RED}Required — please enter a value.${RST}"
  done
}

# ── Suggest next free CTID ────────────────────────────────────────────────────
NEXT_ID=$(pvesh get /cluster/nextid 2>/dev/null || echo 200)

echo -e "${BLD}Container settings${RST}"
echo ""

ask "LXC ID"          "$NEXT_ID"   CT_ID
ask "Hostname"        "skint"      CT_NAME
ask "Memory (MB)"     "1024"       CT_MEM
ask "Swap (MB)"       "512"        CT_SWAP
ask "CPU cores"       "2"          CT_CPUS
ask "Disk size (GB)"  "8"          CT_DISK
ask "Storage pool"    "local-lvm"  CT_STORAGE
ask "Network bridge"  "vmbr0"      CT_BRIDGE

echo ""
echo -e "${BLD}Network${RST}"
echo ""
echo -e "  ${YLW}IP assignment${RST}"
echo "    1) DHCP (automatic)"
echo "    2) Static IP"
read -rp "  Choice [1]: " NET_CHOICE
NET_CHOICE="${NET_CHOICE:-1}"

if [ "$NET_CHOICE" = "2" ]; then
  ask_required "Static IP (e.g. 192.168.1.100/24)"  CT_IP
  ask_required "Gateway (e.g. 192.168.1.1)"          CT_GW
  NET_CONFIG="ip=${CT_IP},gw=${CT_GW}"
else
  NET_CONFIG="ip=dhcp"
fi

echo ""
echo -e "${BLD}DNS${RST}"
echo ""
ask "DNS server" "1.1.1.1" CT_DNS

echo ""
echo -e "${BLD}Root password for the container${RST}"
echo ""
read -rsp "  $(echo -e "${YLW}Root password${RST}"): " CT_PASS
echo ""
read -rsp "  $(echo -e "${YLW}Confirm password${RST}"): " CT_PASS2
echo ""
if [ "$CT_PASS" != "$CT_PASS2" ]; then
  echo -e "${RED}Passwords do not match.${RST}" >&2
  exit 1
fi

# ── Confirm ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${BLD}Summary${RST}"
echo "  ─────────────────────────────"
echo "  LXC ID:     $CT_ID"
echo "  Hostname:   $CT_NAME"
echo "  Memory:     ${CT_MEM} MB  (swap ${CT_SWAP} MB)"
echo "  CPUs:       $CT_CPUS"
echo "  Disk:       ${CT_DISK} GB on $CT_STORAGE"
echo "  Network:    $CT_BRIDGE — $NET_CONFIG"
echo "  DNS:        $CT_DNS"
echo "  ─────────────────────────────"
echo ""
read -rp "  Proceed? [Y/n]: " CONFIRM
CONFIRM="${CONFIRM:-Y}"
if [[ "$CONFIRM" != "Y" && "$CONFIRM" != "y" ]]; then
  echo "Aborted."
  exit 0
fi

# ── Download Debian 12 template ───────────────────────────────────────────────
echo ""
echo -e "${GRN}→ Checking for Debian 12 template...${RST}"
TMPL_STORAGE="local"
TMPL=$(pveam list $TMPL_STORAGE 2>/dev/null | awk '/debian-12/' | tail -1 | awk '{print $1}')
if [ -z "$TMPL" ]; then
  echo "  Downloading Debian 12 template..."
  pveam update
  TMPL_NAME=$(pveam available --section system 2>/dev/null | awk '/debian-12/' | tail -1 | awk '{print $2}')
  if [ -z "$TMPL_NAME" ]; then
    echo -e "${RED}Could not find Debian 12 template. Check: pveam available --section system${RST}" >&2
    exit 1
  fi
  pveam download $TMPL_STORAGE "$TMPL_NAME"
  TMPL="${TMPL_STORAGE}:vztmpl/${TMPL_NAME}"
else
  echo "  Found: $TMPL"
fi

# ── Create the container ──────────────────────────────────────────────────────
echo ""
echo -e "${GRN}→ Creating LXC $CT_ID ($CT_NAME)...${RST}"
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

echo -e "${GRN}→ Container started. Waiting for network...${RST}"
sleep 5

# ── Run Skint install inside the container ────────────────────────────────────
echo ""
echo -e "${GRN}→ Running Skint install inside LXC $CT_ID...${RST}"
echo ""
pct exec "$CT_ID" -- bash -c \
  "curl -fsSL 'https://raw.githubusercontent.com/Peaches337/budget-tool/main/install.sh?$(date +%s)' | bash"

# ── Get IP for display ────────────────────────────────────────────────────────
CT_ACTUAL_IP=$(pct exec "$CT_ID" -- hostname -I 2>/dev/null | awk '{print $1}' || echo "see container console")

echo ""
echo -e "${GRN}  ✓ Done!${RST}"
echo ""
echo -e "  Open Skint: ${BLD}http://${CT_ACTUAL_IP}:3000${RST}"
echo ""
echo "  Manage container:"
echo "    pct stop $CT_ID   / pct start $CT_ID"
echo "    pct enter $CT_ID  (root shell)"
echo "    systemctl status skint  (inside container)"
echo ""
