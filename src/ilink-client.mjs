import crypto from "node:crypto";
import { logger } from "./logger.mjs";

function randomUin() {
  const uint32 = crypto.randomBytes(4).readUInt32BE(0);
  return Buffer.from(String(uint32), "utf-8").toString("base64");
}

function makeHeaders(token, bodyStr) {
  const headers = {
    "Content-Type": "application/json",
    AuthorizationType: "ilink_bot_token",
    "X-WECHAT-UIN": randomUin(),
  };
  if (bodyStr) {
    headers["Content-Length"] = String(Buffer.byteLength(bodyStr, "utf-8"));
  }
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

export class ILinkClient {
  constructor(config) {
    this.baseUrl = config.base_url;
    this.channelVersion = config.channel_version;
    this.pollTimeoutMs = config.poll_timeout_ms;
    this.apiTimeoutMs = config.api_timeout_ms;
  }

  baseInfo() {
    return { channel_version: this.channelVersion };
  }

  async apiPost(endpoint, payload, token, timeoutMs) {
    const url = new URL(endpoint, this.baseUrl.endsWith("/") ? this.baseUrl : this.baseUrl + "/");
    const bodyStr = JSON.stringify(payload);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs || this.apiTimeoutMs);
    try {
      const res = await fetch(url.toString(), {
        method: "POST",
        headers: makeHeaders(token, bodyStr),
        body: bodyStr,
        signal: controller.signal,
      });
      const text = await res.text();
      if (!res.ok) {
        throw new Error(`${endpoint} HTTP ${res.status}: ${text}`);
      }
      return text ? JSON.parse(text) : {};
    } finally {
      clearTimeout(timer);
    }
  }

  async apiGet(endpoint, token) {
    const url = new URL(endpoint, this.baseUrl.endsWith("/") ? this.baseUrl : this.baseUrl + "/");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.apiTimeoutMs);
    try {
      const res = await fetch(url.toString(), {
        method: "GET",
        headers: makeHeaders(token),
        signal: controller.signal,
      });
      const text = await res.text();
      if (!res.ok) {
        throw new Error(`${endpoint} HTTP ${res.status}: ${text}`);
      }
      return text ? JSON.parse(text) : {};
    } finally {
      clearTimeout(timer);
    }
  }

  async getQrCode() {
    return this.apiGet("ilink/bot/get_bot_qrcode?bot_type=3");
  }

  async getQrCodeStatus(qrcodeKey) {
    return this.apiGet(
      `ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(qrcodeKey)}`
    );
  }

  async getUpdates(token, cursor, baseUrl) {
    const effectiveBase = baseUrl || this.baseUrl;
    const url = new URL(
      "ilink/bot/getupdates",
      effectiveBase.endsWith("/") ? effectiveBase : effectiveBase + "/"
    );
    const payload = {
      get_updates_buf: cursor || "",
      base_info: this.baseInfo(),
    };
    const bodyStr = JSON.stringify(payload);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.pollTimeoutMs);
    try {
      const res = await fetch(url.toString(), {
        method: "POST",
        headers: makeHeaders(token, bodyStr),
        body: bodyStr,
        signal: controller.signal,
      });
      const text = await res.text();
      if (!res.ok) {
        throw new Error(`getupdates HTTP ${res.status}: ${text}`);
      }
      return text ? JSON.parse(text) : {};
    } finally {
      clearTimeout(timer);
    }
  }

  async sendMessage(token, msgBody, baseUrl) {
    const effectiveBase = baseUrl || this.baseUrl;
    return this.apiPost(
      "ilink/bot/sendmessage",
      { ...msgBody, base_info: this.baseInfo() },
      token,
      this.apiTimeoutMs
    );
  }

  async getConfig(token, ilinkUserId, contextToken, baseUrl) {
    const effectiveBase = baseUrl || this.baseUrl;
    return this.apiPost(
      "ilink/bot/getconfig",
      {
        ilink_user_id: ilinkUserId,
        context_token: contextToken,
        base_info: this.baseInfo(),
      },
      token,
      this.apiTimeoutMs
    );
  }

  async sendTyping(token, ilinkUserId, typingTicket, status, baseUrl) {
    const effectiveBase = baseUrl || this.baseUrl;
    return this.apiPost(
      "ilink/bot/sendtyping",
      {
        ilink_user_id: ilinkUserId,
        typing_ticket: typingTicket,
        status,
        base_info: this.baseInfo(),
      },
      token,
      this.apiTimeoutMs
    );
  }

  buildSendTextBody(to, text, contextToken) {
    return {
      msg: {
        from_user_id: "",
        to_user_id: to,
        client_id: `bridge-${crypto.randomUUID()}`,
        message_type: 2,
        message_state: 2,
        context_token: contextToken,
        item_list: [{ type: 1, text_item: { text } }],
      },
    };
  }
}
