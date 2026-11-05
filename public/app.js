// Global Application State
let authToken = localStorage.getItem('mc_token') || null;
let currentUser = null;
let availableBots = [];
let availableProxies = [];
let proxyTestResults = {};
let activeBotId = null;
let activeBotData = null;
let nextPeriodicReconnectTimestamp = null;
let currentBotStatus = 'disconnected';
let ws = null;

// DOM Elements: Login & Views
const loginView = document.getElementById('loginView');
const mainAppView = document.getElementById('mainAppView');
const loginForm = document.getElementById('loginForm');
const loginUsername = document.getElementById('loginUsername');
const loginPassword = document.getElementById('loginPassword');
const loginError = document.getElementById('loginError');
const btnLogout = document.getElementById('btnLogout');

// DOM Elements: Header & Profile Switcher
const botSelect = document.getElementById('botSelect');
const btnOpenCreateBotModal = document.getElementById('btnOpenCreateBotModal');
const userBadgeName = document.getElementById('userBadgeName');
const statusBadge = document.getElementById('statusBadge');
const statusText = document.getElementById('statusText');

// DOM Elements: Info Bar
const infoProfileName = document.getElementById('infoProfileName');
const targetServer = document.getElementById('targetServer');
const botName = document.getElementById('botName');
const infoRoute = document.getElementById('infoRoute');
const mcVersion = document.getElementById('mcVersion');

// DOM Elements: Dashboard Controls
const autoRejoinToggle = document.getElementById('autoRejoinToggle');
const rejoinStatusAlert = document.getElementById('rejoinStatusAlert');
const rejoinStateLabel = document.getElementById('rejoinStateLabel');
const periodicReconnectToggle = document.getElementById('periodicReconnectToggle');
const periodicStatusAlert = document.getElementById('periodicStatusAlert');
const periodicStateLabel = document.getElementById('periodicStateLabel');
const periodicCountdown = document.getElementById('periodicCountdown');
const periodicIntervalDisplay = document.getElementById('periodicIntervalDisplay');
const periodicIntervalDescDisplay = document.getElementById('periodicIntervalDescDisplay');

// DOM Elements: Microsoft Device Code Alert
const msaAlertBox = document.getElementById('msaAlertBox');
const msaAlertCode = document.getElementById('msaAlertCode');
const msaAlertLink = document.getElementById('msaAlertLink');
const btnCopyMsaCode = document.getElementById('btnCopyMsaCode');

const btnConnect = document.getElementById('btnConnect');
const btnDisconnect = document.getElementById('btnDisconnect');
const btnClearLogs = document.getElementById('btnClearLogs');
const terminal = document.getElementById('terminal');
const termBotName = document.getElementById('termBotName');
const commandForm = document.getElementById('commandForm');
const commandInput = document.getElementById('commandInput');

// DOM Elements: Settings Form
const settingsProfileLabel = document.getElementById('settingsProfileLabel');
const configForm = document.getElementById('configForm');
const configFeedback = document.getElementById('configFeedback');
const cfgProfileName = document.getElementById('cfgProfileName');
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
const cfgProxySelect = document.getElementById('cfgProxySelect');
const btnClearAuthCache = document.getElementById('btnClearAuthCache');
const btnDeleteCurrentBot = document.getElementById('btnDeleteCurrentBot');

// DOM Elements: Modal Create Bot
const modalCreateBot = document.getElementById('modalCreateBot');
const btnCloseCreateBotModal = document.getElementById('btnCloseCreateBotModal');
const btnCancelCreateBot = document.getElementById('btnCancelCreateBot');
const formCreateBot = document.getElementById('formCreateBot');
const newBotProxy = document.getElementById('newBotProxy');

// DOM Elements: Proxy Pool
const proxyTableBody = document.getElementById('proxyTableBody');
const emptyProxyState = document.getElementById('emptyProxyState');
const proxyFeedback = document.getElementById('proxyFeedback');
const btnOpenAddProxyModal = document.getElementById('btnOpenAddProxyModal');
const btnEmptyAddProxy = document.getElementById('btnEmptyAddProxy');
const btnCloseAddProxyModal = document.getElementById('btnCloseAddProxyModal');
const btnCancelAddProxy = document.getElementById('btnCancelAddProxy');
const modalAddProxy = document.getElementById('modalAddProxy');
const formAddProxy = document.getElementById('formAddProxy');
const proxyQuickImport = document.getElementById('proxyQuickImport');
const newProxyName = document.getElementById('newProxyName');
const newProxyHost = document.getElementById('newProxyHost');
const newProxyPort = document.getElementById('newProxyPort');
const newProxyUser = document.getElementById('newProxyUser');
const newProxyPass = document.getElementById('newProxyPass');
const btnTestAllProxies = document.getElementById('btnTestAllProxies');

// DOM Elements: Change Password Form
const changePasswordForm = document.getElementById('changePasswordForm');
const accCurrentPass = document.getElementById('accCurrentPass');
const accNewPass = document.getElementById('accNewPass');
const accNewPassConfirm = document.getElementById('accNewPassConfirm');
const accountFeedback = document.getElementById('accountFeedback');

// -------------------------------------------------------------
// 1. Initial Authentication & Verification
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

    if (res.ok) {
      const data = await res.json();
      currentUser = data.user;
      availableBots = data.bots || [];
      activeBotId = availableBots.length > 0 ? availableBots[0].id : null;
      setupUIForUser();
      if (availableBots.length === 0) {
        resetEmptyBotUI();
      }
      initWebSocket();
    } else {
      logout();
    }
  } catch (err) {
    console.error('Session verification error:', err);
    showLoginView();
  }
}

function showLoginView() {
  loginView.style.display = 'flex';
  mainAppView.style.display = 'none';
}

function showMainView() {
  loginView.style.display = 'none';
  mainAppView.style.display = 'block';
}

function logout() {
  authToken = null;
  currentUser = null;
  localStorage.removeItem('mc_token');
  if (ws) {
    try {
      ws.close();
    } catch (e) {}
  }
  showLoginView();
}

btnLogout.addEventListener('click', logout);

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
      loginError.textContent = data.error || 'Invalid username or password';
    }
  } catch (err) {
    loginError.style.display = 'block';
    loginError.className = 'alert-box inactive';
    loginError.textContent = 'Network error: ' + err.message;
  }
});

function setupUIForUser() {
  showMainView();
  userBadgeName.textContent = currentUser.username;
  updateBotDropdown();
  fetchProxies();
}

// -------------------------------------------------------------
// 2. WebSocket Connection Management
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
    console.log('[WS] WebSocket connected.');
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
      console.error('[WS] Error parsing message:', err);
    }
  };

  ws.onclose = () => {
    if (authToken) {
      console.warn('[WS] Connection closed. Reconnecting in 3s...');
      setTimeout(initWebSocket, 3000);
    }
  };

  ws.onerror = err => {
    console.error('[WS] Error:', err);
  };
}

function handleWsInit(msg) {
  availableBots = msg.bots || [];
  if (msg.proxies) {
    availableProxies = msg.proxies;
    renderProxyTable();
    updateProxyDropdowns();
  }
  activeBotId = msg.activeBotId || (availableBots[0] ? availableBots[0].id : null);

  updateBotDropdown();

  if (msg.botData) {
    applyBotData(msg.botData);
  } else {
    resetEmptyBotUI();
  }
}

function handleBotSelected(msg) {
  if (msg.botId === activeBotId && msg.data) {
    applyBotData(msg.data);
  }
}

function handleStateUpdate(msg) {
  const botInList = availableBots.find(b => b.id === msg.botId);
  if (botInList && msg.data) {
    botInList.status = msg.data.botStatus;
    botInList.name = msg.data.name;
    updateBotDropdown();
  }

  if (msg.botId === activeBotId && msg.data) {
    applyBotData(msg.data, false);
  }
}

function handleLogEntry(msg) {
  if (msg.botId === activeBotId && msg.data) {
    appendLog(msg.data);
  }
}

function resetEmptyBotUI() {
  activeBotData = null;
  currentBotStatus = 'disconnected';
  infoProfileName.textContent = '-';
  targetServer.textContent = '-';
  botName.textContent = '-';
  if (infoRoute) infoRoute.textContent = '-';
  mcVersion.textContent = '-';
  settingsProfileLabel.textContent = 'No Profile Selected';
  termBotName.textContent = 'None';
  statusBadge.className = 'status-badge disconnected';
  statusText.textContent = 'No Bot';
  btnConnect.disabled = true;
  btnDisconnect.disabled = true;
  autoRejoinToggle.checked = false;
  rejoinStatusAlert.className = 'alert-box inactive';
  rejoinStateLabel.textContent = 'PAUSED / DISABLED';
  periodicReconnectToggle.checked = false;
  periodicStatusAlert.className = 'alert-box inactive';
  periodicStateLabel.textContent = 'PAUSED / DISABLED';
  if (periodicCountdown) periodicCountdown.textContent = 'No bot profile';
  msaAlertBox.style.display = 'none';
  terminal.innerHTML = '<div class="log-entry log-system">[SYSTEM] No bot profiles exist yet. Click "+ New" in the header to create your first Minecraft bot.</div>';

  if (cfgProfileName) cfgProfileName.value = '';
  if (cfgProxySelect) cfgProxySelect.value = 'direct';
  if (cfgHost) cfgHost.value = '';
  if (cfgPort) cfgPort.value = 25565;
  if (cfgUsername) cfgUsername.value = '';
  if (cfgVersion) cfgVersion.value = '';
  if (cfgReconnectDelaySec) cfgReconnectDelaySec.value = 10;
  if (cfgOnJoinCommands) cfgOnJoinCommands.value = '';
  if (cfgOnJoinDelaySec) cfgOnJoinDelaySec.value = 3;
  if (cfgPeriodicIntervalMin) cfgPeriodicIntervalMin.value = 30;
}

// -------------------------------------------------------------
// 3. UI Synchronization with Selected Bot
// -------------------------------------------------------------
function updateBotDropdown() {
  botSelect.innerHTML = '';

  if (availableBots.length === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'No profiles (Click + New)';
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
  terminal.innerHTML = '<div class="log-entry log-system">[SYSTEM] Loading console logs for selected profile...</div>';

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

  if (data.mcConfig) {
    targetServer.textContent = `${data.mcConfig.host}:${data.mcConfig.port}`;
    botName.textContent = data.mcConfig.username;
    mcVersion.textContent = data.mcConfig.version || 'Automatic';
  }

  // Route / Proxy Display
  if (infoRoute) {
    const pId = data.proxyId || (data.fullConfig && data.fullConfig.proxyId) || 'direct';
    if (pId === 'direct') {
      infoRoute.textContent = 'Direct (Server IP)';
      infoRoute.style.color = 'var(--text-muted)';
    } else if (pId === 'random') {
      infoRoute.textContent = '🎲 Random Pool Proxy';
      infoRoute.style.color = 'var(--primary)';
    } else {
      const p = availableProxies.find(x => x.id === pId) || data.proxyInfo;
      infoRoute.textContent = p ? `🛡️ ${p.name}` : `🛡️ ${pId}`;
      infoRoute.style.color = 'var(--primary)';
    }
  }

  // Status Badge
  statusBadge.className = 'status-badge ' + currentBotStatus;
  switch (currentBotStatus) {
    case 'online':
      statusText.textContent = 'Connected';
      btnConnect.disabled = true;
      btnDisconnect.disabled = false;
      break;
    case 'connecting':
      statusText.textContent = 'Connecting...';
      btnConnect.disabled = true;
      btnDisconnect.disabled = false;
      break;
    case 'reconnecting':
      statusText.textContent = 'Rejoining...';
      btnConnect.disabled = true;
      btnDisconnect.disabled = false;
      break;
    default:
      statusText.textContent = 'Disconnected';
      btnConnect.disabled = false;
      btnDisconnect.disabled = true;
      break;
  }

  // Auto-Rejoin Toggle
  autoRejoinToggle.checked = !!data.autoReconnect;
  if (data.autoReconnect) {
    rejoinStatusAlert.className = 'alert-box active';
    rejoinStateLabel.textContent = 'ACTIVE';
  } else {
    rejoinStatusAlert.className = 'alert-box inactive';
    rejoinStateLabel.textContent = 'PAUSED / DISABLED';
  }

  // Dynamic Periodic Reconnect Interval Title & Description
  const intervalMin = data.periodicReconnectIntervalMin || (data.fullConfig && data.fullConfig.periodicReconnectIntervalMin) || 30;
  if (periodicIntervalDisplay) periodicIntervalDisplay.textContent = intervalMin;
  if (periodicIntervalDescDisplay) periodicIntervalDescDisplay.textContent = intervalMin;

  // Periodic Reconnect Toggle & Timestamp
  if (typeof data.periodicReconnect !== 'undefined') {
    periodicReconnectToggle.checked = !!data.periodicReconnect;
    if (data.periodicReconnect) {
      periodicStatusAlert.className = 'alert-box active';
      periodicStateLabel.textContent = 'ACTIVE';
    } else {
      periodicStatusAlert.className = 'alert-box inactive';
      periodicStateLabel.textContent = 'PAUSED / DISABLED';
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

  // Populate Logs (max 200)
  if (replaceLogs) {
    terminal.innerHTML = '';
    if (data.logs && Array.isArray(data.logs)) {
      const recentLogs = data.logs.slice(-200);
      recentLogs.forEach(log => appendLog(log, false));
      scrollToBottom();
    }
  }

  // Populate Settings Tab Form
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
  if (cfgProxySelect && activeEl !== cfgProxySelect) cfgProxySelect.value = cfg.proxyId || 'direct';
  if (cfgReconnectDelaySec && activeEl !== cfgReconnectDelaySec) cfgReconnectDelaySec.value = cfg.reconnectDelaySec ?? 10;
  if (cfgOnJoinCommands && activeEl !== cfgOnJoinCommands) cfgOnJoinCommands.value = cfg.onJoinCommands || '';
  if (cfgOnJoinDelaySec && activeEl !== cfgOnJoinDelaySec) cfgOnJoinDelaySec.value = cfg.onJoinDelaySec ?? 3;
  if (cfgPeriodicIntervalMin && activeEl !== cfgPeriodicIntervalMin) cfgPeriodicIntervalMin.value = cfg.periodicReconnectIntervalMin || 30;
  if (cfgEnablePhysics && activeEl !== cfgEnablePhysics) cfgEnablePhysics.checked = cfg.enablePhysics !== false;
  if (cfgAntiAfk && activeEl !== cfgAntiAfk) cfgAntiAfk.checked = cfg.antiAfk !== false;
}

// -------------------------------------------------------------
// 4. Live Countdown & Terminal
// -------------------------------------------------------------
function updatePeriodicCountdownDisplay() {
  if (!periodicCountdown) return;

  if (!periodicReconnectToggle || !periodicReconnectToggle.checked) {
    periodicCountdown.textContent = 'Status: Disabled';
    return;
  }

  if (currentBotStatus !== 'online') {
    periodicCountdown.textContent = 'Paused (Bot offline)';
    return;
  }

  if (!nextPeriodicReconnectTimestamp) {
    periodicCountdown.textContent = 'Calculating next reconnect...';
    return;
  }

  const remainingMs = nextPeriodicReconnectTimestamp - Date.now();
  if (remainingMs <= 0) {
    periodicCountdown.textContent = 'Reconnecting now...';
    return;
  }

  const totalSec = Math.floor(remainingMs / 1000);
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  const formatted = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  periodicCountdown.textContent = `Next reconnect in: ${formatted}`;
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

  // Keep maximum 200 messages in DOM
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
  terminal.innerHTML = '<div class="log-entry log-system">[SYSTEM] Console cleared.</div>';
});

// -------------------------------------------------------------
// 5. Dashboard Action Controls
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
    periodicStateLabel.textContent = 'ACTIVE';
  } else {
    periodicStatusAlert.className = 'alert-box inactive';
    periodicStateLabel.textContent = 'PAUSED / DISABLED';
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

// Send Chat or Command
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

// -------------------------------------------------------------
// 6. Bot Settings Form (Tab 2)
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
    proxyId: cfgProxySelect ? cfgProxySelect.value : 'direct',
    reconnectDelaySec: parseInt(cfgReconnectDelaySec.value, 10) || 10,
    onJoinCommandsInput: cfgOnJoinCommands.value,
    onJoinDelaySec: parseInt(cfgOnJoinDelaySec.value, 10) || 3,
    physics: cfgEnablePhysics.checked,
    antiAfk: cfgAntiAfk ? cfgAntiAfk.checked : true,
    periodicReconnect: periodicReconnectToggle ? periodicReconnectToggle.checked : true,
    periodicReconnectIntervalMin: parseInt(cfgPeriodicIntervalMin.value, 10) || 30,
  };

  try {
    const res = await fetch(`/api/bots/${activeBotId}/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (data.success) {
      showConfigFeedback('Bot settings saved successfully.', 'success');
      // Update dynamic periodic reconnect numbers in UI immediately
      if (periodicIntervalDisplay) periodicIntervalDisplay.textContent = payload.periodicReconnectIntervalMin;
      if (periodicIntervalDescDisplay) periodicIntervalDescDisplay.textContent = payload.periodicReconnectIntervalMin;

      const botInList = availableBots.find(b => b.id === activeBotId);
      if (botInList) {
        botInList.name = payload.name;
        botInList.username = payload.username;
        updateBotDropdown();
      }
    } else {
      showConfigFeedback('Error saving settings: ' + (data.error || 'Unknown'), 'error');
    }
  } catch (err) {
    showConfigFeedback('Network error: ' + err.message, 'error');
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

// Universal Clipboard Copy Helper (works on HTTP IP & HTTPS)
function copyTextToClipboard(text) {
  return new Promise((resolve, reject) => {
    // 1. Modern Clipboard API (Only in Secure Context: HTTPS or localhost)
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      navigator.clipboard
        .writeText(text)
        .then(resolve)
        .catch(() => {
          fallbackCopyText(text, resolve, reject);
        });
      return;
    }

    // 2. Fallback for plain HTTP (IP address)
    fallbackCopyText(text, resolve, reject);
  });
}

function fallbackCopyText(text, resolve, reject) {
  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.setAttribute('readonly', '');
    textArea.style.position = 'fixed';
    textArea.style.left = '-9999px';
    textArea.style.top = '0';
    textArea.style.opacity = '0';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    textArea.setSelectionRange(0, 99999);

    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);

    if (successful) {
      resolve();
    } else {
      reject(new Error('execCommand copy returned false'));
    }
  } catch (err) {
    reject(err);
  }
}

// Copy Microsoft Code Button
if (btnCopyMsaCode) {
  btnCopyMsaCode.addEventListener('click', () => {
    const code = msaAlertCode ? msaAlertCode.textContent.trim() : '';
    if (!code || code === '----') return;

    copyTextToClipboard(code)
      .then(() => {
        const originalText = btnCopyMsaCode.textContent;
        btnCopyMsaCode.textContent = 'Copied!';
        btnCopyMsaCode.style.background = 'var(--primary)';
        btnCopyMsaCode.style.color = '#04130a';
        setTimeout(() => {
          btnCopyMsaCode.textContent = originalText;
          btnCopyMsaCode.style.background = '';
          btnCopyMsaCode.style.color = '';
        }, 2500);
      })
      .catch(() => {
        window.prompt('Copy your Microsoft code manually (Ctrl+C / Cmd+C):', code);
      });
  });
}

// Clear Auth Cache for Active Profile
if (btnClearAuthCache) {
  btnClearAuthCache.addEventListener('click', async () => {
    if (!activeBotId) return;
    const name = activeBotData ? activeBotData.name : 'this bot profile';
    if (!confirm(`Do you really want to clear the Microsoft auth cache for "${name}"?\n\nA new Microsoft sign-in code will be requested on the next connection attempt.`)) {
      return;
    }

    try {
      const res = await fetch(`/api/bots/${activeBotId}/action/clear-auth-cache`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const data = await res.json();
      if (data.success) {
        alert('Auth cache cleared successfully!\n\nClick "Connect Now" in the dashboard to generate a new login code.');
      } else {
        alert('Error: ' + (data.error || 'Failed to clear cache'));
      }
    } catch (err) {
      alert('Network error: ' + err.message);
    }
  });
}

// Delete Profile Button in Settings
btnDeleteCurrentBot.addEventListener('click', async () => {
  if (!activeBotId) return;
  const name = activeBotData ? activeBotData.name : 'this bot profile';
  if (!confirm(`Permanently delete bot profile "${name}"?`)) return;

  try {
    const res = await fetch(`/api/bots/${activeBotId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const data = await res.json();
    if (data.success) {
      availableBots = availableBots.filter(b => b.id !== activeBotId);
      activeBotId = availableBots.length > 0 ? availableBots[0].id : null;
      updateBotDropdown();
      document.querySelector('.tab-btn[data-tab="tabDashboard"]').click();
      if (activeBotId) {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ action: 'select_bot', botId: activeBotId }));
        }
      } else {
        resetEmptyBotUI();
      }
    } else {
      alert('Error: ' + (data.error || 'Failed to delete profile'));
    }
  } catch (err) {
    alert('Network error: ' + err.message);
  }
});

// -------------------------------------------------------------
// 7. Modal: Create Bot Profile
// -------------------------------------------------------------
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

  try {
    const res = await fetch('/api/bots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({
        name,
        host,
        port,
        username,
        proxyId: newBotProxy ? newBotProxy.value : 'direct',
        onJoinCommands: onJoinCmds,
      }),
    });

    const data = await res.json();
    if (data.success && data.bot) {
      modalCreateBot.style.display = 'none';
      formCreateBot.reset();
      availableBots.push({
        id: data.bot.id,
        name: data.bot.name,
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
      alert('Error creating profile: ' + (data.error || 'Unknown'));
    }
  } catch (err) {
    alert('Network error: ' + err.message);
  }
});

// -------------------------------------------------------------
// 8. Change Password Form (Admin)
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
    accountFeedback.textContent = 'Passwords do not match';
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
      accountFeedback.textContent = 'Password updated successfully.';
      changePasswordForm.reset();
    } else {
      accountFeedback.style.display = 'block';
      accountFeedback.className = 'alert-box inactive';
      accountFeedback.textContent = data.error || 'Failed to change password';
    }
  } catch (err) {
    accountFeedback.style.display = 'block';
    accountFeedback.className = 'alert-box inactive';
    accountFeedback.textContent = 'Network error: ' + err.message;
  }
});

// -------------------------------------------------------------
// 9. Proxy Pool Management (Tab 3)
// -------------------------------------------------------------
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function fetchProxies() {
  if (!authToken) return;
  try {
    const res = await fetch('/api/proxies', {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const data = await res.json();
    if (data.success && Array.isArray(data.proxies)) {
      availableProxies = data.proxies;
      renderProxyTable();
      updateProxyDropdowns();
    }
  } catch (err) {
    console.error('Failed to fetch proxies:', err);
  }
}

function updateProxyDropdowns() {
  const selects = [cfgProxySelect, newBotProxy].filter(Boolean);

  selects.forEach(sel => {
    const currentValue = sel.value;
    sel.innerHTML = `
      <option value="direct">Direct Connection (Server IP / No Proxy)</option>
      <option value="random">Random Proxy from Pool</option>
    `;

    if (availableProxies.length > 0) {
      const optgroup = document.createElement('optgroup');
      optgroup.label = 'Proxy Pool';
      availableProxies.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = `🛡️ ${p.name} (${p.host}:${p.port})`;
        optgroup.appendChild(opt);
      });
      sel.appendChild(optgroup);
    }

    if (currentValue) {
      sel.value = currentValue;
    }
  });
}

function renderProxyTable() {
  if (!proxyTableBody) return;
  proxyTableBody.innerHTML = '';

  if (availableProxies.length === 0) {
    if (emptyProxyState) emptyProxyState.style.display = 'block';
    if (proxyTableBody.closest('.table-responsive')) {
      proxyTableBody.closest('.table-responsive').style.display = 'none';
    }
    return;
  }

  if (emptyProxyState) emptyProxyState.style.display = 'none';
  if (proxyTableBody.closest('.table-responsive')) {
    proxyTableBody.closest('.table-responsive').style.display = 'block';
  }

  availableProxies.forEach(p => {
    const tr = document.createElement('tr');
    const result = proxyTestResults[p.id];

    let statusHtml = '<span class="status-dot dot-gray" title="Untested"></span>';
    let pingText = '<span style="color: var(--text-faint);">-</span>';

    if (result) {
      if (result.testing) {
        statusHtml = '<span class="status-dot dot-yellow animate-pulse" title="Testing..."></span>';
        pingText = '<span style="color: var(--warning); font-size: 0.78rem;">Testing...</span>';
      } else if (result.success) {
        statusHtml = '<span class="status-dot dot-green" title="Online"></span>';
        pingText = `<span style="color: var(--primary); font-weight: 600;">${result.latencyMs} ms</span>`;
      } else {
        statusHtml = `<span class="status-dot dot-red" title="${escapeHtml(result.error || 'Connection failed')}"></span>`;
        pingText = `<span style="color: var(--danger); font-size: 0.74rem;" title="${escapeHtml(result.error || 'Failed')}">Failed</span>`;
      }
    }

    tr.innerHTML = `
      <td style="width: 48px; text-align: center;">${statusHtml}</td>
      <td><strong>${escapeHtml(p.name)}</strong></td>
      <td><code>${escapeHtml(p.host)}:${p.port}</code></td>
      <td><span class="badge ${p.hasAuth ? 'badge-primary' : 'badge-ghost'}">${p.hasAuth ? 'Protected' : 'None'}</span></td>
      <td>${pingText}</td>
      <td style="text-align: right;">
        <div class="table-actions" style="justify-content: flex-end;">
          <button type="button" class="btn btn-ghost btn-xs btn-test-proxy" data-id="${p.id}" title="Test proxy connection">⚡ Test</button>
          <button type="button" class="btn btn-danger btn-xs btn-delete-proxy" data-id="${p.id}" title="Delete proxy">Delete</button>
        </div>
      </td>
    `;
    proxyTableBody.appendChild(tr);
  });

  // Attach row action listeners
  proxyTableBody.querySelectorAll('.btn-test-proxy').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      testSingleProxy(id);
    });
  });

  proxyTableBody.querySelectorAll('.btn-delete-proxy').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      deleteSingleProxy(id);
    });
  });
}

async function testSingleProxy(id) {
  proxyTestResults[id] = { testing: true };
  renderProxyTable();

  try {
    const res = await fetch(`/api/proxies/${id}/test`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const data = await res.json();
    proxyTestResults[id] = data;
  } catch (err) {
    proxyTestResults[id] = { success: false, error: err.message };
  }
  renderProxyTable();
}

async function testAllProxies() {
  if (availableProxies.length === 0) return;
  availableProxies.forEach(p => {
    proxyTestResults[p.id] = { testing: true };
  });
  renderProxyTable();

  try {
    const res = await fetch('/api/proxies/test-all', {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const data = await res.json();
    if (data.results && Array.isArray(data.results)) {
      data.results.forEach(r => {
        if (r.id) proxyTestResults[r.id] = r;
      });
    }
  } catch (err) {
    console.error('Test all proxies failed:', err);
  }
  renderProxyTable();
}

async function deleteSingleProxy(id) {
  const p = availableProxies.find(x => x.id === id);
  const name = p ? p.name : 'this proxy';
  if (!confirm(`Delete proxy "${name}" from the pool?`)) return;

  try {
    const res = await fetch(`/api/proxies/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const data = await res.json();
    if (data.success) {
      availableProxies = availableProxies.filter(x => x.id !== id);
      delete proxyTestResults[id];
      renderProxyTable();
      updateProxyDropdowns();
      if (activeBotData) {
        applyBotData(activeBotData, false);
      }
    } else {
      alert('Failed to delete proxy: ' + (data.error || 'Unknown'));
    }
  } catch (err) {
    alert('Network error: ' + err.message);
  }
}

// Quick Import String Parser (supports socks5://user:pass@host:port, host:port:user:pass, host:port)
if (proxyQuickImport) {
  proxyQuickImport.addEventListener('input', () => {
    const raw = proxyQuickImport.value.trim();
    if (!raw) return;

    let clean = raw.replace(/^socks5:\/\//i, '');
    let host = '';
    let port = '1080';
    let user = '';
    let pass = '';

    if (clean.includes('@')) {
      // user:pass@host:port
      const [authPart, hostPart] = clean.split('@');
      if (authPart.includes(':')) {
        [user, pass] = authPart.split(':');
      } else {
        user = authPart;
      }
      if (hostPart.includes(':')) {
        [host, port] = hostPart.split(':');
      } else {
        host = hostPart;
      }
    } else if (clean.split(':').length === 4) {
      // host:port:user:pass
      const parts = clean.split(':');
      host = parts[0];
      port = parts[1];
      user = parts[2];
      pass = parts[3];
    } else if (clean.split(':').length === 2) {
      // host:port
      [host, port] = clean.split(':');
    }

    if (host) newProxyHost.value = host;
    if (port) newProxyPort.value = port;
    if (user) newProxyUser.value = user;
    if (pass) newProxyPass.value = pass;
    if (host && !newProxyName.value) {
      newProxyName.value = `SOCKS5 (${host})`;
    }
  });
}

// Modal: Add Proxy
if (btnOpenAddProxyModal) {
  btnOpenAddProxyModal.addEventListener('click', () => {
    modalAddProxy.style.display = 'flex';
    formAddProxy.reset();
  });
}

if (btnEmptyAddProxy) {
  btnEmptyAddProxy.addEventListener('click', () => {
    modalAddProxy.style.display = 'flex';
    formAddProxy.reset();
  });
}

[btnCloseAddProxyModal, btnCancelAddProxy].forEach(el => {
  if (el) {
    el.addEventListener('click', () => {
      modalAddProxy.style.display = 'none';
    });
  }
});

if (formAddProxy) {
  formAddProxy.addEventListener('submit', async e => {
    e.preventDefault();
    const name = newProxyName.value.trim();
    const host = newProxyHost.value.trim();
    const port = parseInt(newProxyPort.value, 10) || 1080;
    const username = newProxyUser.value.trim();
    const password = newProxyPass.value.trim();

    try {
      const res = await fetch('/api/proxies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ name, host, port, username, password }),
      });

      const data = await res.json();
      if (data.success && data.proxy) {
        modalAddProxy.style.display = 'none';
        formAddProxy.reset();
        availableProxies.push({
          id: data.proxy.id,
          name: data.proxy.name,
          host: data.proxy.host,
          port: data.proxy.port,
          username: data.proxy.username,
          hasAuth: !!(data.proxy.username && data.proxy.password),
          type: 5,
        });
        renderProxyTable();
        updateProxyDropdowns();

        // Automatically test the newly added proxy
        testSingleProxy(data.proxy.id);
      } else {
        alert('Error adding proxy: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      alert('Network error: ' + err.message);
    }
  });
}

if (btnTestAllProxies) {
  btnTestAllProxies.addEventListener('click', testAllProxies);
}

// -------------------------------------------------------------
// 10. Tab Navigation
// -------------------------------------------------------------
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const targetTabId = btn.getAttribute('data-tab');
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

    btn.classList.add('active');
    const targetContent = document.getElementById(targetTabId);
    if (targetContent) targetContent.classList.add('active');
  });
});

// App Start
initApp();
