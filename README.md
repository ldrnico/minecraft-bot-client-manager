# ⛏️ Minecraft Headless Client Bot & Multi-User Manager

Ein extrem leichtgewichtiger, headless Minecraft-Client-Manager auf Basis von **Node.js (v22 LTS) & Mineflayer**, speziell optimiert für **Ubuntu Linux Server mit nur 1 GB RAM**.

Ermöglicht das gleichzeitige Betreiben **mehrerer Minecraft-Accounts auf verschiedenen Servern (Multi-Bot Engine)**, rollenbasierte Benutzerkonten mit Login, ein dediziertes **Admin-Panel** zur Benutzerverwaltung, automatische Reconnects und eine reaktive Web-Bedienoberfläche.

---

## 💡 Warum diese Lösung für 1 GB RAM?
Ein normaler grafischer Minecraft Java Client benötigt mindestens 1,5 bis 2 GB RAM sowie eine grafische Oberfläche (X11 / VNC / Desktop-Umgebung) und würde auf einem 1 GB VPS sofort durch einen Out-Of-Memory-Crash (OOM) abstürzen.

Dieser Client basiert auf der **Mineflayer-Engine**:
- **Minimaler RAM-Verbrauch:** Nur ca. **60 MB bis 90 MB pro aktivem Bot** im laufenden Betrieb.
- **Keine Grafikoberfläche nötig:** Läuft vollständig headless im Hintergrund via PM2.
- **Automatische 2 GB Swap-Absicherung:** Verhindert zuverlässig Systemabstürze bei temporären Speicher-Spitzen.
- **Multi-Bot fähig:** Mehrere Minecraft-Accounts können parallel auf unterschiedlichen Servern online sein.

---

## 📋 Features

### 👥 Multi-User & Rollen-System
- **Login-System:** Sichere Anmeldung mit individuellen Benutzerkonten via HMAC-Tokens.
- **Admin-Rolle (`admin`):**
  - Zugriff auf das **Admin-Panel**.
  - Neue Benutzer anlegen (`user` oder `admin`).
  - Passwörter von Benutzern ändern oder zurücksetzen.
  - Benutzer löschen.
  - Vollständige Übersicht aller Bot-Profile im gesamten System.
- **Benutzer-Rolle (`user`):**
  - Sieht nur die eigenen zugewiesenen Bot-Profile.
  - Kann eigene Bots starten, stoppen, steuern und konfigurieren.
  - Eigenes Passwort im Tab „🔑 Mein Account“ ändern.

### 🤖 Multi-Bot Profile Engine
- **Mehrere Accounts & Server:** Beliebig viele Profile erstellbar (z. B. Bot 1 auf PrimeBlocks CB1, Bot 2 auf einem anderen Server).
- **Paralleler Betrieb:** Alle aktiven Bots können gleichzeitig online sein.
- **Profil-Umschalter:** Bequemes Dropdown im Header zum sekundenschnellen Wechseln zwischen Bots im Dashboard.
- **Isolierter Microsoft Token-Cache:** Jedes Profil speichert seine Authentifizierungstoken in einem eigenen Unterordner (`./auth-cache/<botId>/`), sodass sich mehrere Microsoft-Accounts niemals gegenseitig überschreiben.

### 🎮 Web-Dashboard (Tab 1)
- **Auto-Rejoin Schalter:** Schalte das automatische Wiederverbinden nach Kicks/Restarts temporär mit einem Klick ein oder aus.
- **Periodischer Reconnect (30 Min.):** Trennt und verbindet den gewählten Bot automatisch in einem festen Intervall neu (standardmäßig alle 30 Min.), inklusive Live-Countdown im Dashboard. An- und ausschaltbar per Schalter.
- **Live-Konsole & Chat:** Empfängt Spielernachrichten und Server-Meldungen in Echtzeit via WebSockets (inkl. automatischer Deduplizierung gegen doppelte Chat-Nachrichten).
- **Interaktive Steuerung:** 
  - Manuell **Verbinden** (`▶`) und **Trennen** (`⏹`).
  - **🦘 Springen (Jump)** und **👟 Sneak** direkt per Mausklick.
- **Schnellbefehle:** Ein-Klick-Buttons für CityBuild-Wechsel (`/server cb1`, `/server cb2`, `/server cb3`).
- **Befehlszeile:** Beliebige Minecraft-Befehle oder Chatnachrichten live an den Server senden.

### ⚙️ Bot-Einstellungen (Tab 2)
Alle Einstellungen des ausgewählten Bots lassen sich **direkt über das Web-Dashboard** anpassen und werden auf Knopfdruck fest in die `bots.json` auf dem Server gespeichert:
- Profilname
- Server-Adresse & Port (z. B. `primeblocks.net:25565`)
- Minecraft-Spielername (z. B. `MelonengolemGHG`)
- Authentifizierung: **Immer offizieller Microsoft-Account** (Device Code Flow)
- Minecraft-Version (Fest oder automatische Erkennung)
- Reconnect-Wartezeit nach Kicks (Sekunden)
- On-Join Befehle (z. B. `/server cb1`) & Verzögerung
- Periodischer Reconnect Intervall (in Minuten, z. B. 30)
- PaperMC-Heartbeats (`tick_end`)
- Profil löschen

### 🛡️ Integrierte Netzwerk- & Anti-Cheat Fixes
- **Modernes Ressourcenpaket-Handling:** Sendet automatisch den 2-stufigen Bestätigungs-Handshake (`accepted` ➔ `successfully_loaded` mit UUID), damit der Bot auf Servern mit Pflicht-Texturen (wie PrimeBlocks) nicht im Ladebildschirm hängen bleibt.
- **PaperMC Anti-Cheat Heartbeat:** Sendet alle 50ms das `tick_end`-Signal, um `Invalid move player packet received`-Kicks zu verhindern.
- **Unterserver-Erkennung:** Erkennt den Wechsel in die Konfigurationsphase von Proxys (Velocity / BungeeCord), sodass Wechsel auf `/server cb1` reibungslos ohne Verbindungsabbruch funktionieren.
- **Blickwinkel-Absicherung:** Verhindert Kicks durch Pitch-Überschreitungen über 90°.

---

## 🛠️ Installation auf Ubuntu Server

### Voraussetzungen
- Ubuntu 20.04, 22.04, 24.04 oder neuer
- Mindestens 1 GB RAM
- Root- oder Sudo-Rechte

---

### Methode A: Automatische 1-Klick-Installation (Empfohlen)

#### 1. Projektordner auf den Ubuntu-Server übertragen
Kopiere diesen Projektordner (z. B. per SFTP, FileZilla oder `scp`) auf deinen Server nach `/opt/minecraft-bot`:

```bash
# Beispiel per SCP von deinem PC aus:
scp -r "c:\Users\Nico\Desktop\minecraft-bot" root@DEINE-SERVER-IP:/opt/minecraft-bot
```

#### 2. Installationsskript starten
Verbinde dich per SSH mit deinem Server und führe das Skript aus:

```bash
cd /opt/minecraft-bot
chmod +x install.sh
sudo ./install.sh
```

**Was das Skript automatisch erledigt:**
1. Erstellt eine **2 GB Swap-Datei** (essenziell für Server mit 1 GB RAM).
2. Installiert **Node.js 22 LTS** und npm.
3. Installiert alle Bibliotheken (`mineflayer`, `minecraft-protocol`, `express` etc.).
4. Richtet den Prozessmanager **PM2** für den 24/7-Autostart ein.
5. Erstellt die `.env`-Datei aus der Vorlage.

---

### Methode B: Manuelle Schritt-für-Schritt Installation

Falls du die Schritte lieber selbst einzeln durchführen möchtest:

```bash
# 1. System aktualisieren & Tools installieren
sudo apt update && sudo apt install -y curl git ufw

# 2. 2 GB Swap-Speicher einrichten (Wichtig für 1 GB RAM!)
sudo fallocate -l 2G /swapfile || sudo dd if=/dev/zero of=/swapfile bs=1M count=2048
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# 3. Node.js 22 LTS installieren
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash -
sudo apt install -y nodejs

# 4. In den Bot-Ordner wechseln und Pakete installieren
cd /opt/minecraft-bot
npm install

# 5. PM2 Prozessmanager installieren
sudo npm install -g pm2

# 6. .env Datei vorbereiten
cp .env.example .env
```

---

## ⚙️ Server-Zugang (.env)

In der `.env`-Datei werden **nur noch die Zugangsdaten für das Web-Dashboard** hinterlegt. Alle Minecraft-Einstellungen werden bequem und übersichtlich über die Weboberfläche verwaltet (in `config.json`):

```bash
nano .env
```

```ini
# Web Dashboard Zugang (Website Benutzer & Passwort)
WEB_PORT=3000
WEB_USER=admin
WEB_PASSWORD=DeinSicheresPasswort123
```
*(Speichern in nano: `Strg + O`, `Enter`, Schließen: `Strg + X`)*

Alle Spiel- und Server-Optionen (Server-IP, Minecraft-Spielername, Version, Auto-Rejoin, Befehle) änderst du direkt im Browser unter **„⚙️ Bot-Einstellungen“**.

---

## 🔐 Authentifizierung: Immer offizieller Microsoft-Account

Der Client ist fest auf **offizielle Microsoft-Authentifizierung** konfiguriert (kein unsicherer Offline-Modus):

1. **Kein Passwort auf dem Server:** Du musst niemals dein Microsoft-Passwort eingeben oder im Klartext speichern.
2. Beim ersten Verbinden fordert der Bot bei Microsoft einen einmaligen Code an.
3. In der **Web-Dashboard-Konsole** oder in `pm2 logs` erscheint:
   ```text
   Microsoft-Login erforderlich! Öffne https://microsoft.com/devicelogin und gib folgenden Code ein: ABCD-EFGH
   ```
4. Öffne [microsoft.com/devicelogin](https://microsoft.com/devicelogin) auf deinem PC oder Smartphone, logge dich bei Microsoft ein und gib den Code ein.
5. Der Bot speichert ein sicheres **Session-Token lokal auf der Festplatte** und erneuert dieses bei jedem Reconnect automatisch.
6. **Dieser Schritt ist nur ein einziges Mal nötig!**

---

## 🏃 Bot starten und 24/7 laufen lassen

### 1. Firewall-Port öffnen
Gib den Web-Port in der Ubuntu-Firewall frei:
```bash
sudo ufw allow 3000/tcp
```

### 2. Bot im Hintergrund starten (PM2)
```bash
cd /opt/minecraft-bot

# Bot mit PM2 starten
pm2 start ecosystem.config.js

# Autostart bei Reboot des Ubuntu-Servers sichern
pm2 save
pm2 startup
```

---

## 🌐 Dashboard aufrufen

Öffne deinen Webbrowser:
```text
http://DEINE-UBUNTU-SERVER-IP:3000
```
- Melde dich mit deinem konfigurierten `WEB_USER` und `WEB_PASSWORD` an.
- **Tab „🎮 Dashboard & Konsole“:** Live-Chat beobachten, springen, sneak, `/server cb1` drücken, Auto-Rejoin & 30-Min-Reconnect steuern.
- **Tab „⚙️ Bot-Einstellungen“:** Beliebige Werte ändern und auf **„💾 Einstellungen speichern“** klicken.

---

## 🔧 Nützliche Befehle (Wartung & Verwaltung)

```bash
# Live-Logs im Terminal ansehen (inkl. Minecraft Chat & Systemmeldungen)
pm2 logs mc-client-bot

# Bot neu starten (z. B. nach Datei-Updates)
pm2 restart mc-client-bot

# Bot vorübergehend stoppen
pm2 stop mc-client-bot

# Status & Speichernutzung ansehen
pm2 status

# RAM-Verbrauch des Systems prüfen
free -h
```

---

## 📁 Projektstruktur

```text
minecraft-bot/
├── .env.example          # Vorlage für Web-Dashboard Login (WEB_USER, WEB_PASSWORD)
├── config.json           # Bot- und Server-Konfiguration (wird über Web UI gesteuert)
├── ecosystem.config.js   # PM2-Konfiguration (inkl. 250M RAM-Limit)
├── install.sh            # Automatisches Installationsskript (Node 22, Swap, PM2)
├── package.json          # Node.js Abhängigkeiten (Mineflayer, Express, WS)
├── README.md             # Dokumentation
├── server.js             # Hauptserver (Mineflayer Bot, Web-Server, WS, Reconnect-Engine)
└── public/
    ├── index.html        # Web-Dashboard mit Tabs & Controls
    ├── style.css         # Modernes Dark-Mode Dashboard-Design
    └── app.js            # Frontend-Logik (WebSocket, Config-Formular, Countdown)
```
