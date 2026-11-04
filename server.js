require('dotenv').config();
const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const WebSocket = require('ws');
const mineflayer = require('mineflayer');

// Process safety (prevents unexpected stream errors from crashing Node.js)
process.on('uncaughtException', err => {
  console.error('[UNCAUGHT EXCEPTION]', err);
});
process.on('unhandledRejection', reason => {
  console.error('[UNHANDLED REJECTION]', reason);
});

// Configuration & Ports
const PORT = process.env.WEB_PORT || 3000;
const JWT_SECRET = process.env.WEB_SECRET || 'mc_bot_secret_' + (process.env.WEB_PASSWORD || 'secret123');

// File paths
const ADMIN_FILE = path.join(__dirname, 'admin.json');
const USERS_FILE = path.join(__dirname, 'users.json');
const BOTS_FILE = path.join(__dirname, 'bots.json');
const LEGACY_CONFIG_FILE = path.join(__dirname, 'config.json');
const AUTH_CACHE_BASE = path.join(__dirname, 'auth-cache');

if (!fs.existsSync(AUTH_CACHE_BASE)) {
  fs.mkdirSync(AUTH_CACHE_BASE, { recursive: true });
}

// -------------------------------------------------------------
// 1. Admin Authentication & Cryptography
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
  // Token is valid for 14 days
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

function loadAdmin() {
  if (fs.existsSync(ADMIN_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(ADMIN_FILE, 'utf8'));
      if (data && data.username && data.hash && data.salt) return data;
    } catch (e) {
      console.error('Error reading admin.json:', e.message);
    }
  }

  // Migration from existing users.json if present
  if (fs.existsSync(USERS_FILE)) {
    try {
      const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
      if (Array.isArray(users)) {
        const found = users.find(u => u.role === 'admin') || users[0];
        if (found && found.salt && found.hash) {
          const migrated = {
            username: found.username || 'admin',
            salt: found.salt,
            hash: found.hash,
            updatedAt: found.createdAt || new Date().toISOString(),
          };
          saveAdmin(migrated);
          console.log(`[AUTH] Admin account migrated from users.json to admin.json: "${migrated.username}"`);
          return migrated;
        }
      }
    } catch (_) {}
  }

  // Initial admin from .env or default
  const username = process.env.WEB_USER || 'admin';
  const password = process.env.WEB_PASSWORD || 'admin123';
  const { salt, hash } = hashPassword(password);

  const adminData = {
    username,
    salt,
    hash,
    updatedAt: new Date().toISOString(),
  };

  saveAdmin(adminData);
  console.log(`[AUTH] Admin account initialized: username "${username}"`);
  return adminData;
}

function saveAdmin(data) {
  try {
    fs.writeFileSync(ADMIN_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error('Error saving admin.json:', e.message);
  }
}

let adminAccount = loadAdmin();

// -------------------------------------------------------------
// 2. Minecraft Bot Profiles & Data Persistence
// -------------------------------------------------------------
const DEFAULT_BOT_SETTINGS = {
  name: 'Bot 1',
  host: '',
  port: 25565,
  username: '',
  version: '',
  autoReconnect: false,
  reconnectDelaySec: 10,
  onJoinCommands: [],
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
      if (Array.isArray(data)) return data;
    } catch (e) {
      console.error('Error reading bots.json:', e.message);
    }
  }

  // On initial startup, no default bot profile is created
  return [];
}

function saveBotConfigs(bots) {
  try {
    fs.writeFileSync(BOTS_FILE, JSON.stringify(bots, null, 2), 'utf8');
  } catch (e) {
    console.error('Error saving bots.json:', e.message);
  }
}

// Helper: parse Minecraft chat components and kick messages cleanly into plain text
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
// 3. BotInstance Class (Mineflayer Encapsulation)
// -------------------------------------------------------------
class BotInstance {
  constructor(config, onBroadcast) {
    this.config = { ...config };
    this.id = config.id;
    this.name = config.name || `Bot (${this.config.username})`;
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

    // Isolated Microsoft token cache folder per bot profile
    this.profileAuthFolder = path.join(AUTH_CACHE_BASE, this.id);
    if (!fs.existsSync(this.profileAuthFolder)) {
      fs.mkdirSync(this.profileAuthFolder, { recursive: true });
    }
  }

  addLog(type, message) {
    const timeStr = new Date().toLocaleTimeString('en-US');
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
        version: this.config.version || 'Auto',
      },
      fullConfig: this.getFullConfig(),
    };
  }

  getFullConfig() {
    return {
      id: this.id,
      name: this.name,
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

    const targetTime = new Date(this.nextPeriodicReconnectTimestamp).toLocaleTimeString('en-US');
    this.addLog('system', `⏱️ Periodic reconnect active: Next reconnect scheduled in ${intervalMin} minutes (${targetTime}).`);
    this.broadcastState();

    this.periodicReconnectTimer = setTimeout(() => {
      if (this.bot && this.status === 'online') {
        this.addLog('system', `🔄 Scheduled ${intervalMin}-minute periodic reconnect executing...`);
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

    // Swing arm every 45 seconds (resets inactivity/AFK timer on Paper/Spigot servers)
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

    if (!this.config.host || !this.config.username) {
      this.status = 'disconnected';
      this.broadcastState();
      this.addLog('info', 'Please configure server address and Minecraft player name in Bot Settings.');
      return;
    }

    this.status = 'connecting';
    this.broadcastState();
    this.addLog('system', `Connecting to ${this.config.host}:${this.config.port} as ${this.config.username} (Microsoft Account)...`);

    // Watchdog Timeout (35 seconds for server handshake; paused during MSA login)
    this.connectionWatchdog = setTimeout(() => {
      if (this.status === 'connecting' && !this.msaCodeInfo) {
        this.addLog('error', '⚠️ Connection timeout (35s)! Server is not letting the bot into the world.');
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
        // 1. Cancel 35s watchdog immediately – user needs time to verify code
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
          `🔑 Microsoft sign-in required for "${this.config.username}"! Open ${uri} and enter code: ${code} (Valid for ${Math.round(expiresInSec / 60)} minutes)`
        );
        console.log(`[AUTH ${this.name}] Microsoft Device Code: ${code} | URL: ${uri}`);
        this.broadcastState();

        // 15-minute timeout for user confirmation
        this.connectionWatchdog = setTimeout(() => {
          if (this.status === 'connecting' && this.msaCodeInfo) {
            this.addLog('error', `⏱️ Microsoft sign-in code for "${this.config.username}" expired. Please click "Connect Now" again.`);
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
      this.addLog('error', `Failed to create bot instance: ${err.message}`);
      this.scheduleReconnect();
      return;
    }

    // 2-Stage Resource Pack Handshake
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

      // Velocity Subserver Transfer: Configuration phase transition
      this.bot._client.on('start_configuration', () => {
        this.addLog('system', `Switching subserver / configuration phase...`);
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
      this.addLog('system', `Minecraft login accepted (Protocol: ${this.bot.version || 'Auto'})! Waiting for terrain download...`);
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
      this.addLog('success', `Player spawned in world (${this.config.host})!`);

      const joinCmds = Array.isArray(this.config.onJoinCommands) ? this.config.onJoinCommands : [];
      const delay = (this.config.onJoinDelaySec || 3) * 1000;

      if (!hasExecutedJoinCommands && joinCmds.length > 0) {
        hasExecutedJoinCommands = true;
        setTimeout(() => {
          if (this.bot && this.status === 'online') {
            joinCmds.forEach(cmd => {
              this.addLog('system', `Executing on-join command: ${cmd}`);
              this.chat(cmd);
            });
          }
        }, delay);
      }
    });

    // Deduplicate incoming chat messages
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
      if (plain) this.addLog('system', `[TITLE] ${plain}`);
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
      this.addLog('warn', `Kicked from server (${loggedIn ? 'in-game' : 'login phase'}): ${plainReason || 'No reason provided'}`);
      console.log(`[KICK ${this.name}] Reason:`, plainReason || reason);
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
      this.addLog('warn', `Connection to server closed: ${reason || 'Connection terminated'}`);
      console.log(`[END ${this.name}] Reason:`, reason);
      this.scheduleReconnect();
    });

    this.bot.on('error', err => {
      this.addLog('error', `Bot error: ${err.message}`);
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
      this.addLog('system', `Auto-rejoin active. Reconnecting in ${delay / 1000} seconds...`);
      this.reconnectTimer = setTimeout(() => {
        this.start();
      }, delay);
    } else {
      this.status = 'disconnected';
      this.broadcastState();
      this.addLog('info', 'Auto-rejoin is disabled. Bot remains disconnected.');
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
    this.addLog('info', 'Bot stopped manually.');
  }

  chat(message) {
    if (!message) return;
    if (this.bot && this.status === 'online') {
      try {
        this.bot.chat(message.trim());
        this.addLog('command', `Sent: ${message.trim()}`);
      } catch (err) {
        this.addLog('error', `Error sending command: ${err.message}`);
      }
    } else {
      this.addLog('warn', `Cannot send command: bot is not online.`);
    }
  }

  jump() {
    if (this.bot && this.status === 'online') {
      try {
        this.bot.setControlState('jump', true);
        setTimeout(() => {
          if (this.bot) this.bot.setControlState('jump', false);
        }, 350);
        this.addLog('system', '🦘 Jump executed.');
      } catch (err) {
        this.addLog('error', `Error executing jump: ${err.message}`);
      }
    }
  }

  sneak(shouldSneak) {
    this.isSneaking = !!shouldSneak;
    if (this.bot && this.status === 'online') {
      try {
        this.bot.setControlState('sneak', this.isSneaking);
        this.addLog('system', `👟 Sneak ${this.isSneaking ? 'enabled' : 'disabled'}.`);
      } catch (err) {
        this.addLog('error', `Error toggling sneak: ${err.message}`);
      }
    }
  }

  toggleAutoReconnect(enabled) {
    this.config.autoReconnect = !!enabled;
    this.addLog('system', `Auto-rejoin ${this.config.autoReconnect ? 'ENABLED' : 'DISABLED'}.`);
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
    this.addLog('system', `Periodic reconnect ${this.config.periodicReconnect ? 'ENABLED' : 'DISABLED'}.`);
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

    if (this.config.periodicReconnect && this.status === 'online') {
      this.startPeriodicReconnect(true);
    } else if (!this.config.periodicReconnect) {
      this.stopPeriodicReconnect();
    }

    this.broadcastState();
  }
}

// -------------------------------------------------------------
// 4. Bot Manager & Multi-Bot Registry
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

    console.log(`[BOTS] ${this.botInstances.size} bot profile(s) loaded.`);

    // Start all bots configured with autoReconnect
    this.botInstances.forEach(bot => {
      if (bot.config.autoReconnect !== false) {
        bot.start();
      }
    });
  }

  getAllBots() {
    const list = [];
    this.botInstances.forEach(b => {
      list.push({
        id: b.id,
        name: b.name,
        host: b.config.host,
        port: b.config.port,
        username: b.config.username,
        status: b.status,
      });
    });
    return list;
  }

  getBot(id) {
    return this.botInstances.get(id) || null;
  }

  createBot(data) {
    const id = 'bot_' + crypto.randomBytes(4).toString('hex');

    const newCfg = {
      ...DEFAULT_BOT_SETTINGS,
      ...data,
      id,
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

  deleteBot(id) {
    const bot = this.getBot(id);
    if (!bot) return false;

    bot.stop();
    this.botInstances.delete(id);
    this.persistAll();

    // Clean up auth cache folder
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
app.use(express.static(path.join(__dirname, 'public'), {
  etag: false,
  maxAge: 0,
  setHeaders: (res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
  }
}));

// Authentication Middleware for REST API
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  let token = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }

  req.user = payload;
  next();
}

// -------------------------------------------------------------
// 6. REST API Endpoints
// -------------------------------------------------------------

// Login
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  if (
    username.toLowerCase() !== adminAccount.username.toLowerCase() ||
    !verifyPassword(password, adminAccount.salt, adminAccount.hash)
  ) {
    return res.status(401).json({ error: 'Invalid login credentials' });
  }

  const token = createToken({
    username: adminAccount.username,
  });

  res.json({
    success: true,
    token,
    user: {
      username: adminAccount.username,
    },
  });
});

// Get admin profile & list of all bots
app.get('/api/auth/me', authMiddleware, (req, res) => {
  res.json({
    user: {
      username: adminAccount.username,
    },
    bots: botManager.getAllBots(),
  });
});

// Change admin password
app.post('/api/auth/change-password', authMiddleware, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!newPassword || newPassword.length < 4) {
    return res.status(400).json({ error: 'New password must be at least 4 characters long' });
  }

  if (!verifyPassword(currentPassword, adminAccount.salt, adminAccount.hash)) {
    return res.status(400).json({ error: 'Current password is incorrect' });
  }

  const { salt, hash } = hashPassword(newPassword);
  adminAccount.salt = salt;
  adminAccount.hash = hash;
  adminAccount.updatedAt = new Date().toISOString();
  saveAdmin(adminAccount);

  console.log(`[AUTH] Admin password for "${adminAccount.username}" changed successfully.`);
  res.json({ success: true, message: 'Password updated successfully' });
});

// --- BOT PROFILE ENDPOINTS ---

// List all bot profiles
app.get('/api/bots', authMiddleware, (req, res) => {
  res.json({ success: true, bots: botManager.getAllBots() });
});

// Create new bot profile
app.post('/api/bots', authMiddleware, (req, res) => {
  const { name, host, port, username, version, onJoinCommands } = req.body;

  if (!host || !username) {
    return res.status(400).json({ error: 'Server host and Minecraft player name are required' });
  }

  const commandsArray = Array.isArray(onJoinCommands)
    ? onJoinCommands
    : typeof onJoinCommands === 'string'
    ? onJoinCommands
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
    : [];

  const botInstance = botManager.createBot({
    name: name || `Bot (${username})`,
    host: host.trim(),
    port: parseInt(port, 10) || 25565,
    username: username.trim(),
    version: version ? version.trim() : '',
    onJoinCommands: commandsArray,
    autoReconnect: req.body.autoReconnect !== false,
    periodicReconnect: req.body.periodicReconnect !== false,
    periodicReconnectIntervalMin: parseInt(req.body.periodicReconnectIntervalMin, 10) || 30,
  });

  res.json({ success: true, bot: botInstance.getState() });
});

// Delete bot profile
app.delete('/api/bots/:id', authMiddleware, (req, res) => {
  const success = botManager.deleteBot(req.params.id);
  if (!success) {
    return res.status(404).json({ error: 'Bot profile not found' });
  }
  res.json({ success: true, message: 'Bot profile deleted successfully' });
});

// Update bot settings
app.post('/api/bots/:id/config', authMiddleware, (req, res) => {
  const bot = botManager.getBot(req.params.id);
  if (!bot) return res.status(404).json({ error: 'Bot profile not found' });

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
  });

  botManager.persistAll();
  res.json({ success: true, bot: bot.getState() });
});

// Execute bot action
app.post('/api/bots/:id/action/:action', authMiddleware, (req, res) => {
  const bot = botManager.getBot(req.params.id);
  if (!bot) return res.status(404).json({ error: 'Bot profile not found' });

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
        bot.addLog('system', '🧹 Microsoft auth cache cleared successfully. A new sign-in code will be requested on the next connection.');
      } catch (e) {
        bot.addLog('error', `Failed to clear auth cache: ${e.message}`);
      }
      break;
    default:
      return res.status(400).json({ error: `Unknown action: ${action}` });
  }

  res.json({ success: true });
});

// -------------------------------------------------------------
// 7. WebSocket Live Synchronization
// -------------------------------------------------------------
function broadcastToClients(action, botId, data) {
  const msgStr = JSON.stringify({ action, botId, data });

  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN && client.user) {
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
  const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const token = urlObj.searchParams.get('token');
  const user = verifyToken(token);

  if (!user) {
    ws.send(JSON.stringify({ action: 'auth_error', message: 'Invalid or missing authentication token' }));
    ws.close();
    return;
  }

  ws.user = user;
  const availableBots = botManager.getAllBots();
  const firstBotId = availableBots.length > 0 ? availableBots[0].id : null;
  ws.activeBotId = firstBotId;

  const activeBot = firstBotId ? botManager.botInstances.get(firstBotId) : null;

  // Send initial state payload
  ws.send(
    JSON.stringify({
      action: 'init',
      user: {
        username: adminAccount.username,
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
      const targetBot = targetBotId ? botManager.getBot(targetBotId) : null;

      if (msg.action === 'select_bot') {
        const reqBot = botManager.getBot(msg.botId);
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
      }
    } catch (e) {
      console.error('WebSocket message error:', e.message);
    }
  });
});

// -------------------------------------------------------------
// 8. Server Startup & Bot Initialization
// -------------------------------------------------------------
server.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(` Minecraft Client Manager running on port ${PORT}`);
  console.log(` Web Access: http://localhost:${PORT}`);
  console.log(`====================================================`);

  // Load and initialize bots
  botManager.init((action, botId, data) => {
    broadcastToClients(action, botId, data);
  });
});
