// Globaler Anwendungs-Status
let authToken = localStorage.getItem('mc_token') || null;
let currentUser = null;
let availableBots = [];
let activeBotId = null;
let activeBotData = null;
let nextPeriodicReconnectTimestamp = null;
let currentBotStatus = 'disconnected';
let isSneaking = false;
let ws = null;

// DOM Elemente: Login & Views
const loginView = document.getElementById('loginView');
const mainAppView = document.getElementById('mainAppView');
const loginForm = document.getElementById('loginForm');
const loginUsername = document.getElementById('loginUsername');
const loginPassword = document.getElementById('loginPassword');
const loginError = document.getElementById('loginError');
const btnLogout = document.getElementById('btnLogout');

// DOM Elemente: Header & Profilauswahl
const botSelect = document.getElementById('botSelect');
const btnOpenCreateBotModal = document.getElementById('btnOpenCreateBotModal');
const userBadgeName = document.getElementById('userBadgeName');
const userBadgeRole = document.getElementById('userBadgeRole');
const statusBadge = document.getElementById('statusBadge');
const statusText = document.getElementById('statusText');

// DOM Elemente: Info-Bar
const infoProfileName = document.getElementById('infoProfileName');
const targetServer = document.getElementById('targetServer');
const botName = document.getElementById('botName');
const infoOwnerName = document.getElementById('infoOwnerName');
const mcVersion = document.getElementById('mcVersion');

// DOM Elemente: Dashboard Controls
const autoRejoinToggle = document.getElementById('autoRejoinToggle');
const rejoinStatusAlert = document.getElementById('rejoinStatusAlert');
const rejoinStateLabel = document.getElementById('rejoinStateLabel');
const periodicReconnectToggle = document.getElementById('periodicReconnectToggle');
const periodicStatusAlert = document.getElementById('periodicStatusAlert');
const periodicStateLabel = document.getElementById('periodicStateLabel');
const periodicCountdown = document.getElementById('periodicCountdown');

// DOM Elemente: Microsoft Device Code Alert
const msaAlertBox = document.getElementById('msaAlertBox');
const msaAlertCode = document.getElementById('msaAlertCode');
const msaAlertLink = document.getElementById('msaAlertLink');
const btnCopyMsaCode = document.getElementById('btnCopyMsaCode');

const btnConnect = document.getElementById('btnConnect');
const btnDisconnect = document.getElementById('btnDisconnect');
const btnJump = document.getElementById('btnJump');
const btnSneak = document.getElementById('btnSneak');
const btnClearLogs = document.getElementById('btnClearLogs');
const terminal = document.getElementById('terminal');
const termBotName = document.getElementById('termBotName');
const commandForm = document.getElementById('commandForm');
const commandInput = document.getElementById('commandInput');

// DOM Elemente: Einstellungen (Tab 2)
const settingsProfileLabel = document.getElementById('settingsProfileLabel');
const configFeedback = document.getElementById('configFeedback');
const configForm = document.getElementById('configForm');
const cfgProfileName = document.getElementById('cfgProfileName');
const cfgOwnerGroup = document.getElementById('cfgOwnerGroup');
const cfgOwnerUsername = document.getElementById('cfgOwnerUsername');
const cfgHost = document.getElementById('cfgHost');
const cfgPort = document.getElementById('cfgPort');
const cfgUsername = document.getElementById('cfgUsername');
const cfgVersion = document.getElementById('cfgVersion');
const cfgReconnectDelaySec = document.getElementById('cfgReconnectDelaySec');
const cfgOnJoinCommands = document.getElementById('cfgOnJoinCommands');
const cfgOnJoinDelaySec = document.getElementById('cfgOnJoinDelaySec');
const cfgPeriodicIntervalMin = document.getElementById('cfgPeriodicIntervalMin');
const cfgEnablePhysics = document.getElementById('cfgEnablePhysics');
const cfgAntiAfk = document.getElementById('cfgAntiAfk');
const btnClearAuthCache = document.getElementById('btnClearAuthCache');
const btnDeleteCurrentBot = document.getElementById('btnDeleteCurrentBot');

// DOM Elemente: Admin Panel (Tab 3)
const tabBtnAdmin = document.getElementById('tabBtnAdmin');
const adminUserFeedback = document.getElementById('adminUserFeedback');
const usersTableBody = document.getElementById('usersTableBody');
const adminBotsTableBody = document.getElementById('adminBotsTableBody');
const btnOpenCreateUserModal = document.getElementById('btnOpenCreateUserModal');

// DOM Elemente: Mein Account (Tab 4)
const changePasswordForm = document.getElementById('changePasswordForm');
const accCurrentPass = document.getElementById('accCurrentPass');
const accNewPass = document.getElementById('accNewPass');
const accNewPassConfirm = document.getElementById('accNewPassConfirm');
const accountFeedback = document.getElementById('accountFeedback');

// DOM Elemente: Modals
const modalCreateBot = document.getElementById('modalCreateBot');
const btnCloseCreateBotModal = document.getElementById('btnCloseCreateBotModal');
const btnCancelCreateBot = document.getElementById('btnCancelCreateBot');
const formCreateBot = document.getElementById('formCreateBot');
const newBotOwnerGroup = document.getElementById('newBotOwnerGroup');
const newBotOwner = document.getElementById('newBotOwner');

const modalCreateUser = document.getElementById('modalCreateUser');
const btnCloseCreateUserModal = document.getElementById('btnCloseCreateUserModal');
const btnCancelCreateUser = document.getElementById('btnCancelCreateUser');
const formCreateUser = document.getElementById('formCreateUser');

const modalResetPassword = document.getElementById('modalResetPassword');
const resetTargetUsername = document.getElementById('resetTargetUsername');
const resetTargetUserHidden = document.getElementById('resetTargetUserHidden');
const btnCloseResetModal = document.getElementById('btnCloseResetModal');
const btnCancelResetModal = document.getElementById('btnCancelResetModal');
const formResetPassword = document.getElementById('formResetPassword');

// -------------------------------------------------------------
// 1. Initialisierung & Authentifizierung
// -------------------------------------------------------------
async function initApp() {
  if (!authToken) {
    showLoginView();
    return;
  }

  try {
    const res = await fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${authToken}` },
    });

    if (res.status === 401 || res.status === 403) {
      logout();
      return;
    }

    const data = await res.json();
    currentUser = data.user;
    availableBots = data.bots || [];

    setupUIForUser();
    initWebSocket();
  } catch (err) {
    console.error('Fehler beim Prüfen der Sitzung:', err);
    showLoginView();
  }
}

function showLoginView() {
  loginView.style.display = 'flex';
  mainAppView.style.display = 'none';
  if (ws) {
    try {
      ws.close();
    } catch (e) {}
    ws = null;
  }
}

function showMainView() {
  loginView.style.display = 'none';
  mainAppView.style.display = 'flex';
}

function logout() {
  authToken = null;
  currentUser = null;
  localStorage.removeItem('mc_token');
  if (ws) {
    try {
      ws.close();
    } catch (e) {}
    ws = null;
  }
  showLoginView();
}

btnLogout.addEventListener('click', () => {
  logout();
});

// Login Formular Absenden
loginForm.addEventListener('submit', async e => {
  e.preventDefault();
  loginError.style.display = 'none';

  const username = loginUsername.value.trim();
  const password = loginPassword.value;

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    const data = await res.json();
    if (data.success && data.token) {
      authToken = data.token;
      currentUser = data.user;
      localStorage.setItem('mc_token', authToken);
      loginPassword.value = '';
      setupUIForUser();
      initWebSocket();
    } else {
      loginError.style.display = 'block';
      loginError.className = 'alert-box inactive';
      loginError.textContent = data.error || 'Ungültige Anmeldedaten';
    }
  } catch (err) {
    loginError.style.display = 'block';
    loginError.className = 'alert-box inactive';
    loginError.textContent = 'Netzwerkfehler: ' + err.message;
  }
});

function setupUIForUser() {
  showMainView();
  userBadgeName.textContent = currentUser.username;
  userBadgeRole.textContent = currentUser.role === 'admin' ? 'Admin' : 'Benutzer';
  userBadgeRole.className = currentUser.role === 'admin' ? 'role-tag' : 'role-tag user';

  // Admin-Tab & Admin-Felder
  if (currentUser.role === 'admin') {
    tabBtnAdmin.style.display = 'inline-block';
    cfgOwnerGroup.style.display = 'block';
    newBotOwnerGroup.style.display = 'block';
    loadAdminUsers();
  } else {
    tabBtnAdmin.style.display = 'none';
    cfgOwnerGroup.style.display = 'none';
    newBotOwnerGroup.style.display = 'none';
  }

  updateBotDropdown();
}

// -------------------------------------------------------------
// 2. WebSocket Verbindungsmanagement
// -------------------------------------------------------------
function initWebSocket() {
  if (ws) {
    try {
      ws.close();
    } catch (e) {}
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}?token=${encodeURIComponent(authToken)}`;

  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log('[WS] WebSocket verbunden.');
  };

  ws.onmessage = event => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.action === 'init') {
        handleWsInit(msg);
      } else if (msg.action === 'bot_selected') {
        handleBotSelected(msg);
      } else if (msg.action === 'state') {
        handleStateUpdate(msg);
      } else if (msg.action === 'log') {
        handleLogEntry(msg);
      } else if (msg.action === 'auth_error') {
        logout();
      }
    } catch (err) {
      console.error('[WS] Fehler beim Parsen:', err);
    }
  };

  ws.onclose = () => {
    if (authToken) {
      console.warn('[WS] Verbindung verloren. Wiederverbindung in 3s...');
      setTimeout(initWebSocket, 3000);
    }
  };

  ws.onerror = err => {
    console.error('[WS] Fehler:', err);
  };
}

function handleWsInit(msg) {
  availableBots = msg.bots || [];
  activeBotId = msg.activeBotId || (availableBots[0] ? availableBots[0].id : null);

  updateBotDropdown();

  if (msg.botData) {
    applyBotData(msg.botData);
  }
}

function handleBotSelected(msg) {
  if (msg.botId === activeBotId && msg.data) {
    applyBotData(msg.data);
  }
}

function handleStateUpdate(msg) {
  // Update in Bot-Liste vermerken
  const botInList = availableBots.find(b => b.id === msg.botId);
  if (botInList && msg.data) {
    botInList.status = msg.data.botStatus;
    botInList.name = msg.data.name;
    updateBotDropdown();
  }

  // Wenn der aktuell geöffnete Bot aktualisiert wird
  if (msg.botId === activeBotId && msg.data) {
    applyBotData(msg.data, false);
  }

  // Wenn Admin-Panel offen ist, dortige Tabelle aktualisieren
  if (currentUser && currentUser.role === 'admin') {
    renderAdminBotsTable();
  }
}

function handleLogEntry(msg) {
  if (msg.botId === activeBotId && msg.data) {
    appendLog(msg.data);
  }
}

// -------------------------------------------------------------
// 3. UI-Synchronisation mit aktuellem Bot
// -------------------------------------------------------------
function updateBotDropdown() {
  botSelect.innerHTML = '';

  if (availableBots.length === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'Keine Bot-Profile vorhanden';
    botSelect.appendChild(opt);
    return;
  }

  availableBots.forEach(b => {
    const opt = document.createElement('option');
    opt.value = b.id;
    const statusIcon = b.status === 'online' ? '🟢' : b.status === 'connecting' || b.status === 'reconnecting' ? '🟡' : '⚪';
    opt.textContent = `${statusIcon} ${b.name} (${b.username})`;
    if (b.id === activeBotId) opt.selected = true;
    botSelect.appendChild(opt);
  });
}

botSelect.addEventListener('change', () => {
  const selectedId = botSelect.value;
  if (!selectedId || selectedId === activeBotId) return;

  activeBotId = selectedId;
  terminal.innerHTML = '<div class="log-entry system">[SYSTEM] Lade Logs für ausgewähltes Profil...</div>';

  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ action: 'select_bot', botId: activeBotId }));
  }
});

function applyBotData(data, replaceLogs = true) {
  activeBotData = data;
  currentBotStatus = data.botStatus || 'disconnected';

  // Info Header
  infoProfileName.textContent = data.name || '...';
  termBotName.textContent = data.name || 'Bot';
  settingsProfileLabel.textContent = data.name || '...';
  infoOwnerName.textContent = data.ownerUsername || '...';

  if (data.mcConfig) {
    targetServer.textContent = `${data.mcConfig.host}:${data.mcConfig.port}`;
    botName.textContent = data.mcConfig.username;
    mcVersion.textContent = data.mcConfig.version || 'Automatisch';
  }

  // Status Badge
  statusBadge.className = 'status-badge ' + currentBotStatus;
  switch (currentBotStatus) {
    case 'online':
      statusText.textContent = 'Verbunden';
      btnConnect.disabled = true;
      btnDisconnect.disabled = false;
      break;
    case 'connecting':
      statusText.textContent = 'Verbinde...';
      btnConnect.disabled = true;
      btnDisconnect.disabled = false;
      break;
    case 'reconnecting':
      statusText.textContent = 'Rejoin aktiv...';
      btnConnect.disabled = true;
      btnDisconnect.disabled = false;
      break;
    default:
      statusText.textContent = 'Getrennt';
      btnConnect.disabled = false;
      btnDisconnect.disabled = true;
      break;
  }

  // Auto-Rejoin Toggle
  autoRejoinToggle.checked = !!data.autoReconnect;
  if (data.autoReconnect) {
    rejoinStatusAlert.className = 'alert-box active';
    rejoinStateLabel.textContent = 'AKTIV';
  } else {
    rejoinStatusAlert.className = 'alert-box inactive';
    rejoinStateLabel.textContent = 'PAUSIERT / DEAKTIVIERT';
  }

  // Periodischer Reconnect Toggle & Timestamp
  if (typeof data.periodicReconnect !== 'undefined') {
    periodicReconnectToggle.checked = !!data.periodicReconnect;
    if (data.periodicReconnect) {
      periodicStatusAlert.className = 'alert-box active';
      periodicStateLabel.textContent = 'AKTIV';
    } else {
      periodicStatusAlert.className = 'alert-box inactive';
      periodicStateLabel.textContent = 'PAUSIERT / DEAKTIVIERT';
    }
  }

  nextPeriodicReconnectTimestamp = data.nextPeriodicReconnect || null;
  updatePeriodicCountdownDisplay();

  // Microsoft Login Alert Box
  if (data.msaCode && data.msaCode.code && currentBotStatus === 'connecting') {
    msaAlertBox.style.display = 'flex';
    msaAlertCode.textContent = data.msaCode.code;
    const uri = data.msaCode.uri || 'https://microsoft.com/devicelogin';
    msaAlertLink.href = uri;
    msaAlertLink.textContent = uri;
  } else {
    msaAlertBox.style.display = 'none';
  }

  // Logs befüllen (maximal 200)
  if (replaceLogs) {
    terminal.innerHTML = '';
    if (data.logs && Array.isArray(data.logs)) {
      const recentLogs = data.logs.slice(-200);
      recentLogs.forEach(log => appendLog(log, false));
      scrollToBottom();
    }
  }

  // Formular im Einstellungs-Tab befüllen
  if (data.fullConfig) {
    populateSettingsForm(data.fullConfig);
  }
}

function populateSettingsForm(cfg) {
  const activeEl = document.activeElement;
  if (cfgProfileName && activeEl !== cfgProfileName) cfgProfileName.value = cfg.name || '';
  if (cfgHost && activeEl !== cfgHost) cfgHost.value = cfg.host || '';
  if (cfgPort && activeEl !== cfgPort) cfgPort.value = cfg.port || 25565;
  if (cfgUsername && activeEl !== cfgUsername) cfgUsername.value = cfg.username || '';
  if (cfgVersion && activeEl !== cfgVersion) cfgVersion.value = cfg.version || '';
  if (cfgReconnectDelaySec && activeEl !== cfgReconnectDelaySec) cfgReconnectDelaySec.value = cfg.reconnectDelaySec ?? 10;
  if (cfgOnJoinCommands && activeEl !== cfgOnJoinCommands) cfgOnJoinCommands.value = cfg.onJoinCommands || '';
  if (cfgOnJoinDelaySec && activeEl !== cfgOnJoinDelaySec) cfgOnJoinDelaySec.value = cfg.onJoinDelaySec ?? 3;
  if (cfgPeriodicIntervalMin && activeEl !== cfgPeriodicIntervalMin) cfgPeriodicIntervalMin.value = cfg.periodicReconnectIntervalMin || 30;
  if (cfgEnablePhysics && activeEl !== cfgEnablePhysics) cfgEnablePhysics.checked = cfg.enablePhysics !== false;
  if (cfgAntiAfk && activeEl !== cfgAntiAfk) cfgAntiAfk.checked = cfg.antiAfk !== false;

  if (cfgOwnerUsername && cfg.ownerUsername) {
    cfgOwnerUsername.value = cfg.ownerUsername;
  }
}

// -------------------------------------------------------------
// 4. Live-Countdown & Terminal
// -------------------------------------------------------------
function updatePeriodicCountdownDisplay() {
  if (!periodicCountdown) return;

  if (!periodicReconnectToggle || !periodicReconnectToggle.checked) {
    periodicCountdown.textContent = 'Status: Deaktiviert';
    return;
  }

  if (currentBotStatus !== 'online') {
    periodicCountdown.textContent = 'Pausiert (Bot nicht online)';
    return;
  }

  if (!nextPeriodicReconnectTimestamp) {
    periodicCountdown.textContent = 'Berechne nächsten Reconnect...';
    return;
  }

  const remainingMs = nextPeriodicReconnectTimestamp - Date.now();
  if (remainingMs <= 0) {
    periodicCountdown.textContent = 'Reconnect wird ausgeführt...';
    return;
  }

  const totalSec = Math.floor(remainingMs / 1000);
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  const formatted = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  periodicCountdown.textContent = `Nächster Reconnect in: ${formatted}`;
}

setInterval(updatePeriodicCountdownDisplay, 1000);

function appendLog(entry, scroll = true) {
  const div = document.createElement('div');
  div.className = `log-entry log-${entry.type}`;

  const timeSpan = document.createElement('span');
  timeSpan.className = 'log-time';
  timeSpan.textContent = `[${entry.timestamp}]`;

  const msgSpan = document.createElement('span');
  msgSpan.textContent = entry.message;

  div.appendChild(timeSpan);
  div.appendChild(msgSpan);
  terminal.appendChild(div);

  // Maximal 200 Chat-Nachrichten im DOM behalten (verhindert Speicherüberlastung & Endlos-Wachstum)
  while (terminal.children.length > 200) {
    terminal.removeChild(terminal.firstChild);
  }

  if (scroll) {
    scrollToBottom();
  }
}

function scrollToBottom() {
  terminal.scrollTop = terminal.scrollHeight;
}

btnClearLogs.addEventListener('click', () => {
  terminal.innerHTML = '<div class="log-entry system">[SYSTEM] Konsole geleert.</div>';
});

// -------------------------------------------------------------
// 5. Bot-Aktionen (Dashboard Controls)
// -------------------------------------------------------------
autoRejoinToggle.addEventListener('change', () => {
  if (!activeBotId) return;
  const isEnabled = autoRejoinToggle.checked;
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ action: 'toggle_autoreconnect', botId: activeBotId, value: isEnabled }));
  } else {
    fetch(`/api/bots/${activeBotId}/action/autoreconnect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ enabled: isEnabled }),
    });
  }
});

periodicReconnectToggle.addEventListener('change', () => {
  if (!activeBotId) return;
  const isEnabled = periodicReconnectToggle.checked;
  if (isEnabled) {
    periodicStatusAlert.className = 'alert-box active';
    periodicStateLabel.textContent = 'AKTIV';
  } else {
    periodicStatusAlert.className = 'alert-box inactive';
    periodicStateLabel.textContent = 'PAUSIERT / DEAKTIVIERT';
  }
  updatePeriodicCountdownDisplay();

  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ action: 'toggle_periodic_reconnect', botId: activeBotId, value: isEnabled }));
  } else {
    fetch(`/api/bots/${activeBotId}/action/periodic-reconnect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ enabled: isEnabled }),
    });
  }
});

btnConnect.addEventListener('click', () => {
  if (!activeBotId) return;
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ action: 'connect', botId: activeBotId }));
  } else {
    fetch(`/api/bots/${activeBotId}/action/connect`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}` },
    });
  }
});

btnDisconnect.addEventListener('click', () => {
  if (!activeBotId) return;
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ action: 'disconnect', botId: activeBotId }));
  } else {
    fetch(`/api/bots/${activeBotId}/action/disconnect`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}` },
    });
  }
});

btnJump.addEventListener('click', () => {
  if (!activeBotId) return;
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ action: 'jump', botId: activeBotId }));
  } else {
    fetch(`/api/bots/${activeBotId}/action/jump`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}` },
    });
  }
});

btnSneak.addEventListener('click', () => {
  if (!activeBotId) return;
  isSneaking = !isSneaking;
  btnSneak.style.borderColor = isSneaking ? 'var(--primary)' : 'var(--border)';
  btnSneak.style.color = isSneaking ? 'var(--primary)' : 'var(--text-main)';

  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ action: 'sneak', botId: activeBotId, value: isSneaking }));
  } else {
    fetch(`/api/bots/${activeBotId}/action/sneak`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ sneak: isSneaking }),
    });
  }
});

// Befehl oder Chat senden
commandForm.addEventListener('submit', e => {
  e.preventDefault();
  if (!activeBotId) return;
  const cmd = commandInput.value.trim();
  if (!cmd) return;

  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ action: 'command', botId: activeBotId, command: cmd }));
  } else {
    fetch(`/api/bots/${activeBotId}/action/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ command: cmd }),
    });
  }

  commandInput.value = '';
});

// Schnellbefehle
document.querySelectorAll('.quick-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (!activeBotId) return;
    const cmd = btn.getAttribute('data-cmd');
    if (!cmd) return;

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ action: 'command', botId: activeBotId, command: cmd }));
    }
  });
});

// -------------------------------------------------------------
// 6. Bot-Einstellungen Formular (Tab 2)
// -------------------------------------------------------------
configForm.addEventListener('submit', async e => {
  e.preventDefault();
  if (!activeBotId) return;

  const payload = {
    name: cfgProfileName.value.trim(),
    host: cfgHost.value.trim(),
    port: parseInt(cfgPort.value, 10) || 25565,
    username: cfgUsername.value.trim(),
    version: cfgVersion.value.trim(),
    reconnectDelaySec: parseInt(cfgReconnectDelaySec.value, 10) || 10,
    onJoinCommandsInput: cfgOnJoinCommands.value,
    onJoinDelaySec: parseInt(cfgOnJoinDelaySec.value, 10) || 3,
    physics: cfgEnablePhysics.checked,
    antiAfk: cfgAntiAfk ? cfgAntiAfk.checked : true,
    periodicReconnect: periodicReconnectToggle ? periodicReconnectToggle.checked : true,
    periodicReconnectIntervalMin: parseInt(cfgPeriodicIntervalMin.value, 10) || 30,
    ownerUsername: cfgOwnerUsername && cfgOwnerUsername.value ? cfgOwnerUsername.value : undefined,
  };

  try {
    const res = await fetch(`/api/bots/${activeBotId}/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (data.success) {
      showConfigFeedback('✅ Bot-Einstellungen erfolgreich gespeichert!', 'success');
      // Namen in Liste aktualisieren
      const botInList = availableBots.find(b => b.id === activeBotId);
      if (botInList) {
        botInList.name = payload.name;
        botInList.username = payload.username;
        updateBotDropdown();
      }
    } else {
      showConfigFeedback('❌ Fehler beim Speichern: ' + (data.error || 'Unbekannt'), 'error');
    }
  } catch (err) {
    showConfigFeedback('❌ Netzwerkfehler: ' + err.message, 'error');
  }
});

function showConfigFeedback(msg, type) {
  configFeedback.style.display = 'block';
  configFeedback.className = type === 'success' ? 'alert-box active' : 'alert-box inactive';
  configFeedback.textContent = msg;
  setTimeout(() => {
    configFeedback.style.display = 'none';
  }, 5000);
}

// Microsoft Code Kopier-Button
if (btnCopyMsaCode) {
  btnCopyMsaCode.addEventListener('click', () => {
    const code = msaAlertCode ? msaAlertCode.textContent.trim() : '';
    if (!code || code === '----') return;
    navigator.clipboard.writeText(code).then(() => {
      btnCopyMsaCode.textContent = '✅ Kopiert!';
      setTimeout(() => {
        btnCopyMsaCode.textContent = '📋 Code kopieren';
      }, 2500);
    }).catch(() => {
      // Fallback
      prompt('Kopiere den Code:', code);
    });
  });
}

// Auth-Cache für aktives Profil leeren
if (btnClearAuthCache) {
  btnClearAuthCache.addEventListener('click', async () => {
    if (!activeBotId) return;
    const name = activeBotData ? activeBotData.name : 'dieses Bot-Profil';
    if (!confirm(`Möchtest du den Microsoft-Auth-Cache für "${name}" wirklich leeren?\n\nBeim nächsten Verbindungsversuch wird ein frischer Microsoft-Login-Code angefordert.`)) {
      return;
    }

    try {
      const res = await fetch(`/api/bots/${activeBotId}/action/clear-auth-cache`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const data = await res.json();
      if (data.success) {
        alert('Auth-Cache wurde erfolgreich geleert!\n\nKlicke nun im Dashboard auf "Jetzt Verbinden", um einen neuen Code zu generieren.');
      } else {
        alert('Fehler: ' + (data.error || 'Cache konnte nicht geleert werden'));
      }
    } catch (err) {
      alert('Netzwerkfehler: ' + err.message);
    }
  });
}

// Bot Profil löschen
btnDeleteCurrentBot.addEventListener('click', async () => {
  if (!activeBotId) return;
  const currentName = activeBotData ? activeBotData.name : 'dieses Bot-Profil';
  if (!confirm(`Möchtest du das Bot-Profil "${currentName}" wirklich unwiderruflich löschen?`)) {
    return;
  }

  try {
    const res = await fetch(`/api/bots/${activeBotId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const data = await res.json();
    if (data.success) {
      alert('Bot-Profil wurde gelöscht.');
      availableBots = availableBots.filter(b => b.id !== activeBotId);
      activeBotId = availableBots.length > 0 ? availableBots[0].id : null;
      updateBotDropdown();
      if (activeBotId && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ action: 'select_bot', botId: activeBotId }));
      }
    } else {
      alert('Fehler: ' + (data.error || 'Profil konnte nicht gelöscht werden'));
    }
  } catch (err) {
    alert('Netzwerkfehler: ' + err.message);
  }
});

// -------------------------------------------------------------
// 7. Admin Panel Logik (Tab 3)
// -------------------------------------------------------------
async function loadAdminUsers() {
  if (!currentUser || currentUser.role !== 'admin') return;

  try {
    const res = await fetch('/api/admin/users', {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const data = await res.json();
    if (data.success) {
      renderAdminUsersTable(data.users);
      populateOwnerDropdowns(data.users);
    }
  } catch (err) {
    console.error('Fehler beim Laden der Admin-Benutzer:', err);
  }
}

function renderAdminUsersTable(users) {
  usersTableBody.innerHTML = '';
  users.forEach(u => {
    const tr = document.createElement('tr');

    const isSelf = u.username.toLowerCase() === currentUser.username.toLowerCase();
    const dateStr = u.createdAt ? new Date(u.createdAt).toLocaleDateString('de-DE') : '-';

    tr.innerHTML = `
      <td><strong>${u.username}</strong> ${isSelf ? '<small style="color:var(--primary);">(Du)</small>' : ''}</td>
      <td><span class="role-tag ${u.role === 'admin' ? '' : 'user'}">${u.role.toUpperCase()}</span></td>
      <td>${u.botCount} Profil(e)</td>
      <td>${dateStr}</td>
      <td class="table-actions">
        <button class="btn btn-xs btn-secondary" onclick="openResetPasswordModal('${u.username}')">🔑 Passwort</button>
        ${!isSelf ? `<button class="btn btn-xs btn-danger" onclick="deleteUser('${u.username}')">🗑️ Löschen</button>` : ''}
      </td>
    `;
    usersTableBody.appendChild(tr);
  });
}

function populateOwnerDropdowns(users) {
  [cfgOwnerUsername, newBotOwner].forEach(sel => {
    if (!sel) return;
    const prev = sel.value;
    sel.innerHTML = '';
    users.forEach(u => {
      const opt = document.createElement('option');
      opt.value = u.username;
      opt.textContent = `${u.username} (${u.role})`;
      sel.appendChild(opt);
    });
    if (prev) sel.value = prev;
  });
}

function renderAdminBotsTable() {
  if (!adminBotsTableBody) return;
  adminBotsTableBody.innerHTML = '';

  availableBots.forEach(b => {
    const tr = document.createElement('tr');
    const isSelected = b.id === activeBotId;
    const statusDot = b.status === 'online' ? '🟢 Online' : b.status === 'connecting' || b.status === 'reconnecting' ? '🟡 Verbindet' : '⚪ Getrennt';

    tr.innerHTML = `
      <td><strong>${b.name}</strong> ${isSelected ? '<small style="color:var(--primary);">(Aktiv)</small>' : ''}</td>
      <td>${b.ownerUsername || 'admin'}</td>
      <td>${b.host}:${b.port}</td>
      <td><code>${b.username}</code></td>
      <td>${statusDot}</td>
      <td class="table-actions">
        <button class="btn btn-xs btn-primary" onclick="switchToBot('${b.id}')">🎮 Auswählen</button>
        <button class="btn btn-xs btn-danger" onclick="adminDeleteBot('${b.id}', '${b.name}')">🗑️</button>
      </td>
    `;
    adminBotsTableBody.appendChild(tr);
  });
}

window.switchToBot = function (botId) {
  botSelect.value = botId;
  botSelect.dispatchEvent(new Event('change'));
  // Zu Tab 1 wechseln
  document.querySelector('.tab-btn[data-tab="tabDashboard"]').click();
};

window.adminDeleteBot = async function (botId, name) {
  if (!confirm(`Bot-Profil "${name}" wirklich löschen?`)) return;
  try {
    const res = await fetch(`/api/bots/${botId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const data = await res.json();
    if (data.success) {
      availableBots = availableBots.filter(b => b.id !== botId);
      if (activeBotId === botId) {
        activeBotId = availableBots.length > 0 ? availableBots[0].id : null;
      }
      updateBotDropdown();
      renderAdminBotsTable();
    }
  } catch (err) {
    alert('Fehler beim Löschen: ' + err.message);
  }
};

window.deleteUser = async function (username) {
  if (!confirm(`Benutzer "${username}" wirklich unwiderruflich löschen?`)) return;

  try {
    const res = await fetch(`/api/admin/users/${encodeURIComponent(username)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const data = await res.json();
    if (data.success) {
      loadAdminUsers();
    } else {
      alert(data.error || 'Fehler beim Löschen');
    }
  } catch (err) {
    alert('Netzwerkfehler: ' + err.message);
  }
};

window.openResetPasswordModal = function (username) {
  resetTargetUsername.textContent = username;
  resetTargetUserHidden.value = username;
  modalResetPassword.style.display = 'flex';
};

// -------------------------------------------------------------
// 8. Modals Logik
// -------------------------------------------------------------

// Modal: Neues Bot Profil
btnOpenCreateBotModal.addEventListener('click', () => {
  modalCreateBot.style.display = 'flex';
});

[btnCloseCreateBotModal, btnCancelCreateBot].forEach(el => {
  el.addEventListener('click', () => {
    modalCreateBot.style.display = 'none';
  });
});

formCreateBot.addEventListener('submit', async e => {
  e.preventDefault();
  const name = document.getElementById('newBotName').value.trim();
  const host = document.getElementById('newBotHost').value.trim();
  const port = parseInt(document.getElementById('newBotPort').value, 10) || 25565;
  const username = document.getElementById('newBotUsername').value.trim();
  const onJoinCmds = document.getElementById('newBotCommands').value;
  const owner = currentUser.role === 'admin' && newBotOwner ? newBotOwner.value : currentUser.username;

  try {
    const res = await fetch('/api/bots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({
        name,
        host,
        port,
        username,
        onJoinCommands: onJoinCmds,
        ownerUsername: owner,
      }),
    });

    const data = await res.json();
    if (data.success && data.bot) {
      modalCreateBot.style.display = 'none';
      formCreateBot.reset();
      availableBots.push({
        id: data.bot.id,
        name: data.bot.name,
        ownerUsername: data.bot.ownerUsername,
        host: data.bot.mcConfig.host,
        port: data.bot.mcConfig.port,
        username: data.bot.mcConfig.username,
        status: data.bot.botStatus,
      });

      activeBotId = data.bot.id;
      updateBotDropdown();
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ action: 'select_bot', botId: activeBotId }));
      }
      applyBotData(data.bot);
    } else {
      alert('Fehler beim Erstellen: ' + (data.error || 'Unbekannt'));
    }
  } catch (err) {
    alert('Netzwerkfehler: ' + err.message);
  }
});

// Modal: Neuer Benutzer (Admin)
btnOpenCreateUserModal.addEventListener('click', () => {
  modalCreateUser.style.display = 'flex';
});

[btnCloseCreateUserModal, btnCancelCreateUser].forEach(el => {
  el.addEventListener('click', () => {
    modalCreateUser.style.display = 'none';
  });
});

formCreateUser.addEventListener('submit', async e => {
  e.preventDefault();
  const username = document.getElementById('newUserName').value.trim();
  const password = document.getElementById('newUserPassword').value;
  const role = document.getElementById('newUserRole').value;

  try {
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ username, password, role }),
    });

    const data = await res.json();
    if (data.success) {
      modalCreateUser.style.display = 'none';
      formCreateUser.reset();
      loadAdminUsers();
      alert(`Benutzer "${username}" erfolgreich angelegt!`);
    } else {
      alert('Fehler: ' + (data.error || 'Konnte nicht angelegt werden'));
    }
  } catch (err) {
    alert('Netzwerkfehler: ' + err.message);
  }
});

// Modal: Admin Reset Password
[btnCloseResetModal, btnCancelResetModal].forEach(el => {
  el.addEventListener('click', () => {
    modalResetPassword.style.display = 'none';
  });
});

formResetPassword.addEventListener('submit', async e => {
  e.preventDefault();
  const targetUser = resetTargetUserHidden.value;
  const newPass = document.getElementById('resetNewPassword').value;

  try {
    const res = await fetch(`/api/admin/users/${encodeURIComponent(targetUser)}/password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ newPassword: newPass }),
    });

    const data = await res.json();
    if (data.success) {
      modalResetPassword.style.display = 'none';
      formResetPassword.reset();
      alert(`Passwort für "${targetUser}" wurde aktualisiert!`);
    } else {
      alert('Fehler: ' + (data.error || 'Konnte nicht geändert werden'));
    }
  } catch (err) {
    alert('Netzwerkfehler: ' + err.message);
  }
});

// -------------------------------------------------------------
// 9. Tab 4: Mein Account (Passwort ändern)
// -------------------------------------------------------------
changePasswordForm.addEventListener('submit', async e => {
  e.preventDefault();
  accountFeedback.style.display = 'none';

  const currentPassword = accCurrentPass.value;
  const newPassword = accNewPass.value;
  const confirm = accNewPassConfirm.value;

  if (newPassword !== confirm) {
    accountFeedback.style.display = 'block';
    accountFeedback.className = 'alert-box inactive';
    accountFeedback.textContent = 'Die Passwörter stimmen nicht überein';
    return;
  }

  try {
    const res = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ currentPassword, newPassword }),
    });

    const data = await res.json();
    if (data.success) {
      accountFeedback.style.display = 'block';
      accountFeedback.className = 'alert-box active';
      accountFeedback.textContent = '✅ Passwort erfolgreich geändert!';
      changePasswordForm.reset();
    } else {
      accountFeedback.style.display = 'block';
      accountFeedback.className = 'alert-box inactive';
      accountFeedback.textContent = data.error || 'Fehler beim Ändern des Passworts';
    }
  } catch (err) {
    accountFeedback.style.display = 'block';
    accountFeedback.className = 'alert-box inactive';
    accountFeedback.textContent = 'Netzwerkfehler: ' + err.message;
  }
});

// -------------------------------------------------------------
// 10. Tab-Navigation
// -------------------------------------------------------------
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const targetTabId = btn.getAttribute('data-tab');
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

    btn.classList.add('active');
    const targetContent = document.getElementById(targetTabId);
    if (targetContent) targetContent.classList.add('active');

    if (targetTabId === 'tabAdmin') {
      loadAdminUsers();
      renderAdminBotsTable();
    }
  });
});

// App Start
initApp();
