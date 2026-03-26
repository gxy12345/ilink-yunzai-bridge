import WebSocket from "ws";
import { logger } from "./logger.mjs";

/**
 * WebSocket client that connects to gsuid_core's endpoint.
 *
 * gsuid_core protocol:
 * - Endpoint:  ws://host:port/ws/{bot_id}?token=xxx
 * - Upstream:  MessageReceive (JSON bytes via send)
 * - Downstream: MessageSend   (JSON bytes received)
 *
 * Unlike ComWeChat, gsuid_core has no action/echo API model.
 * It only has: push events upstream → receive reply messages downstream.
 */
export class GsuidCoreWsClient {
  constructor(backendConfig, botId) {
    this.backendName = backendConfig.name || "gsuid-core";
    this.host = backendConfig.host;
    this.port = backendConfig.port;
    this.gsBotId = backendConfig.bot_id || "wechat";
    this.token = backendConfig.token || "";
    this.reconnectInterval = backendConfig.reconnect_interval || 5000;
    this.botId = botId;
    this.ws = null;
    this.connected = false;
    this.shouldReconnect = true;
    this.reconnectTimer = null;

    /** Called when gsuid_core sends a MessageSend reply */
    this.onSendMessage = null;
  }

  get tag() {
    return `GS:${this.botId}@${this.backendName}`;
  }

  get url() {
    const base = `ws://${this.host}:${this.port}/ws/${encodeURIComponent(this.gsBotId)}`;
    return this.token ? `${base}?token=${encodeURIComponent(this.token)}` : base;
  }

  connect() {
    if (this.ws) return;
    this.shouldReconnect = true;

    logger.info(this.tag, `Connecting to ${this.url}`);
    const ws = new WebSocket(this.url);
    this.ws = ws;

    ws.on("open", () => {
      if (this.ws !== ws) {
        ws.close();
        return;
      }
      this.connected = true;
      logger.info(this.tag, "Connected to gsuid_core");
    });

    ws.on("message", (data) => {
      if (this.ws !== ws) return;
      this._handleMessage(data);
    });

    ws.on("close", (code, reason) => {
      if (this.ws !== ws) return;
      this.connected = false;
      logger.warn(this.tag, `Disconnected: ${code} ${reason}`);
      this.ws = null;
      if (this.shouldReconnect) {
        this._scheduleReconnect();
      }
    });

    ws.on("error", (err) => {
      logger.error(this.tag, "WebSocket error:", err.message);
    });
  }

  disconnect() {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    const ws = this.ws;
    this.ws = null;
    this.connected = false;
    if (ws) {
      try { ws.close(); } catch {}
    }
  }

  /**
   * Send a MessageReceive object to gsuid_core.
   * gsuid_core expects bytes (msgspec JSON), which is equivalent to JSON bytes.
   */
  sendEvent(messageReceive) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      logger.warn(this.tag, "Cannot send event: not connected");
      return false;
    }
    const buf = Buffer.from(JSON.stringify(messageReceive));
    logger.debug(this.tag, `→ gsuid_core: ${buf.toString().slice(0, 200)}`);
    this.ws.send(buf);
    return true;
  }

  _scheduleReconnect() {
    if (this.reconnectTimer) return;
    logger.info(this.tag, `Reconnecting in ${this.reconnectInterval}ms...`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, this.reconnectInterval);
  }

  /**
   * gsuid_core sends MessageSend as JSON bytes.
   */
  _handleMessage(rawData) {
    let data;
    try {
      data = JSON.parse(rawData.toString());
    } catch (err) {
      logger.error(this.tag, "Failed to parse message:", rawData.toString().slice(0, 200));
      return;
    }

    logger.debug(this.tag, `← gsuid_core: ${JSON.stringify(data).slice(0, 300)}`);

    if (this.onSendMessage) {
      this.onSendMessage(data);
    }
  }
}
