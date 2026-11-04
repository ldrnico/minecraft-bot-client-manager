# 🎮 Minecraft Client Manager (Headless Web Dashboard)

An ultra-lightweight, headless Minecraft client manager built with **Node.js (v22 LTS) & Mineflayer**, specially optimized for **Ubuntu Linux Servers (even with just 1 GB RAM)**.

Run multiple Minecraft accounts simultaneously across different servers with an isolated **multi-bot engine**, automatic re-join, anti-AFK arm swinging, in-game chat & commands, and a modern reactive dark-mode web dashboard.

---

## ⚡ Quickstart (Ready in 2 Minutes)

On your Ubuntu server (20.04 / 22.04 / 24.04):

```bash
# 1. Create project directory and navigate into it
sudo mkdir -p /opt/minecraft-bot && cd /opt/minecraft-bot

# 2. Clone the repository
sudo git clone https://github.com/ldrnico/minecraft-bot.git .

# 3. Run the automated installer
chmod +x install.sh
sudo ./install.sh

# 4. Optional: Customize your admin password
nano .env

# 5. Start the bot client 24/7 in the background
pm2 start ecosystem.config.js
pm2 save
```

Then open your browser:
👉 **`http://YOUR-SERVER-IP:3000`**

---

## 💡 Why This Solution for 1 GB RAM VPS?

Running vanilla Minecraft Java with a graphical environment requires at least 2 GB of RAM and a full desktop stack (X11 / VNC), instantly triggering Out-Of-Memory (OOM) crashes on low-end servers.

This client uses the **Mineflayer headless protocol engine**:
- **Ultra-low memory footprint:** Uses only **60 MB to 90 MB RAM per active bot**.
- **Fully Headless:** Runs cleanly in the background managed by PM2.
- **Automated 2 GB Swapfile:** The installation script automatically provisions a 2 GB swapfile so the server never crashes during memory spikes.
- **Multi-Bot Engine:** Multiple Minecraft accounts can be active on completely different servers simultaneously.

---

## 📋 Step-by-Step Installation Guide

### Step 1: Connect to your Ubuntu Server
Open PowerShell or a terminal on your computer and connect via SSH:
```bash
ssh root@YOUR-SERVER-IP
```

---

### Step 2: Transfer Files to the Server

#### Option A: Git Clone (Recommended)
```bash
sudo mkdir -p /opt/minecraft-bot
sudo git clone https://github.com/ldrnico/minecraft-bot.git /opt/minecraft-bot
cd /opt/minecraft-bot
```

#### Option B: SFTP (FileZilla / WinSCP)
1. Connect via SFTP to your server.
2. Create directory: `/opt/minecraft-bot`.
3. Upload all files from this project into that directory.

---

### Step 3: Run the Automated Installer

Navigate to the directory and run the included installer:

```bash
cd /opt/minecraft-bot
chmod +x install.sh
sudo ./install.sh
```

**What the installer does automatically:**
1. ✅ Sets up a **2 GB swapfile** (prevents OOM crashes on 1 GB VPS).
2. ✅ Installs **Node.js 22 LTS** and npm.
3. ✅ Installs production dependencies (`mineflayer`, `express`, `ws`, etc.).
4. ✅ Opens firewall port `3000/tcp` (`ufw`).
5. ✅ Installs **PM2** process manager and enables systemd reboot autostart.
6. ✅ Generates a default `.env` configuration file.

---

### Step 4: Configure Web Access

Edit the `.env` file:
```bash
nano .env
```

Enter your desired credentials for the web dashboard:
```ini
WEB_PORT=3000
WEB_USER=admin
WEB_PASSWORD=YourSecurePasswordHere
```
*(In `nano`, save with `Ctrl + O`, press `Enter`. Exit with `Ctrl + X`)*

> [!NOTE]
> The password in `.env` is used for the initial setup. Once logged in, you can update your password anytime directly in the dashboard under **"Change Password"**.

---

### Step 5: Start the Bot & Enable 24/7 Autostart

Start the service using PM2:

```bash
cd /opt/minecraft-bot
pm2 start ecosystem.config.js
pm2 save
```

Your bot manager now runs 24/7 and restarts automatically if the server reboots.

---

### Step 6: Access the Web Dashboard

Open your web browser on your PC or smartphone:
```text
http://YOUR-SERVER-IP:3000
```

1. Log in with the credentials defined in `.env`.
2. Click **`+ New`** in the header to create your first bot profile (enter server IP, port, and Minecraft player name).

---

## 🔐 Microsoft Device Code Sign-In (Only Needed Once)

The client uses official, secure **Microsoft Device Code Authentication** (you never have to type your Microsoft password onto the server):

1. Click **"Connect"** (`▶`) in the dashboard.
2. A yellow alert box appears displaying a login code (e.g., `ABCD-EFGH`) with a **Copy Code** button.
3. Click the link to open [https://microsoft.com/devicelogin](https://microsoft.com/devicelogin).
4. Enter the code and authorize access with your Microsoft/Minecraft account.
5. The bot connects automatically and stores the encrypted session token in `./auth-cache/<botId>/`.
6. **Done!** Future re-joins and server restarts will connect automatically without prompting for a code.

---

## ✨ Features

* **Multi-Bot Profiles:** Manage multiple accounts and servers simultaneously. Switch bots with a single click in the header dropdown.
* **Auto-Rejoin Toggle:** Automatically reconnects after server kicks or restarts.
* **Periodic Reconnect:** Disconnects and reconnects on a customizable interval (e.g. every 30 minutes) with a live countdown display.
* **Live Console & Chat:** Watch server messages and chat logs in real-time.
* **In-Game Command Bar:** Send chat messages or slash commands (e.g., `/server cb1`) directly from the web interface.
* **PaperMC / Velocity Anti-Cheat Compatibility:** Integrated `tick_end` packets, resource-pack auto-handshakes, and configuration-phase handling prevent timeouts on modern Minecraft networks.
* **Password Management:** Change admin password anytime under the **"Change Password"** tab.

---

## 🔧 Maintenance Commands

```bash
# View live terminal logs
pm2 logs mc-client-bot

# Restart the bot client
pm2 restart mc-client-bot

# Stop the bot client
pm2 stop mc-client-bot

# Check process status and memory usage
pm2 status

# View server memory consumption
free -h
```

---

## ❓ Troubleshooting

### Web dashboard won't load?
Ensure port 3000 is open in your cloud provider's firewall (e.g., Hetzner Cloud Firewall, AWS Security Group) as well as UFW:
```bash
sudo ufw allow 3000/tcp
```

### Bot cannot connect to Microsoft account?
If a token has expired, open the **"Bot Settings"** tab and click **"Clear Auth Cache"**. The next time you click **Connect**, a fresh device code will be requested.

### Where is bot data stored?
Configured bot profiles are saved in `bots.json`. Microsoft login tokens are isolated per profile under `./auth-cache/<botId>/`. Both are ignored by Git via `.gitignore`.

---

**Made by melonengolem** &middot; [GitHub: ldrnico](https://github.com/ldrnico)
