# 🎮 Minecraft Client Manager (Headless Web Dashboard)

Ein extrem leichtgewichtiger, headless Minecraft-Client-Manager auf Basis von **Node.js (v22 LTS) & Mineflayer**, speziell optimiert für **Ubuntu Linux Server (auch mit nur 1 GB RAM)**.

Ermöglicht das gleichzeitige Betreiben **mehrerer Minecraft-Accounts auf verschiedenen Servern (Multi-Bot Engine)**, automatische Reconnects, Anti-AFK, Chat-Befehle und eine moderne, reaktive Dark-Mode Web-Bedienoberfläche.

---

## ⚡ Blitz-Installation (In 2 Minuten startklar)

Wenn du dich frisch per SSH auf deinem Ubuntu-Server (z. B. 20.04 / 22.04 / 24.04) angemeldet hast:

```bash
# 1. In den Zielordner wechseln & Dateien bereitstellen
sudo mkdir -p /opt/minecraft-bot && cd /opt/minecraft-bot

# 2. Dateien übertragen (oder git clone)
# (Kopiere die Projektdateien hierher)

# 3. Installationsskript ausführen
chmod +x install.sh
sudo ./install.sh

# 4. Optional: Admin-Passwort anpassen
nano .env

# 5. Client 24/7 im Hintergrund starten
pm2 start ecosystem.config.js
pm2 save
```

Öffne anschließend einfach deinen Browser:
👉 **`http://DEINE-SERVER-IP:3000`**

---

## 💡 Warum diese Lösung für 1 GB RAM Server?

Ein normales Minecraft Java mit Grafikoberfläche benötigt mindestens 2 GB RAM sowie eine Desktop-Umgebung (X11/VNC) und stürzt auf einem 1 GB VPS sofort ab (OOM Crash).

Dieser Client basiert auf der **Mineflayer-Engine**:
- **Sehr sparsam:** Nur ca. **60 MB bis 90 MB RAM pro aktivem Bot**.
- **Headless:** Läuft vollständig ohne GUI im Hintergrund via PM2.
- **Automatische 2 GB Swap-Datei:** Das Installationsskript richtet automatisch Swap-Speicher ein, damit der Server bei Lastspitzen nie abstürzt.
- **Multi-Bot Engine:** Mehrere Minecraft-Accounts können parallel auf unterschiedlichen Servern aktiv sein.

---

## 📋 Schritt-für-Schritt Anleitung (Von Null auf Ubuntu)

### Schritt 1: Mit dem Ubuntu-Server verbinden
Öffne PowerShell oder ein Terminal auf deinem PC und verbinde dich per SSH:
```bash
ssh root@DEINE-SERVER-IP
```

---

### Schritt 2: Projektdateien auf den Server laden

#### Option A: Per FileZilla / WinSCP (Einfachste Methode)
1. Verbinde dich per SFTP mit deinem Server.
2. Erstelle auf dem Server den Ordner: `/opt/minecraft-bot`
3. Ziehe alle Dateien aus diesem Projektordner dort hinein.

#### Option B: Per Git
```bash
sudo git clone https://github.com/ldrnico/minecraft-bot.git /opt/minecraft-bot
cd /opt/minecraft-bot
```

---

### Schritt 3: Automatischen Installer ausführen

Wechsle in das Verzeichnis und starte das mitgelieferte Installationsskript:

```bash
cd /opt/minecraft-bot
chmod +x install.sh
sudo ./install.sh
```

**Was das Skript vollautomatisch für dich erledigt:**
1. ✅ Richtet eine **2 GB Swap-Datei** ein (verhindert Out-Of-Memory auf 1 GB Servern).
2. ✅ Installiert **Node.js 22 LTS** und npm.
3. ✅ Installiert alle erforderlichen Pakete (`mineflayer`, `express`, `ws` etc.).
4. ✅ Öffnet den Port `3000/tcp` in der Ubuntu-Firewall (`ufw`).
5. ✅ Installiert den Prozessmanager **PM2** und richtet den Autostart bei Server-Reboots ein.
6. ✅ Erstellt die Datei `.env` aus der Vorlage.

---

### Schritt 4: Web-Zugangsdaten einrichten

Bearbeite die Datei `.env`:
```bash
nano .env
```

Trage dein gewünschtes Passwort für das Web-Dashboard ein:
```ini
WEB_PORT=3000
WEB_USER=admin
WEB_PASSWORD=DeinSicheresPasswortHier
WEB_SECRET=einZufaelligerGeheimerSchluessel
```
*(In `nano` speichern: `Strg + O`, `Enter` drücken. Schließen: `Strg + X`)*

> [!NOTE]
> Das Passwort in der `.env` wird für die Ersteinrichtung verwendet. Danach kannst du dein Passwort jederzeit bequem direkt im Webinterface unter **„Change Password“** ändern.

---

### Schritt 5: Bot starten & 24/7 Autostart sichern

Starte den Serverprozess mit dem vorkonfigurierten PM2-Setup:

```bash
cd /opt/minecraft-bot
pm2 start ecosystem.config.js
pm2 save
```

Damit läuft der Bot rund um die Uhr im Hintergrund und startet auch nach einem Server-Neustart automatisch wieder.

---

### Schritt 6: Dashboard im Browser aufrufen

Öffne an deinem PC oder Smartphone den Webbrowser:
```text
http://DEINE-SERVER-IP:3000
```

1. Melde dich mit deinen Zugangsdaten aus der `.env` an.
2. Klicke oben auf **`+ New`**, um ein Bot-Profil anzulegen (Server-Adresse, Port und Minecraft-Spielername eintragen).

---

## 🔐 Der Microsoft Device Code Login (Nur 1x nötig)

Der Bot nutzt die offizielle und sichere **Microsoft Device Code Authentifizierung** (du musst dein Microsoft-Passwort niemals auf dem Server eingeben!):

1. Klicke im Dashboard auf **„Connect“** (`▶`).
2. Im Dashboard erscheint eine gelbe Benachrichtigungsbox mit einem Login-Code (z. B. `ABCD-EFGH`).
3. Öffne im Browser [https://microsoft.com/devicelogin](https://microsoft.com/devicelogin).
4. Gib dort den Code ein und bestätige den Zugriff mit deinem Minecraft-Microsoft-Konto.
5. Der Bot loggt sich automatisch ein und speichert den sicheren Session-Token verschlüsselt im Ordner `./auth-cache/`.
6. **Fertig!** Bei künftigen Reconnects verbindet sich der Bot vollautomatisch, ohne dass du den Code erneut eingeben musst.

---

## ✨ Features im Überblick

* **Multi-Bot Profile:** Verwalte mehrere Accounts und Server gleichzeitig. Wechsel zwischen Bots mit einem Klick im Dropdown.
* **Auto-Rejoin Schalter:** Automatisches Wiederverbinden nach Server-Restarts oder Kicks per Toggle im Dashboard steuerbar.
* **Periodischer Reconnect:** Trennt und verbindet den Bot in einem frei einstellbaren Minuten-Intervall neu (z. B. alle 30 Min.), inklusive Live-Countdown.
* **Live-Konsole & Chat:** Beobachte Server-Nachrichten und Chat in Echtzeit.
* **Befehlszeile:** Sende Chat-Nachrichten oder Server-Befehle (z. B. `/server cb1`) direkt über das Dashboard an Minecraft.
* **PaperMC / Velocity Anti-Cheat Fixes:** Integrierte Heartbeats (`tick_end`), Handshakes für Ressourcenpakete und Konfigurationsphasen-Erkennung verhindern Verbindungsabbrüche auf modernen Servern.
* **Admin-Passwort ändern:** Passwort jederzeit im Reiter **„Change Password“** anpassen.

---

## 🔧 Nützliche Befehle (Wartung & Steuerung)

```bash
# Live-Logs der Bots im Terminal ansehen
pm2 logs mc-client-bot

# Bot neu starten (z. B. nach Updates)
pm2 restart mc-client-bot

# Bot stoppen
pm2 stop mc-client-bot

# Status & Speichernutzung prüfen
pm2 status

# RAM-Verbrauch des gesamten Servers anzeigen
free -h
```

---

## ❓ Häufige Fragen & Troubleshooting

### Die Weboberfläche lädt nicht?
Prüfe, ob Port 3000 in der Firewall deines Cloud-Anbieters (z. B. Hetzner Firewall, AWS Security Group) und auf dem Ubuntu-Server freigegeben ist:
```bash
sudo ufw allow 3000/tcp
```

### Der Bot verbindet sich nicht mit dem Microsoft-Konto?
Falls ein Token abgelaufen oder ungültig ist, kannst du im Dashboard unter **„Bot Settings“** auf **„Clear Microsoft Auth Cache“** klicken. Beim nächsten Klick auf *Connect* wird ein frischer Code für `microsoft.com/devicelogin` generiert.

### Wo werden die Bot-Profile gespeichert?
Alle konfigurierten Bots werden in der Datei `bots.json` im Projektverzeichnis gespeichert. Die Microsoft-Tokens liegen sicher isoliert pro Bot in `auth-cache/<botId>/`.

---

**Made by melonengolem** &middot; [GitHub: ldrnico](https://github.com/ldrnico)

