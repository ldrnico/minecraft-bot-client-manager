#!/bin/bash
set -e

echo "=========================================================="
echo " Minecraft Client Bot - Installation (Ubuntu 1GB RAM VPS) "
echo "=========================================================="

# 1. Swap-Speicher einrichten (essenziell für 1 GB RAM Server!)
if [ $(swapon --show | wc -l) -le 1 ]; then
    echo "[1/4] Erstelle 2 GB Swap-Speicher für Stabilität..."
    fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
    echo "Swap erfolgreich eingerichtet!"
else
    echo "[1/4] Swap-Speicher ist bereits vorhanden."
fi

# 2. Pakete und Node.js 20 LTS installieren
echo "[2/4] Aktualisiere System & installiere Node.js..."
apt-get update -y
apt-get install -y curl git ufw

# Node.js 22 LTS Setup (benötigt für moderne Mineflayer 4.39+ Versionen)
if ! command -v node &> /dev/null || [ $(node -v | cut -d'.' -f1 | tr -d 'v') -lt 22 ]; then
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    apt-get install -y nodejs
fi

echo "Node Version: $(node -v)"
echo "NPM Version:  $(npm -v)"

# 3. Projekt-Abhängigkeiten installieren
echo "[3/4] Installiere Projekt-Abhängigkeiten..."
npm install --omit=dev

# .env Konfiguration vorbereiten falls noch nicht vorhanden
if [ ! -f .env ]; then
    cp .env.example .env
    echo ".env Datei erstellt. Bitte passe dort Server-IP und Passwörter an!"
fi

# 4. PM2 Prozessmanager installieren
echo "[4/4] Richte PM2 Prozessmanager ein..."
npm install -g pm2
pm2 startup systemd -u root --hp /root || true

echo "=========================================================="
echo " Installation abgeschlossen!"
echo ""
echo "Nächste Schritte:"
echo " 1. Bearbeite die Einstellungen:  nano .env"
echo " 2. Starte den Bot mit PM2:      pm2 start ecosystem.config.js"
echo " 3. Speichere für Autostart:      pm2 save"
echo " 4. Öffne Port 3000 in UFW:       ufw allow 3000/tcp"
echo "=========================================================="
