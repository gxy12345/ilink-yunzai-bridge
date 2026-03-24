export function renderPage() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>iLink-Yunzai Bridge</title>
  <style>
    :root {
      --bg: #0f1117;
      --surface: #1a1d27;
      --surface-hover: #222632;
      --border: rgba(255,255,255,0.08);
      --text: #e4e4e7;
      --muted: #9ca3af;
      --accent: #6366f1;
      --accent-hover: #818cf8;
      --success: #22c55e;
      --warning: #f59e0b;
      --danger: #ef4444;
      --radius: 16px;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
    }
    .container {
      max-width: 960px;
      margin: 0 auto;
      padding: 24px 16px;
    }
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 20px 24px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      margin-bottom: 20px;
    }
    header h1 {
      font-size: 20px;
      font-weight: 600;
    }
    header .subtitle {
      color: var(--muted);
      font-size: 13px;
      margin-top: 4px;
    }
    .btn {
      border: none;
      border-radius: 10px;
      padding: 10px 20px;
      font: inherit;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .btn:hover { transform: translateY(-1px); }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
    .btn-primary { background: var(--accent); color: #fff; }
    .btn-primary:hover { background: var(--accent-hover); }
    .btn-ghost {
      background: transparent;
      color: var(--muted);
      border: 1px solid var(--border);
    }
    .btn-ghost:hover { background: var(--surface-hover); color: var(--text); }
    .btn-danger { background: var(--danger); color: #fff; }
    .btn-sm { padding: 6px 14px; font-size: 13px; }

    .stats {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      margin-bottom: 20px;
    }
    .stat-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 16px 20px;
    }
    .stat-card .label { color: var(--muted); font-size: 13px; }
    .stat-card .value { font-size: 28px; font-weight: 600; margin-top: 4px; }

    .section {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 24px;
      margin-bottom: 20px;
    }
    .section-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }
    .section-head h2 { font-size: 18px; font-weight: 600; }

    .device-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 12px;
    }
    .device-card {
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 16px;
      transition: border-color 0.15s;
    }
    .device-card:hover { border-color: rgba(255,255,255,0.15); }
    .device-card-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
    }
    .device-card h3 { font-size: 15px; font-weight: 600; }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 500;
    }
    .badge::before {
      content: '';
      width: 6px;
      height: 6px;
      border-radius: 50%;
    }
    .badge-running { background: rgba(34,197,94,0.15); color: var(--success); }
    .badge-running::before { background: var(--success); }
    .badge-login { background: rgba(245,158,11,0.15); color: var(--warning); }
    .badge-login::before { background: var(--warning); }
    .badge-stopped { background: rgba(239,68,68,0.15); color: var(--danger); }
    .badge-stopped::before { background: var(--danger); }
    .badge-idle { background: rgba(156,163,175,0.15); color: var(--muted); }
    .badge-idle::before { background: var(--muted); }

    .device-meta {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 4px 12px;
      font-size: 13px;
      margin-bottom: 12px;
    }
    .device-meta dt { color: var(--muted); }
    .device-meta dd { color: var(--text); word-break: break-all; }
    .device-actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .empty-state {
      text-align: center;
      padding: 40px 20px;
      color: var(--muted);
    }
    .empty-state h3 { font-size: 18px; color: var(--text); margin-bottom: 8px; }

    dialog {
      border: 0;
      padding: 0;
      margin: auto;
      width: min(92vw, 480px);
      border-radius: var(--radius);
      background: var(--surface);
      color: var(--text);
    }
    dialog::backdrop {
      background: rgba(0, 0, 0, 0.6);
      backdrop-filter: blur(4px);
    }
    .modal { padding: 24px; }
    .modal-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }
    .modal-head h2 { font-size: 18px; }
    .close-btn {
      width: 36px;
      height: 36px;
      border: 1px solid var(--border);
      border-radius: 10px;
      background: transparent;
      color: var(--muted);
      font-size: 18px;
      cursor: pointer;
      display: grid;
      place-items: center;
    }
    .close-btn:hover { background: var(--surface-hover); }

    .qr-wrap {
      min-height: 260px;
      display: grid;
      place-items: center;
      border: 1px dashed var(--border);
      border-radius: 12px;
      background: rgba(255,255,255,0.03);
      margin: 16px 0;
    }
    .qr-wrap img {
      width: min(100%, 240px);
      height: auto;
      border-radius: 8px;
    }
    .status-msg {
      padding: 12px 16px;
      border-radius: 10px;
      font-size: 14px;
      line-height: 1.5;
    }
    .status-waiting { background: rgba(99,102,241,0.1); border: 1px solid rgba(99,102,241,0.2); }
    .status-scanned { background: rgba(245,158,11,0.1); border: 1px solid rgba(245,158,11,0.2); }
    .status-confirmed { background: rgba(34,197,94,0.1); border: 1px solid rgba(34,197,94,0.2); }
    .status-expired, .status-failed { background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.2); }
    .status-idle { background: rgba(156,163,175,0.08); border: 1px solid var(--border); }

    .input-group {
      margin-bottom: 16px;
    }
    .input-group label {
      display: block;
      font-size: 13px;
      color: var(--muted);
      margin-bottom: 6px;
    }
    .input-group input {
      width: 100%;
      padding: 10px 14px;
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 10px;
      color: var(--text);
      font: inherit;
      font-size: 14px;
    }
    .input-group input:focus {
      outline: none;
      border-color: var(--accent);
    }

    @media (max-width: 640px) {
      .stats { grid-template-columns: repeat(2, 1fr); }
      .device-grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div>
        <h1>iLink-Yunzai Bridge</h1>
        <div class="subtitle">WeChat ClawBot (iLink) &harr; Yunzai-Bot (ComWeChat)</div>
      </div>
      <button class="btn btn-primary" onclick="openAddModal()">+ Add Device</button>
    </header>

    <div class="stats">
      <div class="stat-card">
        <div class="label">Total Devices</div>
        <div class="value" id="stat-total">0</div>
      </div>
      <div class="stat-card">
        <div class="label">Running</div>
        <div class="value" id="stat-running">0</div>
      </div>
      <div class="stat-card">
        <div class="label">Need Login</div>
        <div class="value" id="stat-login">0</div>
      </div>
      <div class="stat-card">
        <div class="label">Stopped</div>
        <div class="value" id="stat-stopped">0</div>
      </div>
    </div>

    <div class="section">
      <div class="section-head">
        <h2>Devices</h2>
        <button class="btn btn-ghost btn-sm" onclick="refreshAll()">Refresh</button>
      </div>
      <div id="device-list" class="device-grid">
        <div class="empty-state">
          <h3>No devices yet</h3>
          <p>Click "Add Device" to connect a WeChat ClawBot instance.</p>
        </div>
      </div>
    </div>
  </div>

  <dialog id="add-modal">
    <div class="modal">
      <div class="modal-head">
        <h2>Add Device</h2>
        <button class="close-btn" onclick="closeModal('add-modal')">&times;</button>
      </div>
      <div class="input-group">
        <label>Device Name <span style="color:var(--danger)">*</span></label>
        <input type="text" id="device-name" placeholder="e.g. my-clawbot-1" required/>
        <div id="device-name-error" style="color:var(--danger);font-size:12px;margin-top:4px;display:none"></div>
      </div>
      <button class="btn btn-primary" style="width:100%" onclick="addDevice()">Create &amp; Generate QR</button>
    </div>
  </dialog>

  <dialog id="qr-modal">
    <div class="modal">
      <div class="modal-head">
        <h2>Scan QR Code</h2>
        <button class="close-btn" onclick="closeQrModal()">&times;</button>
      </div>
      <div id="qr-status" class="status-msg status-idle">Waiting for QR code generation...</div>
      <div id="qr-wrap" class="qr-wrap">
        <span style="color:var(--muted)">Loading...</span>
      </div>
      <div style="margin-top:12px;font-size:13px;color:var(--muted);line-height:1.6">
        Open WeChat &rarr; scan the QR code above &rarr; confirm login.
        After login, the device will auto-connect to Yunzai-Bot.
      </div>
    </div>
  </dialog>

  <script>
    let qrPollTimer = null;
    let activeQrDevice = null;
    let cachedDevices = [];

    function esc(s) {
      return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    async function api(method, path, body) {
      const opts = { method, headers: { 'content-type': 'application/json' } };
      if (body) opts.body = JSON.stringify(body);
      const res = await fetch('/api' + path, opts);
      return res.json();
    }

    function badgeClass(status) {
      if (status === 'running') return 'badge-running';
      if (status === 'needs_login') return 'badge-login';
      if (status === 'stopped') return 'badge-stopped';
      return 'badge-idle';
    }

    function badgeText(status) {
      if (status === 'running') return 'Running';
      if (status === 'needs_login') return 'Need Login';
      if (status === 'stopped') return 'Stopped';
      return status;
    }

    function renderDevices(devices) {
      const el = document.getElementById('device-list');
      if (!devices || devices.length === 0) {
        el.innerHTML = '<div class="empty-state"><h3>No devices yet</h3><p>Click "Add Device" to connect a WeChat ClawBot instance.</p></div>';
        return;
      }
      el.innerHTML = devices.map(d => {
        const bc = badgeClass(d.status);
        const bt = badgeText(d.status);
        const loginTime = d.ilink?.loginTime
          ? new Date(d.ilink.loginTime).toLocaleString('zh-CN', { hour12: false })
          : '-';
        return '<div class="device-card">'
          + '<div class="device-card-head">'
          + '<h3>' + esc(d.sessionId) + '</h3>'
          + '<span class="badge ' + bc + '">' + esc(bt) + '</span>'
          + '</div>'
          + '<dl class="device-meta">'
          + '<dt>Bot ID</dt><dd>' + esc(d.botId || '-') + '</dd>'
          + '<dt>Login</dt><dd>' + esc(loginTime) + '</dd>'
          + '<dt>WS</dt><dd>' + (d.wsConnected ? 'Connected' : 'Disconnected') + '</dd>'
          + '<dt>Contacts</dt><dd>' + (d.ilink?.contextTokenCount || 0) + '</dd>'
          + '</dl>'
          + '<div class="device-actions">'
          + (d.status === 'needs_login' || d.status === 'idle'
            ? '<button class="btn btn-primary btn-sm" onclick="startLogin(\\'' + esc(d.sessionId) + '\\')">Login</button>'
            : '')
          + (d.status === 'running'
            ? '<button class="btn btn-ghost btn-sm" onclick="stopDevice(\\'' + esc(d.sessionId) + '\\')">Stop</button>'
            : '')
          + (d.status === 'stopped'
            ? '<button class="btn btn-ghost btn-sm" onclick="startDevice(\\'' + esc(d.sessionId) + '\\')">Start</button>'
            : '')
          + '<button class="btn btn-ghost btn-sm" onclick="removeDevice(\\'' + esc(d.sessionId) + '\\')">Remove</button>'
          + '</div>'
          + '</div>';
      }).join('');
    }

    function renderStats(stats) {
      document.getElementById('stat-total').textContent = stats.total || 0;
      document.getElementById('stat-running').textContent = stats.running || 0;
      document.getElementById('stat-login').textContent = stats.needsLogin || 0;
      document.getElementById('stat-stopped').textContent = stats.stopped || 0;
    }

    async function refreshAll() {
      const data = await api('GET', '/devices');
      cachedDevices = data.devices || [];
      renderDevices(cachedDevices);
      renderStats(data.stats);
    }

    function openAddModal() {
      document.getElementById('device-name').value = '';
      showNameError('');
      document.getElementById('add-modal').showModal();
    }

    function closeModal(id) {
      document.getElementById(id).close();
    }

    function closeQrModal() {
      if (qrPollTimer) { clearInterval(qrPollTimer); qrPollTimer = null; }
      activeQrDevice = null;
      document.getElementById('qr-modal').close();
      refreshAll();
    }

    function showNameError(msg) {
      const el = document.getElementById('device-name-error');
      if (msg) { el.textContent = msg; el.style.display = 'block'; }
      else { el.textContent = ''; el.style.display = 'none'; }
    }

    async function addDevice() {
      const input = document.getElementById('device-name');
      const name = input.value.trim();
      showNameError('');

      if (!name) {
        showNameError('Device name is required.');
        input.focus();
        return;
      }

      if (cachedDevices && cachedDevices.some(d => d.sessionId === name)) {
        showNameError('A device with this name already exists.');
        input.focus();
        return;
      }

      const data = await api('POST', '/devices', { sessionId: name });
      if (!data.ok) {
        showNameError(data.error || 'Failed to create device.');
        return;
      }

      closeModal('add-modal');
      activeQrDevice = data.sessionId;
      await doLogin(data.sessionId);
    }

    async function startLogin(sessionId) {
      activeQrDevice = sessionId;
      await doLogin(sessionId);
    }

    async function doLogin(sessionId) {
      const qrModal = document.getElementById('qr-modal');
      document.getElementById('qr-wrap').innerHTML = '<span style="color:var(--muted)">Generating QR code...</span>';
      setQrStatus('waiting', 'Requesting QR code...');
      qrModal.showModal();

      const data = await api('POST', '/devices/' + encodeURIComponent(sessionId) + '/login');
      if (data.qrImageDataUrl) {
        document.getElementById('qr-wrap').innerHTML = '<img src="' + esc(data.qrImageDataUrl) + '" alt="QR"/>';
        setQrStatus('waiting', 'Scan the QR code with WeChat to log in.');
        startQrPoll(sessionId);
      } else if (data.qrcodeUrl) {
        document.getElementById('qr-wrap').innerHTML = '<div style="text-align:center;padding:20px"><p style="margin-bottom:12px">QR image generation failed. Open this link manually:</p><a href="' + esc(data.qrcodeUrl) + '" target="_blank" style="color:var(--accent);word-break:break-all">' + esc(data.qrcodeUrl) + '</a></div>';
        setQrStatus('waiting', 'Open the link above to scan QR code.');
        startQrPoll(sessionId);
      } else {
        setQrStatus('failed', data.message || 'Failed to generate QR code.');
      }
    }

    function setQrStatus(status, msg) {
      const el = document.getElementById('qr-status');
      el.className = 'status-msg status-' + status;
      el.textContent = msg;
    }

    function startQrPoll(sessionId) {
      if (qrPollTimer) clearInterval(qrPollTimer);
      qrPollTimer = setInterval(async () => {
        const data = await api('GET', '/devices/' + encodeURIComponent(sessionId) + '/qr-status');
        if (data.status === 'confirmed') {
          setQrStatus('confirmed', 'Login successful! Device is starting...');
          clearInterval(qrPollTimer);
          qrPollTimer = null;
          setTimeout(() => { closeQrModal(); refreshAll(); }, 1500);
        } else if (data.status === 'scanned') {
          setQrStatus('scanned', 'QR scanned. Waiting for confirmation in WeChat...');
        } else if (data.status === 'expired') {
          setQrStatus('expired', 'QR code expired. Please try again.');
          clearInterval(qrPollTimer);
          qrPollTimer = null;
        } else if (data.status === 'error' || data.status === 'failed') {
          setQrStatus('failed', data.message || 'Login failed.');
          clearInterval(qrPollTimer);
          qrPollTimer = null;
        }
      }, 2000);
    }

    async function stopDevice(sessionId) {
      await api('POST', '/devices/' + encodeURIComponent(sessionId) + '/stop');
      refreshAll();
    }

    async function startDevice(sessionId) {
      await api('POST', '/devices/' + encodeURIComponent(sessionId) + '/start');
      refreshAll();
    }

    async function removeDevice(sessionId) {
      if (!confirm('Remove device "' + sessionId + '"?')) return;
      await api('DELETE', '/devices/' + encodeURIComponent(sessionId));
      refreshAll();
    }

    setInterval(refreshAll, 10000);
    refreshAll();
  </script>
</body>
</html>`;
}
