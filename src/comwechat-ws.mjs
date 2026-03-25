import WebSocket from "ws";
import crypto from "node:crypto";
import { logger } from "./logger.mjs";
import {
  buildStatusUpdateEvent,
  buildHeartbeatEvent,
  buildApiResponse,
  comWeChatToILinkItems,
} from "./translator.mjs";

/**
 * WebSocket client that connects to Yunzai-Bot's ComWeChat adapter endpoint.
 *
 * One instance per iLink device. Speaks the ComWeChat protocol:
 * - Sends events (meta, message, notice) to Yunzai
 * - Receives API requests (action/params/echo) from Yunzai and dispatches them
 */
export class ComWeChatWsClient {
  constructor(yunzaiConfig, botId) {
    this.host = yunzaiConfig.host;
    this.port = yunzaiConfig.port;
    this.reconnectInterval = yunzaiConfig.reconnect_interval || 5000;
    this.botId = botId;
    this.ws = null;
    this.connected = false;
    this.shouldReconnect = true;
    this.heartbeatTimer = null;
    this.reconnectTimer = null;

    this.onApiRequest = null;
  }

  get tag() {
    return `WS:${this.botId}`;
  }

  get url() {
    return `ws://${this.host}:${this.port}/ComWeChat`;
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
      logger.info(this.tag, "Connected to Yunzai");
      this._sendStatusUpdate();
      this._startHeartbeat();
    });

    ws.on("message", (data) => {
      if (this.ws !== ws) return;
      this._handleMessage(data);
    });

    ws.on("close", (code, reason) => {
      if (this.ws !== ws) return;
      this.connected = false;
      this._stopHeartbeat();
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
    this._stopHeartbeat();
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

  sendEvent(event) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      logger.warn(this.tag, "Cannot send event: not connected");
      return false;
    }
    const data = JSON.stringify(event);
    logger.debug(this.tag, `→ Yunzai: ${data.slice(0, 200)}`);
    this.ws.send(data);
    return true;
  }

  sendApiResponse(echo, retcode, data, message) {
    return this.sendEvent(buildApiResponse(echo, retcode, data, message));
  }

  _sendStatusUpdate() {
    const event = buildStatusUpdateEvent(this.botId);
    this.sendEvent(event);
  }

  _startHeartbeat() {
    this._stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.connected) {
        this.sendEvent(buildHeartbeatEvent(this.botId));
      }
    }, 30000);
  }

  _stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  _scheduleReconnect() {
    if (this.reconnectTimer) return;
    logger.info(this.tag, `Reconnecting in ${this.reconnectInterval}ms...`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, this.reconnectInterval);
  }

  _handleMessage(rawData) {
    let data;
    try {
      data = JSON.parse(rawData.toString());
    } catch (err) {
      logger.error(this.tag, "Failed to parse message:", rawData.toString().slice(0, 200));
      return;
    }

    logger.debug(this.tag, `← Yunzai: ${JSON.stringify(data).slice(0, 200)}`);

    if (!data.action || !data.echo) {
      logger.warn(this.tag, "Unknown message format:", JSON.stringify(data).slice(0, 200));
      return;
    }

    if (this.onApiRequest) {
      this.onApiRequest(data.action, data.params || {}, data.echo);
    }
  }
}
