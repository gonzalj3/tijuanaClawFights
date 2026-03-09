#!/bin/bash
# Oracle Cloud Always Free - Tijuana Claw Fights Server Setup
# Run this script on the Oracle Cloud ARM VM after SSH'ing in
#
# Usage: ssh ubuntu@<YOUR_VM_IP> 'bash -s' < deploy/setup-server.sh

set -e

echo "=== Tijuana Claw Fights - Server Setup ==="

# 1. Update system
echo "[1/6] Updating system packages..."
sudo apt-get update -y && sudo apt-get upgrade -y

# 2. Install Bun
echo "[2/6] Installing Bun..."
curl -fsSL https://bun.sh/install | bash
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"
echo 'export BUN_INSTALL="$HOME/.bun"' >> ~/.bashrc
echo 'export PATH="$BUN_INSTALL/bin:$PATH"' >> ~/.bashrc
bun --version

# 3. Install git
echo "[3/6] Installing git..."
sudo apt-get install -y git

# 4. Clone the repo
echo "[4/6] Cloning repository..."
cd ~
if [ -d "tijuanaClawFights" ]; then
    cd tijuanaClawFights && git pull
else
    git clone https://github.com/$(whoami)/tijuanaClawFights.git || {
        echo "ERROR: Could not clone repo. Make sure it's pushed to GitHub first."
        echo "Or manually copy the files with: scp -r /path/to/tijuanaClawFights ubuntu@<VM_IP>:~/"
        exit 1
    }
    cd tijuanaClawFights
fi

# 5. Install dependencies and build
echo "[5/6] Installing dependencies and building..."
bun install
bun run build

# 6. Set up systemd service for auto-start
echo "[6/6] Setting up systemd service..."
sudo tee /etc/systemd/system/clawfights.service > /dev/null << 'SERVICEEOF'
[Unit]
Description=Tijuana Claw Fights Game Server
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/tijuanaClawFights
Environment=PORT=3000
Environment=BUN_INSTALL=/home/ubuntu/.bun
Environment=PATH=/home/ubuntu/.bun/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
ExecStart=/home/ubuntu/.bun/bin/bun run server/index.ts
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
SERVICEEOF

sudo systemctl daemon-reload
sudo systemctl enable clawfights
sudo systemctl start clawfights

echo ""
echo "=== Setup Complete! ==="
echo "Server is running on port 3000"
echo "Check status: sudo systemctl status clawfights"
echo "View logs:    sudo journalctl -u clawfights -f"
echo ""
echo "IMPORTANT: Make sure port 3000 is open in Oracle Cloud Security List!"
echo "See the deployment guide for instructions."
