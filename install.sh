#!/bin/bash
set -e

echo "=========================================================="
echo " Minecraft Client Manager - Installation (Ubuntu Server) "
echo "=========================================================="

# 1. Swap-Speicher einrichten (essenziell für 1 GB RAM Server!)
if [ $(swapon --show | wc -l) -le 1 ]; then
    echo "[1/5] Erstelle 2 GB Swap-Speicher für Stabilität..."
    fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
    echo "Swap erfolgreich eingerichtet!"
else
    echo "[1/5] Swap-Speicher ist bereits vorhanden."
fi

# 2. Pakete und Node.js 22 LTS installieren
echo "[2/5] Aktualisiere System & installiere Node.js 22 LTS..."
apt-get update -y
apt-get install -y curl git ufw

if ! command -v node &> /dev/null || [ $(node -v | cut -d'.' -f1 | tr -d 'v') -lt 22 ]; then
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    apt-get install -y nodejs
fi

echo "Node Version: $(node -v)"
echo "NPM Version:  $(npm -v)"

# 3. Projekt-Abhängigkeiten installieren
echo "[3/5] Installiere Projekt-Abhängigkeiten..."
npm install --omit=dev

# .env Konfiguration vorbereiten falls noch nicht vorhanden
if [ ! -f .env ]; then
    cp .env.example .env
    echo ".env Datei erstellt."
fi

# 4. Firewall Port 3000 öffnen
echo "[4/5] Richte Firewall (Port 3000) ein..."
if command -v ufw &> /dev/null; then
    ufw allow 3000/tcp || true
fi

# 5. PM2 Prozessmanager einrichten
echo "[5/5] Richte PM2 Prozessmanager für 24/7 Autostart ein..."
npm install -g pm2
pm2 startup systemd -u root --hp /root || true

echo "=========================================================="
echo " Installation erfolgreich abgeschlossen!"
echo "=========================================================="
echo ""
echo "Nächste Schritte:"
echo " 1. Admin-Passwort anpassen:       nano .env"
echo " 2. Bot starten:                  pm2 start ecosystem.config.js"
echo " 3. Autostart bei Reboot sichern:  pm2 save"
echo " 4. Dashboard im Browser öffnen:   http://DEINE-SERVER-IP:3000"
echo "=========================================================="
