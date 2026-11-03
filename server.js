require('dotenv').config();
const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const WebSocket = require('ws');
const mineflayer = require('mineflayer');

// Prozess-Absicherung (verhindert, dass unerwartete Stream-Fehler Node.js beenden)
process.on('uncaughtException', err => {
  console.error('[UNCAUGHT EXCEPTION]', err);
});
process.on('unhandledRejection', reason => {
  console.error('[UNHANDLED REJECTION]', reason);
});

// Konfiguration & Ports
const PORT = process.env.WEB_PORT || 3000;
const JWT_SECRET = process.env.WEB_SECRET || 'mc_bot_secret_' + (process.env.WEB_PASSWORD || 'secret123');

// Dateipfade
const USERS_FILE = path.join(__dirname, 'users.json');
const BOTS_FILE = path.join(__dirname, 'bots.json');
const LEGACY_CONFIG_FILE = path.join(__dirname, 'config.json');
const AUTH_CACHE_BASE = path.join(__dirname, 'auth-cache');

if (!fs.existsSync(AUTH_CACHE_BASE)) {
  fs.mkdirSync(AUTH_CACHE_BASE, { recursive: true });
}

// -------------------------------------------------------------
// 1. Benutzerverwaltung & Kryptographie
// -------------------------------------------------------------
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

function verifyPassword(password, salt, hash) {
  try {
    const verifyHash = crypto.scryptSync(password, salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(verifyHash, 'hex'));
  } catch (e) {
    return false;
  }
}

function createToken(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  // Token ist 14 Tage gültig
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + 14 * 24 * 60 * 60 * 1000 })).toString('base64url');
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
  if (sig !== expectedSig) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

function loadUsers() {
  if (fs.existsSync(USERS_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
      if (Array.isArray(data) && data.length > 0) return data;
    } catch (e) {
      console.error('Fehler beim Lesen von users.json:', e.message);
    }
  }

  // Initialer Admin aus .env oder Standard
  const initialUser = process.env.WEB_USER || 'admin';
  const initialPass = process.env.WEB_PASSWORD || 'admin123';
  const { salt, hash } = hashPassword(initialPass);

  const defaultUsers = [
    {
      id: 'u_' + crypto.randomBytes(4).toString('hex'),
      username: initialUser,
      salt,
      hash,
      role: 'admin',
      createdAt: new Date().toISOString(),
    },
  ];

  saveUsers(defaultUsers);
  console.log(`[AUTH] Neuer Standard-Admin angelegt: Benutzername "${initialUser}"`);
  return defaultUsers;
}

function saveUsers(users) {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
  } catch (e) {
    console.error('Fehler beim Speichern von users.json:', e.message);
  }
}

let usersList = loadUsers();

function getUserByUsername(username) {
  return usersList.find(u => u.username.toLowerCase() === (username || '').toLowerCase());
}

// -------------------------------------------------------------
// 2. Minecraft Bot Profile & Datenhaltung
// -------------------------------------------------------------
const DEFAULT_BOT_SETTINGS = {
  name: 'PrimeBlocks Bot',
  ownerUsername: 'admin',
  host: 'primeblocks.net',
  port: 25565,
  username: 'MelonengolemGHG',
  version: '',
  autoReconnect: true,
  reconnectDelaySec: 10,
  onJoinCommands: ['/server cb1'],
  onJoinDelaySec: 3,
  enablePhysics: true,
  antiAfk: true,
  periodicReconnect: true,
  periodicReconnectIntervalMin: 30,
};

function loadBotConfigs() {
  if (fs.existsSync(BOTS_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(BOTS_FILE, 'utf8'));
      if (Array.isArray(data) && data.length > 0) return data;
    } catch (e) {
      console.error('Fehler beim Lesen von bots.json:', e.message);
    }
  }

  // Migration aus bestehender config.json
  let migratedConfig = { ...DEFAULT_BOT_SETTINGS };
  if (fs.existsSync(LEGACY_CONFIG_FILE)) {
    try {
      const legacyData = JSON.parse(fs.readFileSync(LEGACY_CONFIG_FILE, 'utf8'));
      migratedConfig = { ...migratedConfig, ...legacyData };
      console.log('[BOTS] Bestehende config.json erfolgreich in Bot-Profil migriert.');
    } catch (e) {}
  }

  const defaultBots = [
    {
      id: 'bot_default',
      ...migratedConfig,
      createdAt: new Date().toISOString(),
    },
  ];

  saveBotConfigs(defaultBots);
  return defaultBots;
}

function saveBotConfigs(bots) {
  try {
    fs.writeFileSync(BOTS_FILE, JSON.stringify(bots, null, 2), 'utf8');
  } catch (e) {
    console.error('Fehler beim Speichern von bots.json:', e.message);
  }
}

// Hilfsfunktion: Minecraft Chat-Komponenten / Kicks sauber als Klartext parsen
function parseMinecraftChat(data) {
  if (!data) return '';
  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data);
      return parseMinecraftChat(parsed);
    } catch (e) {
      return data.replace(/§[0-9a-fk-or]/gi, '').trim();
    }
  }
  if (typeof data === 'object') {
    let result = '';
    if (data.text) result += data.text;
    if (data.extra && Array.isArray(data.extra)) {
      result += data.extra.map(e => parseMinecraftChat(e)).join('');
    }
    if (data.value && typeof data.value === 'object') {
      if (data.value.text && data.value.text.value) result += data.value.text.value;
      if (data.value.extra && data.value.extra.value && Array.isArray(data.value.extra.value.value)) {
        result += data.value.extra.value.value.map(v => (v.text ? v.text.value : '')).join('');
      }
    }
    if (result) return result.replace(/§[0-9a-fk-or]/gi, '').trim();
    try {
      return JSON.stringify(data).replace(/§[0-9a-fk-or]/gi, '');
    } catch (e) {
      return '';
    }
  }
  return String(data);
}

// -------------------------------------------------------------
// 3. BotInstance Klasse (Vollständige Mineflayer-Kapselung)
// -------------------------------------------------------------
class BotInstance {
  constructor(config, onBroadcast) {
    this.config = { ...config };
    this.id = config.id;
    this.name = config.name || `Bot (${this.config.username})`;
    this.ownerUsername = config.ownerUsername || 'admin';
    this.onBroadcast = onBroadcast;

    this.bot = null;
    this.status = 'disconnected'; // 'disconnected' | 'connecting' | 'online' | 'reconnecting'
    this.reconnectTimer = null;
    this.connectionWatchdog = null;
    this.tickEndTimer = null;
    this.periodicReconnectTimer = null;
    this.nextPeriodicReconnectTimestamp = null;
    this.logHistory = [];
    this.isSneaking = false;
    this.lastLoggedChat = '';
    this.lastLoggedTime = 0;
    this.msaCodeInfo = null;
    this.antiAfkTimer = null;

    // Eigener Microsoft Cache-Ordner pro Bot-Profil
    this.profileAuthFolder = path.join(AUTH_CACHE_BASE, this.id);
    if (!fs.existsSync(this.profileAuthFolder)) {
      fs.mkdirSync(this.profileAuthFolder, { recursive: true });
    }
  }

  addLog(type, message) {
    const timeStr = new Date().toLocaleTimeString('de-DE');
    const entry = { timestamp: timeStr, type, message };
    this.logHistory.push(entry);
    if (this.logHistory.length > 200) {
      this.logHistory.shift();
    }
    this.onBroadcast('log', this.id, entry);
  }

  broadcastState() {
    this.onBroadcast('state', this.id, this.getState());
  }

  getState() {
    return {
      id: this.id,
      name: this.name,
      ownerUsername: this.ownerUsername,
      botStatus: this.status,
      msaCode: this.msaCodeInfo,
      autoReconnect: this.config.autoReconnect !== false,
      antiAfk: this.config.antiAfk !== false,
      periodicReconnect: this.config.periodicReconnect !== false,
      periodicReconnectIntervalMin: this.config.periodicReconnectIntervalMin || 30,
      nextPeriodicReconnect: this.nextPeriodicReconnectTimestamp,
      mcConfig: {
        host: this.config.host,
        port: this.config.port,
        username: this.config.username,
        version: this.config.version || 'Automatisch',
      },
      fullConfig: this.getFullConfig(),
    };
  }

  getFullConfig() {
    return {
      id: this.id,
      name: this.name,
      ownerUsername: this.ownerUsername,
      host: this.config.host,
      port: this.config.port,
      username: this.config.username,
      auth: 'microsoft',
      version: this.config.version || '',
      reconnectDelaySec: this.config.reconnectDelaySec ?? 10,
      onJoinDelaySec: this.config.onJoinDelaySec ?? 3,
      onJoinCommands: Array.isArray(this.config.onJoinCommands) ? this.config.onJoinCommands.join(', ') : '',
      enablePhysics: this.config.enablePhysics !== false,
      antiAfk: this.config.antiAfk !== false,
      autoReconnect: this.config.autoReconnect !== false,
      periodicReconnect: this.config.periodicReconnect !== false,
      periodicReconnectIntervalMin: this.config.periodicReconnectIntervalMin || 30,
    };
  }

  stopPeriodicReconnect() {
    if (this.periodicReconnectTimer) {
      clearTimeout(this.periodicReconnectTimer);
      this.periodicReconnectTimer = null;
    }
    this.nextPeriodicReconnectTimestamp = null;
  }

  startPeriodicReconnect(forceRestart = false) {
    if (this.config.periodicReconnect === false) {
      this.stopPeriodicReconnect();
      return;
    }
    if (!this.bot || this.status !== 'online') {
      this.stopPeriodicReconnect();
      return;
    }

    if (this.periodicReconnectTimer && !forceRestart) {
      return;
    }

    this.stopPeriodicReconnect();

    const intervalMin = this.config.periodicReconnectIntervalMin || 30;
    const intervalMs = intervalMin * 60 * 1000;
    this.nextPeriodicReconnectTimestamp = Date.now() + intervalMs;

    const targetTime = new Date(this.nextPeriodicReconnectTimestamp).toLocaleTimeString('de-DE');
    this.addLog('system', `⏱️ Periodischer Reconnect aktiv: Neuer Reconnect in ${intervalMin} Minuten geplant (${targetTime}).`);
    this.broadcastState();

    this.periodicReconnectTimer = setTimeout(() => {
      if (this.bot && this.status === 'online') {
        this.addLog('system', `🔄 Geplanter ${intervalMin}-Minuten-Reconnect wird ausgeführt...`);
        this.stopPeriodicReconnect();
        try {
          this.bot.quit();
        } catch (e) {}
        this.bot = null;
        this.status = 'reconnecting';
        this.broadcastState();
        setTimeout(() => {
          this.start();
        }, 3000);
      }
    }, intervalMs);
  }

  stopTickEndLoop() {
    if (this.tickEndTimer) {
      clearInterval(this.tickEndTimer);
      this.tickEndTimer = null;
    }
  }

  startTickEndLoop() {
    this.stopTickEndLoop();
    this.tickEndTimer = setInterval(() => {
      if (this.bot && this.bot._client && this.bot._client.state === 'play') {
        try {
          if (typeof this.bot._client.write === 'function') {
            this.bot._client.write('tick_end', {});
          }
        } catch (err) {}
      }
    }, 50);
  }

  stopAntiAfkLoop() {
    if (this.antiAfkTimer) {
      clearInterval(this.antiAfkTimer);
      this.antiAfkTimer = null;
    }
  }

  startAntiAfkLoop() {
    this.stopAntiAfkLoop();
    if (this.config.antiAfk === false) return;

    // Alle 45 Sekunden den Arm schwingen (resettet Inaktivitäts-/AFK-Timer auf Paper/Spigot)
    this.antiAfkTimer = setInterval(() => {
      if (this.bot && this.status === 'online') {
        try {
          if (typeof this.bot.swingArm === 'function') {
            this.bot.swingArm('right');
          }
        } catch (e) {}
      }
    }, 45000);
  }

  start() {
    if (this.bot) {
      try {
        this.bot.quit();
      } catch (e) {}
      this.bot = null;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.connectionWatchdog) {
      clearTimeout(this.connectionWatchdog);
      this.connectionWatchdog = null;
    }

    this.status = 'connecting';
    this.broadcastState();
    this.addLog('system', `Verbinde mit ${this.config.host}:${this.config.port} als ${this.config.username} (Microsoft-Account)...`);

    // Watchdog Timeout (35 Sekunden für Server-Handshake; wird bei MSA-Login pausiert)
    this.connectionWatchdog = setTimeout(() => {
      if (this.status === 'connecting' && !this.msaCodeInfo) {
        this.addLog('error', '⚠️ Verbindungs-Timeout (35s)! Server lässt den Bot nicht in die Welt.');
        this.scheduleReconnect();
      }
    }, 35000);

    const botOptions = {
      host: this.config.host,
      port: parseInt(this.config.port, 10) || 25565,
      username: this.config.username,
      auth: 'microsoft',
      profilesFolder: this.profileAuthFolder,
      onMsaCode: data => {
        // 1. 35s Watchdog sofort abbrechen – der Benutzer benötigt Zeit für den Login!
        if (this.connectionWatchdog) {
          clearTimeout(this.connectionWatchdog);
          this.connectionWatchdog = null;
        }

        const uri = data.verification_uri || 'https://microsoft.com/devicelogin';
        const code = data.user_code;
        const expiresInSec = data.expires_in || 900;

        this.msaCodeInfo = {
          code,
          uri,
          expiresAt: Date.now() + expiresInSec * 1000,
        };

        this.addLog(
          'warn',
          `🔑 Microsoft-Login erforderlich für "${this.config.username}"! Öffne ${uri} und gib folgenden Code ein: ${code} (Gültig für ${Math.round(expiresInSec / 60)} Minuten)`
        );
        console.log(`[AUTH ${this.name}] Microsoft Device Code: ${code} | URL: ${uri}`);
        this.broadcastState();

        // 15-Minuten Timeout setzen, damit nicht vorzeitig abgebrochen wird
        this.connectionWatchdog = setTimeout(() => {
          if (this.status === 'connecting' && this.msaCodeInfo) {
            this.addLog('error', `⏱️ Microsoft-Login Code für "${this.config.username}" ist abgelaufen. Bitte erneut auf "Jetzt Verbinden" klicken.`);
            this.msaCodeInfo = null;
            this.stop();
          }
        }, expiresInSec * 1000);
      },
    };

    if (this.config.version && this.config.version.trim() !== '') {
      botOptions.version = this.config.version.trim();
    }

    try {
      this.bot = mineflayer.createBot(botOptions);
    } catch (err) {
      this.addLog('error', `Fehler beim Erstellen der Bot-Instanz: ${err.message}`);
      this.scheduleReconnect();
      return;
    }

    // 2-Stufiger Ressourcenpaket-Handshake
    if (this.bot._client) {
      const handleResourcePack = (data, clientRef) => {
        const packUuid = data && data.uuid ? data.uuid : '00000000-0000-0000-0000-000000000000';
        try {
          clientRef.write('resource_pack_receive', { uuid: packUuid, result: 3 });
        } catch (e) {}
        setTimeout(() => {
          try {
            clientRef.write('resource_pack_receive', { uuid: packUuid, result: 0 });
          } catch (e) {}
        }, 150);
      };

      this.bot._client.on('resource_pack_send', data => handleResourcePack(data, this.bot._client));
      this.bot._client.on('add_resource_pack', data => handleResourcePack(data, this.bot._client));

      // Velocity Unterserver-Transfer: State-Transition abfangen
      this.bot._client.on('start_configuration', () => {
        this.addLog('system', `Wechsle Unterserver / Konfigurations-Phase...`);
        this.stopTickEndLoop();
      });

      this.bot._client.on('state', newState => {
        if (newState === 'play') {
          this.startTickEndLoop();
        } else {
          this.stopTickEndLoop();
        }
      });
    }

    this.bot.once('login', () => {
      this.addLog('system', `Minecraft-Login akzeptiert (Protokoll: ${this.bot.version || 'Auto'})! Warte auf Welt-Download...`);
    });

    let hasExecutedJoinCommands = false;
    this.bot.on('spawn', () => {
      if (this.connectionWatchdog) {
        clearTimeout(this.connectionWatchdog);
        this.connectionWatchdog = null;
      }
      this.msaCodeInfo = null;

      if (this.bot) {
        this.bot.physicsEnabled = this.config.enablePhysics !== false;
      }

      this.startTickEndLoop();
      this.startAntiAfkLoop();
      this.status = 'online';
      this.startPeriodicReconnect();
      this.broadcastState();
      this.addLog('success', `Spieler in Welt gespawnt (${this.config.host})!`);

      const joinCmds = Array.isArray(this.config.onJoinCommands) ? this.config.onJoinCommands : [];
      const delay = (this.config.onJoinDelaySec || 3) * 1000;

      if (!hasExecutedJoinCommands && joinCmds.length > 0) {
        hasExecutedJoinCommands = true;
        setTimeout(() => {
          if (this.bot && this.status === 'online') {
            joinCmds.forEach(cmd => {
              this.addLog('system', `Führe On-Join-Befehl aus: ${cmd}`);
              this.chat(cmd);
            });
          }
        }, delay);
      }
    });

    // Chat-Nachrichten deduplizieren
    this.bot.on('message', jsonMsg => {
      const plainText = parseMinecraftChat(jsonMsg);
      if (!plainText) return;

      const now = Date.now();
      if (plainText === this.lastLoggedChat && now - this.lastLoggedTime < 600) {
        return;
      }
      this.lastLoggedChat = plainText;
      this.lastLoggedTime = now;
      this.addLog('chat', plainText);
    });

    this.bot.on('title', text => {
      const plain = parseMinecraftChat(text);
      if (plain) this.addLog('system', `[TITEL] ${plain}`);
    });

    this.bot.on('kicked', (reason, loggedIn) => {
      this.stopTickEndLoop();
      this.stopAntiAfkLoop();
      this.stopPeriodicReconnect();
      if (this.connectionWatchdog) {
        clearTimeout(this.connectionWatchdog);
        this.connectionWatchdog = null;
      }
      this.msaCodeInfo = null;
      const plainReason = parseMinecraftChat(reason);
      this.addLog('warn', `Vom Server gekickt (${loggedIn ? 'im Spiel' : 'Login-Phase'}): ${plainReason || 'Kein Grund angegeben'}`);
      console.log(`[KICK ${this.name}] Grund:`, plainReason || reason);
      this.scheduleReconnect();
    });

    this.bot.on('end', reason => {
      this.stopTickEndLoop();
      this.stopAntiAfkLoop();
      this.stopPeriodicReconnect();
      if (this.connectionWatchdog) {
        clearTimeout(this.connectionWatchdog);
        this.connectionWatchdog = null;
      }
      this.msaCodeInfo = null;
      this.addLog('warn', `Verbindung zum Server getrennt: ${reason || 'Verbindung geschlossen'}`);
      console.log(`[END ${this.name}] Grund:`, reason);
      this.scheduleReconnect();
    });

    this.bot.on('error', err => {
      this.addLog('error', `Bot-Fehler: ${err.message}`);
    });
  }

  scheduleReconnect() {
    this.stopTickEndLoop();
    this.stopAntiAfkLoop();
    this.stopPeriodicReconnect();
    if (this.connectionWatchdog) {
      clearTimeout(this.connectionWatchdog);
      this.connectionWatchdog = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.bot) {
      try {
        this.bot.quit();
      } catch (e) {}
      this.bot = null;
    }

    const autoReconn = this.config.autoReconnect !== false;
    const delay = (this.config.reconnectDelaySec || 10) * 1000;

    if (autoReconn) {
      this.status = 'reconnecting';
      this.broadcastState();
      this.addLog('system', `Auto-Rejoin aktiv. Neuer Verbindungsversuch in ${delay / 1000} Sekunden...`);
      this.reconnectTimer = setTimeout(() => {
        this.start();
      }, delay);
    } else {
      this.status = 'disconnected';
      this.broadcastState();
      this.addLog('info', 'Auto-Rejoin ist deaktiviert. Bot bleibt getrennt.');
    }
  }

  stop() {
    this.stopTickEndLoop();
    this.stopAntiAfkLoop();
    this.stopPeriodicReconnect();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.connectionWatchdog) {
      clearTimeout(this.connectionWatchdog);
      this.connectionWatchdog = null;
    }
    if (this.bot) {
      try {
        this.bot.quit();
      } catch (e) {}
      this.bot = null;
    }
    this.msaCodeInfo = null;
    this.status = 'disconnected';
    this.broadcastState();
    this.addLog('info', 'Bot wurde manuell gestoppt.');
  }

  chat(message) {
    if (!message) return;
    if (this.bot && this.status === 'online') {
      try {
        this.bot.chat(message.trim());
        this.addLog('command', `Gesendet: ${message.trim()}`);
      } catch (err) {
        this.addLog('error', `Fehler beim Senden: ${err.message}`);
      }
    } else {
      this.addLog('warn', `Befehl konnte nicht gesendet werden: Bot ist nicht online.`);
    }
  }

  jump() {
    if (this.bot && this.status === 'online') {
      try {
        this.bot.setControlState('jump', true);
        setTimeout(() => {
          if (this.bot) this.bot.setControlState('jump', false);
        }, 350);
        this.addLog('system', '🦘 Sprung ausgeführt.');
      } catch (err) {
        this.addLog('error', `Fehler beim Springen: ${err.message}`);
      }
    }
  }

  sneak(shouldSneak) {
    this.isSneaking = !!shouldSneak;
    if (this.bot && this.status === 'online') {
      try {
        this.bot.setControlState('sneak', this.isSneaking);
        this.addLog('system', `👟 Sneak ${this.isSneaking ? 'aktiviert' : 'deaktiviert'}.`);
      } catch (err) {
        this.addLog('error', `Fehler bei Sneak: ${err.message}`);
      }
    }
  }

  toggleAutoReconnect(enabled) {
    this.config.autoReconnect = !!enabled;
    this.addLog('system', `Auto-Rejoin wurde ${this.config.autoReconnect ? 'AKTIVIERT' : 'DEAKTIVIERT'}.`);
    if (!this.config.autoReconnect && this.status === 'reconnecting') {
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
      this.status = 'disconnected';
    } else if (this.config.autoReconnect && this.status === 'disconnected' && !this.bot) {
      this.scheduleReconnect();
    }
    this.broadcastState();
  }

  togglePeriodicReconnect(enabled) {
    this.config.periodicReconnect = !!enabled;
    this.addLog('system', `Periodischer 30-Minuten-Reconnect wurde ${this.config.periodicReconnect ? 'AKTIVIERT' : 'DEAKTIVIERT'}.`);
    if (this.config.periodicReconnect && this.status === 'online') {
      this.startPeriodicReconnect(true);
    } else {
      this.stopPeriodicReconnect();
    }
    this.broadcastState();
  }

  updateConfig(newConfig) {
    if (newConfig.name) this.name = newConfig.name;
    if (newConfig.host) this.config.host = newConfig.host;
    if (newConfig.port) this.config.port = parseInt(newConfig.port, 10) || 25565;
    if (newConfig.username) this.config.username = newConfig.username;
    if (newConfig.version !== undefined) this.config.version = newConfig.version;
    if (newConfig.reconnectDelaySec !== undefined) this.config.reconnectDelaySec = parseInt(newConfig.reconnectDelaySec, 10) || 10;
    if (newConfig.onJoinCommands !== undefined) this.config.onJoinCommands = newConfig.onJoinCommands;
    if (newConfig.onJoinDelaySec !== undefined) this.config.onJoinDelaySec = parseInt(newConfig.onJoinDelaySec, 10) || 3;
    if (typeof newConfig.enablePhysics === 'boolean') this.config.enablePhysics = newConfig.enablePhysics;
    if (typeof newConfig.antiAfk === 'boolean') {
      this.config.antiAfk = newConfig.antiAfk;
      if (this.config.antiAfk && this.status === 'online') {
        this.startAntiAfkLoop();
      } else if (!this.config.antiAfk) {
        this.stopAntiAfkLoop();
      }
    }
    if (typeof newConfig.periodicReconnect === 'boolean') this.config.periodicReconnect = newConfig.periodicReconnect;
    if (newConfig.periodicReconnectIntervalMin !== undefined) {
      this.config.periodicReconnectIntervalMin = Math.max(1, parseInt(newConfig.periodicReconnectIntervalMin, 10) || 30);
    }
    if (newConfig.ownerUsername) this.ownerUsername = newConfig.ownerUsername;

    if (this.config.periodicReconnect && this.status === 'online') {
      this.startPeriodicReconnect(true);
    } else if (!this.config.periodicReconnect) {
      this.stopPeriodicReconnect();
    }

    this.broadcastState();
  }
}

// -------------------------------------------------------------
// 4. Bot-Manager & Multi-Bot Registry
// -------------------------------------------------------------
class BotManager {
  constructor() {
    this.botInstances = new Map();
  }

  init(broadcastFn) {
    this.broadcastFn = broadcastFn;
    const configs = loadBotConfigs();
    configs.forEach(cfg => {
      const instance = new BotInstance(cfg, (action, botId, data) => {
        this.broadcastFn(action, botId, data);
      });
      this.botInstances.set(cfg.id, instance);
    });

    console.log(`[BOTS] ${this.botInstances.size} Bot-Profil(e) geladen.`);

    // Alle Bots mit autoReconnect beim Start hochfahren
    this.botInstances.forEach(bot => {
      if (bot.config.autoReconnect !== false) {
        bot.start();
      }
    });
  }

  getBotsForUser(user) {
    if (!user) return [];
    const list = [];
    this.botInstances.forEach(b => {
      if (user.role === 'admin' || b.ownerUsername.toLowerCase() === user.username.toLowerCase()) {
        list.push({
          id: b.id,
          name: b.name,
          ownerUsername: b.ownerUsername,
          host: b.config.host,
          port: b.config.port,
          username: b.config.username,
          status: b.status,
        });
      }
    });
    return list;
  }

  getBot(id, user) {
    const bot = this.botInstances.get(id);
    if (!bot) return null;
    if (user.role === 'admin' || bot.ownerUsername.toLowerCase() === user.username.toLowerCase()) {
      return bot;
    }
    return null;
  }

  createBot(data, creatorUser) {
    const id = 'bot_' + crypto.randomBytes(4).toString('hex');
    const owner = creatorUser.role === 'admin' && data.ownerUsername ? data.ownerUsername : creatorUser.username;

    const newCfg = {
      ...DEFAULT_BOT_SETTINGS,
      ...data,
      id,
      ownerUsername: owner,
      createdAt: new Date().toISOString(),
    };

    const instance = new BotInstance(newCfg, (action, botId, payload) => {
      this.broadcastFn(action, botId, payload);
    });

    this.botInstances.set(id, instance);
    this.persistAll();

    if (newCfg.autoReconnect !== false) {
      instance.start();
    }

    return instance;
  }

  deleteBot(id, user) {
    const bot = this.getBot(id, user);
    if (!bot) return false;

    bot.stop();
    this.botInstances.delete(id);
    this.persistAll();

    // Cache-Verzeichnis aufräumen
    try {
      if (fs.existsSync(bot.profileAuthFolder)) {
        fs.rmSync(bot.profileAuthFolder, { recursive: true, force: true });
      }
    } catch (e) {}

    return true;
  }

  persistAll() {
    const all = [];
    this.botInstances.forEach(b => {
      all.push({
        id: b.id,
        name: b.name,
        ownerUsername: b.ownerUsername,
        host: b.config.host,
        port: b.config.port,
        username: b.config.username,
        version: b.config.version,
        autoReconnect: b.config.autoReconnect !== false,
        reconnectDelaySec: b.config.reconnectDelaySec ?? 10,
        onJoinCommands: b.config.onJoinCommands,
        onJoinDelaySec: b.config.onJoinDelaySec ?? 3,
        enablePhysics: b.config.enablePhysics !== false,
        antiAfk: b.config.antiAfk !== false,
        periodicReconnect: b.config.periodicReconnect !== false,
        periodicReconnectIntervalMin: b.config.periodicReconnectIntervalMin || 30,
      });
    });
    saveBotConfigs(all);
  }
}

const botManager = new BotManager();

// -------------------------------------------------------------
// 5. Express & HTTP Server Setup
// -------------------------------------------------------------
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Auth Middleware für REST
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  let token = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({ error: 'Nicht authentifiziert' });
  }

  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ error: 'Ungültige oder abgelaufene Sitzung' });
  }

  req.user = payload;
  next();
}

function adminOnly(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Zugriff verweigert: Administrator-Rechte erforderlich' });
  }
  next();
}

// -------------------------------------------------------------
// 6. REST API Endpunkte
// -------------------------------------------------------------

// Login
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Benutzername und Passwort sind erforderlich' });
  }

  const user = getUserByUsername(username);
  if (!user || !verifyPassword(password, user.salt, user.hash)) {
    return res.status(401).json({ error: 'Ungültige Anmeldedaten' });
  }

  const token = createToken({
    id: user.id,
    username: user.username,
    role: user.role,
  });

  res.json({
    success: true,
    token,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
    },
  });
});

// Eigene Benutzerdaten & zugehörige Bots abrufen
app.get('/api/auth/me', authMiddleware, (req, res) => {
  const user = getUserByUsername(req.user.username);
  if (!user) return res.status(404).json({ error: 'Benutzer nicht gefunden' });

  const bots = botManager.getBotsForUser(req.user);
  res.json({
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
    },
    bots,
  });
});

// Eigenes Passwort ändern
app.post('/api/auth/change-password', authMiddleware, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!newPassword || newPassword.length < 4) {
    return res.status(400).json({ error: 'Das neue Passwort muss mindestens 4 Zeichen lang sein' });
  }

  const user = getUserByUsername(req.user.username);
  if (!user || !verifyPassword(currentPassword, user.salt, user.hash)) {
    return res.status(400).json({ error: 'Das aktuelle Passwort ist nicht korrekt' });
  }

  const { salt, hash } = hashPassword(newPassword);
  user.salt = salt;
  user.hash = hash;
  saveUsers(usersList);

  res.json({ success: true, message: 'Passwort erfolgreich geändert' });
});

// --- ADMIN ENDPUNKTE ---

// Alle Benutzer auflisten
app.get('/api/admin/users', authMiddleware, adminOnly, (req, res) => {
  const list = usersList.map(u => {
    // Zählen, wie viele Bots diesem Nutzer gehören
    let botCount = 0;
    botManager.botInstances.forEach(b => {
      if (b.ownerUsername.toLowerCase() === u.username.toLowerCase()) botCount++;
    });
    return {
      id: u.id,
      username: u.username,
      role: u.role,
      createdAt: u.createdAt,
      botCount,
    };
  });
  res.json({ success: true, users: list });
});

// Neuen Benutzer anlegen
app.post('/api/admin/users', authMiddleware, adminOnly, (req, res) => {
  const { username, password, role } = req.body;
  const cleanName = (username || '').trim();

  if (!cleanName || cleanName.length < 3) {
    return res.status(400).json({ error: 'Benutzername muss mindestens 3 Zeichen lang sein' });
  }
  if (!password || password.length < 4) {
    return res.status(400).json({ error: 'Passwort muss mindestens 4 Zeichen lang sein' });
  }

  if (getUserByUsername(cleanName)) {
    return res.status(400).json({ error: 'Ein Benutzer mit diesem Namen existiert bereits' });
  }

  const { salt, hash } = hashPassword(password);
  const newUser = {
    id: 'u_' + crypto.randomBytes(4).toString('hex'),
    username: cleanName,
    salt,
    hash,
    role: role === 'admin' ? 'admin' : 'user',
    createdAt: new Date().toISOString(),
  };

  usersList.push(newUser);
  saveUsers(usersList);

  res.json({
    success: true,
    user: {
      id: newUser.id,
      username: newUser.username,
      role: newUser.role,
      createdAt: newUser.createdAt,
    },
  });
});

// Benutzer löschen
app.delete('/api/admin/users/:username', authMiddleware, adminOnly, (req, res) => {
  const targetName = req.params.username;
  if (targetName.toLowerCase() === req.user.username.toLowerCase()) {
    return res.status(400).json({ error: 'Du kannst deinen eigenen Admin-Account nicht löschen' });
  }

  const idx = usersList.findIndex(u => u.username.toLowerCase() === targetName.toLowerCase());
  if (idx === -1) {
    return res.status(404).json({ error: 'Benutzer nicht gefunden' });
  }

  usersList.splice(idx, 1);
  saveUsers(usersList);

  res.json({ success: true, message: `Benutzer "${targetName}" wurde gelöscht` });
});

// Admin setzt Passwort für Benutzer zurück
app.post('/api/admin/users/:username/password', authMiddleware, adminOnly, (req, res) => {
  const targetName = req.params.username;
  const { newPassword } = req.body;

  if (!newPassword || newPassword.length < 4) {
    return res.status(400).json({ error: 'Das Passwort muss mindestens 4 Zeichen lang sein' });
  }

  const user = getUserByUsername(targetName);
  if (!user) return res.status(404).json({ error: 'Benutzer nicht gefunden' });

  const { salt, hash } = hashPassword(newPassword);
  user.salt = salt;
  user.hash = hash;
  saveUsers(usersList);

  res.json({ success: true, message: `Passwort für "${targetName}" erfolgreich aktualisiert` });
});

// --- BOT PROFIL ENDPUNKTE ---

// Alle für den Benutzer sichtbaren Bots auflisten
app.get('/api/bots', authMiddleware, (req, res) => {
  res.json({ success: true, bots: botManager.getBotsForUser(req.user) });
});

// Neues Bot-Profil anlegen
app.post('/api/bots', authMiddleware, (req, res) => {
  const { name, ownerUsername, host, port, username, version, onJoinCommands } = req.body;

  if (!host || !username) {
    return res.status(400).json({ error: 'Server-Host und Minecraft-Name sind Pflichtfelder' });
  }

  let finalOwner = req.user.username;
  if (req.user.role === 'admin' && ownerUsername) {
    if (!getUserByUsername(ownerUsername)) {
      return res.status(400).json({ error: `Zugewiesener Benutzer "${ownerUsername}" existiert nicht` });
    }
    finalOwner = ownerUsername;
  }

  const commandsArray = Array.isArray(onJoinCommands)
    ? onJoinCommands
    : typeof onJoinCommands === 'string'
    ? onJoinCommands
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
    : ['/server cb1'];

  const botInstance = botManager.createBot(
    {
      name: name || `Bot (${username})`,
      ownerUsername: finalOwner,
      host: host.trim(),
      port: parseInt(port, 10) || 25565,
      username: username.trim(),
      version: version ? version.trim() : '',
      onJoinCommands: commandsArray,
      autoReconnect: req.body.autoReconnect !== false,
      periodicReconnect: req.body.periodicReconnect !== false,
      periodicReconnectIntervalMin: parseInt(req.body.periodicReconnectIntervalMin, 10) || 30,
    },
    req.user
  );

  res.json({ success: true, bot: botInstance.getState() });
});

// Einzelnes Bot-Profil löschen
app.delete('/api/bots/:id', authMiddleware, (req, res) => {
  const success = botManager.deleteBot(req.params.id, req.user);
  if (!success) {
    return res.status(404).json({ error: 'Bot-Profil nicht gefunden oder keine Berechtigung' });
  }
  res.json({ success: true, message: 'Bot-Profil erfolgreich gelöscht' });
});

// Einstellungen eines Bots aktualisieren
app.post('/api/bots/:id/config', authMiddleware, (req, res) => {
  const bot = botManager.getBot(req.params.id, req.user);
  if (!bot) return res.status(404).json({ error: 'Bot nicht gefunden' });

  let joinCommands = bot.config.onJoinCommands;
  if (req.body.onJoinCommandsInput !== undefined) {
    joinCommands = req.body.onJoinCommandsInput
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
  }

  bot.updateConfig({
    name: req.body.name,
    host: req.body.host,
    port: req.body.port,
    username: req.body.username,
    version: req.body.version,
    reconnectDelaySec: req.body.reconnectDelaySec,
    onJoinCommands: joinCommands,
    onJoinDelaySec: req.body.onJoinDelaySec,
    enablePhysics: req.body.physics !== undefined ? req.body.physics : req.body.enablePhysics,
    antiAfk: req.body.antiAfk !== undefined ? req.body.antiAfk : undefined,
    periodicReconnect: req.body.periodicReconnect,
    periodicReconnectIntervalMin: req.body.periodicReconnectIntervalMin,
    ownerUsername: req.user.role === 'admin' && req.body.ownerUsername ? req.body.ownerUsername : undefined,
  });

  botManager.persistAll();
  res.json({ success: true, bot: bot.getState() });
});

// Aktionen auf einem Bot ausführen (connect, disconnect, jump, sneak, command, etc.)
app.post('/api/bots/:id/action/:action', authMiddleware, (req, res) => {
  const bot = botManager.getBot(req.params.id, req.user);
  if (!bot) return res.status(404).json({ error: 'Bot nicht gefunden' });

  const { action } = req.params;
  switch (action) {
    case 'connect':
      bot.start();
      break;
    case 'disconnect':
      bot.stop();
      break;
    case 'jump':
      bot.jump();
      break;
    case 'sneak':
      bot.sneak(req.body.sneak);
      break;
    case 'command':
      bot.chat(req.body.command);
      break;
    case 'autoreconnect':
      bot.toggleAutoReconnect(req.body.enabled);
      botManager.persistAll();
      break;
    case 'periodic-reconnect':
      bot.togglePeriodicReconnect(req.body.enabled);
      botManager.persistAll();
      break;
    case 'clear-auth-cache':
      bot.stop();
      try {
        if (fs.existsSync(bot.profileAuthFolder)) {
          fs.rmSync(bot.profileAuthFolder, { recursive: true, force: true });
          fs.mkdirSync(bot.profileAuthFolder, { recursive: true });
        }
        bot.addLog('system', '🧹 Microsoft Auth-Cache erfolgreich geleert. Beim nächsten Verbinden wird ein neuer Code angefordert.');
      } catch (e) {
        bot.addLog('error', `Fehler beim Leeren des Auth-Caches: ${e.message}`);
      }
      break;
    default:
      return res.status(400).json({ error: `Unbekannte Aktion: ${action}` });
  }

  res.json({ success: true });
});

// -------------------------------------------------------------
// 7. WebSocket Live-Synchronisation
// -------------------------------------------------------------
function broadcastToAuthorizedClients(action, botId, data) {
  const bot = botManager.botInstances.get(botId);
  if (!bot) return;

  const msgStr = JSON.stringify({ action, botId, data });

  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN && client.user) {
      const isAllowed = client.user.role === 'admin' || bot.ownerUsername.toLowerCase() === client.user.username.toLowerCase();
      if (!isAllowed) return;

      // Logs nur an Clients senden, die diesen Bot gerade aktiv im Dashboard geöffnet haben
      if (action === 'log') {
        if (client.activeBotId === botId) {
          client.send(msgStr);
        }
      } else {
        client.send(msgStr);
      }
    }
  });
}

wss.on('connection', (ws, req) => {
  // Token aus URL query parsen (?token=...)
  const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const token = urlObj.searchParams.get('token');
  const user = verifyToken(token);

  if (!user) {
    ws.send(JSON.stringify({ action: 'auth_error', message: 'Ungültiges oder fehlendes Token' }));
    ws.close();
    return;
  }

  ws.user = user;
  const availableBots = botManager.getBotsForUser(user);
  const firstBotId = availableBots.length > 0 ? availableBots[0].id : null;
  ws.activeBotId = firstBotId;

  const activeBot = firstBotId ? botManager.botInstances.get(firstBotId) : null;

  // Init-Paket senden
  ws.send(
    JSON.stringify({
      action: 'init',
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
      },
      bots: availableBots,
      activeBotId: firstBotId,
      botData: activeBot
        ? {
            ...activeBot.getState(),
            logs: activeBot.logHistory,
          }
        : null,
    })
  );

  ws.on('message', rawMsg => {
    try {
      const msg = JSON.parse(rawMsg);
      const targetBotId = msg.botId || ws.activeBotId;
      const targetBot = targetBotId ? botManager.getBot(targetBotId, ws.user) : null;

      if (msg.action === 'select_bot') {
        const reqBot = botManager.getBot(msg.botId, ws.user);
        if (reqBot) {
          ws.activeBotId = reqBot.id;
          ws.send(
            JSON.stringify({
              action: 'bot_selected',
              botId: reqBot.id,
              data: {
                ...reqBot.getState(),
                logs: reqBot.logHistory,
              },
            })
          );
        }
      } else if (msg.action === 'toggle_autoreconnect' && targetBot) {
        targetBot.toggleAutoReconnect(msg.value);
        botManager.persistAll();
      } else if (msg.action === 'toggle_periodic_reconnect' && targetBot) {
        targetBot.togglePeriodicReconnect(msg.value);
        botManager.persistAll();
      } else if (msg.action === 'connect' && targetBot) {
        targetBot.start();
      } else if (msg.action === 'disconnect' && targetBot) {
        targetBot.stop();
      } else if (msg.action === 'command' && targetBot && msg.command) {
        targetBot.chat(msg.command);
      } else if (msg.action === 'jump' && targetBot) {
        targetBot.jump();
      } else if (msg.action === 'sneak' && targetBot) {
        targetBot.sneak(msg.value);
      }
    } catch (e) {
      console.error('Fehler bei WS-Nachricht:', e.message);
    }
  });
});

// -------------------------------------------------------------
// 8. Server-Start & Bot-Initialisierung
// -------------------------------------------------------------
server.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(` Minecraft Multi-User Manager läuft auf Port ${PORT}`);
  console.log(` Web-Zugriff: http://localhost:${PORT}`);
  console.log(`====================================================`);

  // Bots laden und starten
  botManager.init((action, botId, data) => {
    broadcastToAuthorizedClients(action, botId, data);
  });
});
