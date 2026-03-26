function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderInvitePage(deviceId) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>设备绑定 - ${escapeHtml(deviceId)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
      background: #f0f2f5;
      color: #333;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .card {
      background: #fff;
      border-radius: 16px;
      box-shadow: 0 2px 16px rgba(0,0,0,0.08);
      padding: 32px 24px;
      width: 100%;
      max-width: 420px;
    }
    .logo {
      text-align: center;
      margin-bottom: 28px;
    }
    .logo h1 {
      font-size: 20px;
      font-weight: 600;
      color: #1a1a1a;
    }
    .logo .subtitle {
      font-size: 13px;
      color: #999;
      margin-top: 4px;
    }
    .device-info {
      background: #f8f9fa;
      border-radius: 12px;
      padding: 16px;
      margin-bottom: 20px;
    }
    .device-info label {
      font-size: 12px;
      color: #999;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .device-info .device-id {
      font-size: 18px;
      font-weight: 600;
      color: #1a1a1a;
      margin-top: 4px;
      word-break: break-all;
    }
    .instructions {
      background: #fffbe6;
      border: 1px solid #ffe58f;
      border-radius: 12px;
      padding: 16px;
      margin-bottom: 24px;
      font-size: 14px;
      line-height: 1.8;
      color: #614700;
    }
    .instructions strong {
      color: #d48806;
    }
    .btn {
      display: block;
      width: 100%;
      padding: 14px 20px;
      border: none;
      border-radius: 12px;
      font: inherit;
      font-size: 16px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
    }
    .btn:disabled { opacity: 0.6; cursor: not-allowed; }
    .btn-primary { background: #07C160; color: #fff; }
    .btn-primary:hover:not(:disabled) { background: #06ad56; }
    .qr-wrap {
      display: none;
      min-height: 280px;
      place-items: center;
      border: 1px dashed #e0e0e0;
      border-radius: 12px;
      margin: 20px 0;
      background: #fafafa;
    }
    .qr-wrap.visible { display: grid; }
    .qr-wrap img {
      width: min(100%, 260px);
      height: auto;
      border-radius: 8px;
    }
    .status-msg {
      padding: 12px 16px;
      border-radius: 10px;
      font-size: 14px;
      line-height: 1.5;
      margin-top: 16px;
      display: none;
    }
    .status-msg.visible { display: block; }
    .status-waiting { background: #e6f7ff; border: 1px solid #91d5ff; color: #0050b3; }
    .status-scanned { background: #fff7e6; border: 1px solid #ffd591; color: #ad6800; }
    .status-confirmed { background: #f6ffed; border: 1px solid #b7eb8f; color: #389e0d; }
    .status-expired, .status-error { background: #fff1f0; border: 1px solid #ffa39e; color: #cf1322; }
    .success-overlay {
      display: none;
      text-align: center;
      padding: 40px 20px;
    }
    .success-overlay.visible { display: block; }
    .success-overlay .icon { font-size: 56px; margin-bottom: 16px; }
    .success-overlay h2 { font-size: 22px; color: #389e0d; margin-bottom: 8px; }
    .success-overlay p { color: #999; font-size: 14px; }
  </style>
</head>
<body>
  <div class="card">
    <div id="main-content">
      <div class="logo">
        <h1>微信 ClawBot 设备绑定</h1>
        <div class="subtitle">iLink-Yunzai Bridge</div>
      </div>

      <div class="device-info">
        <label>设备 ID</label>
        <div class="device-id">${escapeHtml(deviceId)}</div>
      </div>

      <div class="instructions">
        请更新微信至最新版本，打开 <strong>我</strong> &rarr; <strong>设置</strong> &rarr; <strong>插件</strong> &rarr; <strong>微信Clawbot</strong>，进入详情并点击 <strong>开始扫一扫</strong> 完成扫码绑定
      </div>

      <button id="gen-btn" class="btn btn-primary" onclick="generateQr()">生成二维码</button>

      <div id="qr-wrap" class="qr-wrap">
        <span style="color:#999">正在生成二维码...</span>
      </div>

      <div id="status-msg" class="status-msg"></div>
    </div>

    <div id="success-content" class="success-overlay">
      <div class="icon">&#x2705;</div>
      <h2>绑定成功</h2>
      <p>设备已成功绑定，此链接已失效。</p>
    </div>
  </div>

  <script>
    const pathParts = window.location.pathname.replace(/\\/+$/, '').split('/');
    const token = pathParts[pathParts.length - 1];
    let pollTimer = null;

    async function apiFetch(method, subPath) {
      const res = await fetch('/invite/' + encodeURIComponent(token) + subPath, {
        method,
        headers: { 'content-type': 'application/json' },
      });
      return res.json();
    }

    function showStatus(cls, msg) {
      const el = document.getElementById('status-msg');
      el.className = 'status-msg visible status-' + cls;
      el.textContent = msg;
    }

    function hideStatus() {
      document.getElementById('status-msg').className = 'status-msg';
    }

    async function generateQr() {
      const btn = document.getElementById('gen-btn');
      btn.disabled = true;
      btn.textContent = '生成中...';

      const wrap = document.getElementById('qr-wrap');
      wrap.className = 'qr-wrap visible';
      wrap.innerHTML = '<span style="color:#999">正在生成二维码...</span>';
      hideStatus();

      try {
        const data = await apiFetch('POST', '/login');

        if (data.expired) {
          wrap.className = 'qr-wrap';
          document.getElementById('main-content').style.display = 'none';
          const suc = document.getElementById('success-content');
          suc.querySelector('h2').textContent = '链接已失效';
          suc.querySelector('p').textContent = '该邀请链接已被使用或已过期，请联系管理员获取新的邀请链接。';
          suc.querySelector('.icon').innerHTML = '&#x26A0;&#xFE0F;';
          suc.className = 'success-overlay visible';
          return;
        }

        if (data.qrImageDataUrl) {
          wrap.innerHTML = '<img src="' + data.qrImageDataUrl + '" alt="QR Code"/>';
          showStatus('waiting', '请使用微信扫描上方二维码');
          startPoll();
        } else if (data.error) {
          wrap.className = 'qr-wrap';
          showStatus('error', data.error);
          btn.disabled = false;
          btn.textContent = '重新生成二维码';
        }
      } catch (err) {
        wrap.className = 'qr-wrap';
        showStatus('error', '生成二维码失败，请稍后重试');
        btn.disabled = false;
        btn.textContent = '重新生成二维码';
      }
    }

    function startPoll() {
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = setInterval(async () => {
        try {
          const data = await apiFetch('GET', '/qr-status');
          if (data.status === 'confirmed') {
            clearInterval(pollTimer);
            pollTimer = null;
            showStatus('confirmed', '绑定成功！设备正在启动...');
            setTimeout(() => {
              document.getElementById('main-content').style.display = 'none';
              document.getElementById('success-content').className = 'success-overlay visible';
            }, 1500);
          } else if (data.status === 'scanned') {
            showStatus('scanned', '已扫描，请在微信中确认...');
          } else if (data.status === 'expired') {
            clearInterval(pollTimer);
            pollTimer = null;
            showStatus('expired', '二维码已过期，请重新生成');
            const btn = document.getElementById('gen-btn');
            btn.disabled = false;
            btn.textContent = '重新生成二维码';
          } else if (data.status === 'error') {
            clearInterval(pollTimer);
            pollTimer = null;
            showStatus('error', data.message || '出错了，请重试');
            const btn = document.getElementById('gen-btn');
            btn.disabled = false;
            btn.textContent = '重新生成二维码';
          }
        } catch (e) {
          // silently retry on network errors
        }
      }, 2000);
    }
  </script>
</body>
</html>`;
}

export function renderInviteExpiredPage() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>链接已失效</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f0f2f5;
      color: #333;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .card {
      background: #fff;
      border-radius: 16px;
      box-shadow: 0 2px 16px rgba(0,0,0,0.08);
      padding: 48px 24px;
      width: 100%;
      max-width: 420px;
      text-align: center;
    }
    .icon { font-size: 56px; margin-bottom: 20px; }
    h1 { font-size: 22px; margin-bottom: 12px; color: #1a1a1a; }
    p { font-size: 14px; color: #999; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">&#x26A0;&#xFE0F;</div>
    <h1>链接已失效</h1>
    <p>该邀请链接已被使用或已过期，<br/>请联系管理员获取新的邀请链接。</p>
  </div>
</body>
</html>`;
}
