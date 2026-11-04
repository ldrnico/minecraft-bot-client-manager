#!/bin/bash
set -e

echo "=========================================================="
echo " Minecraft Client Manager - Installation (Ubuntu Server) "
echo "=========================================================="

# 1. Configure Swap Memory (essential for 1 GB RAM servers)
if [ $(swapon --show | wc -l) -le 1 ]; then
    echo "[1/5] Creating 2 GB swap memory for stability..."
    fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
    echo "Swap configured successfully!"
else
    echo "[1/5] Swap memory is already active."
fi

# 2. Update packages and install Node.js 22 LTS
echo "[2/5] Updating system packages & installing Node.js 22 LTS..."
apt-get update -y
apt-get install -y curl git ufw

if ! command -v node &> /dev/null || [ $(node -v | cut -d'.' -f1 | tr -d 'v') -lt 22 ]; then
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    apt-get install -y nodejs
fi

echo "Node Version: $(node -v)"
echo "NPM Version:  $(npm -v)"

# 3. Install project dependencies
echo "[3/5] Installing production dependencies..."
npm install --omit=dev

# Prepare .env configuration file if not present
if [ ! -f .env ]; then
    cp .env.example .env
    echo ".env file created from .env.example."
fi

# 4. Open firewall port 3000
echo "[4/5] Configuring firewall (Port 3000)..."
if command -v ufw &> /dev/null; then
    ufw allow 3000/tcp || true
fi

# 5. Setup PM2 process manager for 24/7 background operation
echo "[5/5] Setting up PM2 process manager for 24/7 autostart..."
npm install -g pm2
pm2 startup systemd -u root --hp /root || true

echo "=========================================================="
echo " Installation completed successfully!"
echo "=========================================================="
echo ""
echo "Next steps:"
echo " 1. Set your admin password:      nano .env"
echo " 2. Start the client:             pm2 start ecosystem.config.js"
echo " 3. Save autostart on reboot:     pm2 save"
echo " 4. Open dashboard in browser:    http://YOUR-SERVER-IP:3000"
echo "=========================================================="
