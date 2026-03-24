import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { logger } from "./logger.mjs";

/**
 * Manages a single iLink bot session: QR login, token persistence, long-poll loop.
 * Each session corresponds to one WeChat ClawBot instance.
 */
export class ILinkSession {
  constructor(ilinkClient, dataDir, sessionId) {
    this.client = ilinkClient;
    this.dataDir = dataDir;
    this.sessionId = sessionId || `device-${Date.now()}`;
    this.token = null;
    this.baseUrl = null;
    this.botId = null;
    this.loginTime = null;
    this.cursor = "";
    this.running = false;
    this.abortController = null;
    this.contextTokens = new Map();
    this.typingTickets = new Map();
    this.onMessage = null;
    this.onStatusChange = null;

    this._qrSessionKey = null;
    this._qrCodeUrl = null;
    this._qrKey = null;
    this._qrStatus = "idle";
  }

  get tag() {
    return `iLink:${this.sessionId}`;
  }

  get tokenFilePath() {
    const dir = path.join(this.dataDir, "accounts");
    mkdirSync(dir, { recursive: true });
    return path.join(dir, `${this.sessionId}.json`);
  }

  get cursorFilePath() {
    const dir = path.join(this.dataDir, "accounts");
    mkdirSync(dir, { recursive: true });
    return path.join(dir, `${this.sessionId}.sync.json`);
  }

  loadToken() {
    try {
      if (!existsSync(this.tokenFilePath)) return false;
      const data = JSON.parse(readFileSync(this.tokenFilePath, "utf-8"));
      if (data.bot_token) {
        this.token = data.bot_token;
        this.baseUrl = data.baseurl || null;
        this.botId = data.bot_id || this.sessionId;
        this.loginTime = data.login_time || null;
        return true;
      }
    } catch {}
    return false;
  }

  saveToken() {
    const data = {
      bot_token: this.token,
      baseurl: this.baseUrl || this.client.baseUrl,
      bot_id: this.botId || "",
      login_time: this.loginTime || new Date().toISOString(),
      session_id: this.sessionId,
    };
    writeFileSync(this.tokenFilePath, JSON.stringify(data, null, 2));
    logger.info(this.tag, "Token saved");
  }

  loadCursor() {
    try {
      if (!existsSync(this.cursorFilePath)) return;
      const data = JSON.parse(readFileSync(this.cursorFilePath, "utf-8"));
      if (data.cursor) this.cursor = data.cursor;
    } catch {}
  }

  saveCursor() {
    try {
      writeFileSync(
        this.cursorFilePath,
        JSON.stringify({ cursor: this.cursor, updated: new Date().toISOString() })
      );
    } catch {}
  }

  setContextToken(userId, contextToken) {
    this.contextTokens.set(userId, contextToken);
  }

  getContextToken(userId) {
    return this.contextTokens.get(userId);
  }

  async startQrLogin() {
    logger.info(this.tag, "Starting QR login...");
    this._qrStatus = "waiting";

    try {
      const qrData = await this.client.getQrCode();
      if (!qrData.qrcode_img_content) {
        this._qrStatus = "failed";
        throw new Error("Failed to get QR code: " + JSON.stringify(qrData));
      }

      this._qrCodeUrl = qrData.qrcode_img_content;
      this._qrKey = qrData.qrcode;
      this._qrSessionKey = `qr-${Date.now()}`;

      logger.info(this.tag, `QR code generated, session: ${this._qrSessionKey}`);
      return {
        sessionKey: this._qrSessionKey,
        qrcodeUrl: this._qrCodeUrl,
        status: "waiting",
      };
    } catch (err) {
      this._qrStatus = "failed";
      logger.error(this.tag, "QR code generation failed:", err.message);
      throw err;
    }
  }

  async pollQrStatus() {
    if (!this._qrKey) return { status: "idle" };

    try {
      const statusData = await this.client.getQrCodeStatus(this._qrKey);

      if (statusData.status === "confirmed" || statusData.bot_token) {
        this._qrStatus = "confirmed";
        this.token = statusData.bot_token;
        this.baseUrl = statusData.baseurl || null;
        this.botId = statusData.bot_id || this.sessionId;
        this.loginTime = new Date().toISOString();
        this.saveToken();

        logger.info(this.tag, `Login successful, bot_id: ${this.botId}`);
        return {
          status: "confirmed",
          botId: this.botId,
          connected: true,
        };
      }

      if (statusData.status === "scanned") {
        this._qrStatus = "scanned";
        return { status: "scanned" };
      }

      if (statusData.status === "expired") {
        this._qrStatus = "expired";
        this._qrKey = null;
        return { status: "expired" };
      }

      return { status: "waiting", qrcodeUrl: this._qrCodeUrl };
    } catch (err) {
      logger.error(this.tag, "QR status poll failed:", err.message);
      return { status: "error", message: err.message };
    }
  }

  async startPolling(onMessage) {
    if (this.running) return;
    if (!this.token) {
      if (!this.loadToken()) {
        logger.warn(this.tag, "No token available, cannot start polling");
        return;
      }
    }

    this.loadCursor();
    this.running = true;
    this.onMessage = onMessage;
    logger.info(this.tag, "Starting long-poll loop...");
    this._emitStatus("polling");

    while (this.running) {
      try {
        const data = await this.client.getUpdates(this.token, this.cursor, this.baseUrl);

        if (data.ret && data.ret !== 0) {
          logger.error(this.tag, `getupdates error: ret=${data.ret} errmsg=${data.errmsg || ""}`);
          if (data.errcode === -14) {
            logger.error(this.tag, "Session timeout, need re-login");
            this._emitStatus("session_expired");
            this.running = false;
            return;
          }
          await this._sleep(3000);
          continue;
        }

        if (data.get_updates_buf) {
          this.cursor = data.get_updates_buf;
          this.saveCursor();
        }

        const messages = data.msgs || [];
        for (const msg of messages) {
          if (msg.message_type === 2) continue;
          if (msg.from_user_id?.endsWith("@im.bot")) continue;

          if (msg.context_token && msg.from_user_id) {
            this.setContextToken(msg.from_user_id, msg.context_token);
          }

          try {
            if (this.onMessage) {
              await this.onMessage(msg, this);
            }
          } catch (err) {
            logger.error(this.tag, "Message handler error:", err.message);
          }
        }
      } catch (err) {
        if (err.name === "AbortError") continue;
        logger.error(this.tag, "Poll error:", err.message, "retrying in 3s...");
        await this._sleep(3000);
      }
    }
  }

  stop() {
    this.running = false;
    logger.info(this.tag, "Stopping poll loop");
    this._emitStatus("stopped");
  }

  async sendText(to, text) {
    const contextToken = this.getContextToken(to);
    if (!contextToken) {
      logger.warn(this.tag, `No context_token for ${to}, cannot send`);
      return null;
    }
    const body = this.client.buildSendTextBody(to, text, contextToken);
    return this.client.sendMessage(this.token, body, this.baseUrl);
  }

  async sendILinkMessage(to, itemList) {
    const contextToken = this.getContextToken(to);
    if (!contextToken) {
      logger.warn(this.tag, `No context_token for ${to}, cannot send`);
      return null;
    }
    const body = {
      msg: {
        from_user_id: "",
        to_user_id: to,
        client_id: `bridge-${crypto.randomUUID()}`,
        message_type: 2,
        message_state: 2,
        context_token: contextToken,
        item_list: itemList,
      },
    };
    return this.client.sendMessage(this.token, body, this.baseUrl);
  }

  _emitStatus(status) {
    if (this.onStatusChange) this.onStatusChange(status, this);
  }

  _sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  toJSON() {
    return {
      sessionId: this.sessionId,
      botId: this.botId,
      baseUrl: this.baseUrl,
      loginTime: this.loginTime,
      running: this.running,
      hasToken: !!this.token,
      qrStatus: this._qrStatus,
      contextTokenCount: this.contextTokens.size,
    };
  }
}
