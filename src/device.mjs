import crypto from "node:crypto";
import { logger } from "./logger.mjs";
import { ILinkSession } from "./ilink-session.mjs";
import { ComWeChatWsClient } from "./comwechat-ws.mjs";
import { ilinkToComWeChat, comWeChatToILinkItems } from "./translator.mjs";
import { uploadMediaToCdn, buildImageItem } from "./cdn.mjs";

/**
 * A Device represents one ClawBot instance bridging:
 *   iLink session (WeChat user ↔ iLink HTTP) ←→ ComWeChat WS (Yunzai-Bot)
 *
 * It manages the lifecycle of both sides and translates messages between them.
 */
export class Device {
  constructor(ilinkClient, yunzaiConfig, dataDir, sessionId, ilinkConfig) {
    this.sessionId = sessionId;
    this.ilinkClient = ilinkClient;
    this.ilinkConfig = ilinkConfig || {};
    this.ilinkSession = new ILinkSession(ilinkClient, dataDir, sessionId);
    this.wsClient = null;
    this.yunzaiConfig = yunzaiConfig;
    this.status = "idle";
    this.lastError = null;
    this.ilinkUserId = null;
    // Temporary file store for upload_file → send_message flow
    this.fileStore = new Map();
  }

  get tag() {
    return `Device:${this.sessionId}`;
  }

  get botId() {
    return this.ilinkSession.botId || this.sessionId;
  }

  get isRunning() {
    return this.status === "running";
  }

  async start() {
    if (!this.ilinkSession.loadToken()) {
      logger.warn(this.tag, "No token found, needs QR login first");
      this.status = "needs_login";
      return false;
    }

    logger.info(this.tag, `Starting device, bot_id: ${this.botId}`);
    this.status = "starting";

    this.wsClient = new ComWeChatWsClient(this.yunzaiConfig, this.botId);
    this.wsClient.onApiRequest = (action, params, echo) =>
      this._handleYunzaiApi(action, params, echo);
    this.wsClient.connect();

    await this._waitForConnection(10000);

    this.ilinkSession.onStatusChange = (status) => {
      if (status === "session_expired") {
        this.status = "needs_login";
        this.wsClient?.disconnect();
      }
    };

    this.ilinkSession.startPolling((msg, session) =>
      this._handleILinkMessage(msg, session)
    );

    this.status = "running";
    logger.info(this.tag, "Device started successfully");
    return true;
  }

  stop() {
    logger.info(this.tag, "Stopping device...");
    this.ilinkSession.stop();
    this.wsClient?.disconnect();
    this.wsClient = null;
    this.status = "stopped";
  }

  async startQrLogin() {
    return this.ilinkSession.startQrLogin();
  }

  async pollQrStatus() {
    const result = await this.ilinkSession.pollQrStatus();
    if (result.status === "confirmed") {
      setTimeout(() => this.start(), 500);
    }
    return result;
  }

  async _waitForConnection(timeoutMs) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (this.wsClient?.connected) return;
      await new Promise((r) => setTimeout(r, 200));
    }
    logger.warn(this.tag, "WebSocket connection timeout, proceeding anyway");
  }

  _handleILinkMessage(msg, session) {
    if (msg.from_user_id) {
      this.ilinkUserId = msg.from_user_id;
    }

    const event = ilinkToComWeChat(msg, this.botId, this.sessionId);
    logger.info(
      this.tag,
      `iLink → Yunzai: [${event.detail_type}] ${msg.from_user_id} (as ${this.sessionId}): ${event.alt_message?.slice(0, 80)}`
    );

    if (!this.wsClient?.connected) {
      logger.warn(this.tag, "Yunzai WS not connected, buffering message");
      return;
    }

    this.wsClient.sendEvent(event);
  }

  async _handleYunzaiApi(action, params, echo) {
    logger.debug(this.tag, `Yunzai API: ${action}`, JSON.stringify(params).slice(0, 200));

    try {
      switch (action) {
        case "get_self_info":
          this.wsClient.sendApiResponse(echo, 0, {
            user_id: this.botId,
            user_name: `ClawBot-${this.sessionId}`,
            user_displayname: `ClawBot-${this.sessionId}`,
          });
          break;

        case "get_version":
          this.wsClient.sendApiResponse(echo, 0, {
            impl: "ilink-yunzai-bridge",
            version: "1.0.0",
            onebot_version: "12",
          });
          break;

        case "get_friend_list":
          this.wsClient.sendApiResponse(echo, 0, this._buildFriendList());
          break;

        case "get_group_list":
          this.wsClient.sendApiResponse(echo, 0, []);
          break;

        case "get_group_member_list":
          this.wsClient.sendApiResponse(echo, 0, []);
          break;

        case "get_user_info": {
          const uid = params.user_id || "";
          const displayName = uid === this.sessionId ? this.sessionId : uid;
          this.wsClient.sendApiResponse(echo, 0, {
            user_id: uid,
            user_name: displayName,
            user_displayname: displayName,
          });
          break;
        }

        case "get_group_info":
          this.wsClient.sendApiResponse(echo, 0, {
            group_id: params.group_id || "",
            group_name: params.group_id || "",
          });
          break;

        case "get_group_member_info":
          this.wsClient.sendApiResponse(echo, 0, {
            user_id: params.user_id || "",
            user_name: params.user_id || "",
            group_id: params.group_id || "",
          });
          break;

        case "send_message":
          await this._handleSendMessage(params, echo);
          break;

        case "upload_file":
          await this._handleUploadFile(params, echo);
          break;

        default:
          logger.warn(this.tag, `Unhandled API: ${action}`);
          this.wsClient.sendApiResponse(echo, -1, null, `Unknown action: ${action}`);
      }
    } catch (err) {
      logger.error(this.tag, `API ${action} error:`, err.message);
      this.wsClient.sendApiResponse(echo, -1, null, err.message);
    }
  }

  async _handleSendMessage(params, echo) {
    const yunzaiUserId = params.user_id;
    const message = params.message || [];

    if (!yunzaiUserId) {
      this.wsClient.sendApiResponse(echo, -1, null, "Missing user_id");
      return;
    }

    // Reverse-map: Yunzai sends sessionId as user_id, we need the real iLink user ID
    const realUserId = this._resolveILinkUserId(yunzaiUserId);
    if (!realUserId) {
      logger.warn(this.tag, `Cannot resolve iLink user for "${yunzaiUserId}", no messages received yet`);
      this.wsClient.sendApiResponse(echo, -1, null, "No iLink user mapped yet (wait for first message)");
      return;
    }

    const textParts = [];
    const ilinkItems = [];
    // Collect image file_ids for CDN upload (sent separately after text)
    const imageFileIds = [];

    for (const seg of message) {
      switch (seg.type) {
        case "text": {
          const text = seg.data?.text || "";
          textParts.push(text);
          ilinkItems.push({ type: 1, text_item: { text } });
          break;
        }
        case "image": {
          const fileId = seg.data?.file_id;
          if (fileId && this.fileStore.has(fileId)) {
            imageFileIds.push(fileId);
          } else {
            ilinkItems.push(...comWeChatToILinkItems([seg]));
          }
          break;
        }
        case "file":
        case "wx.emoji":
        case "wx.link":
        case "mention":
        case "mention_all":
          ilinkItems.push(...comWeChatToILinkItems([seg]));
          break;
        default:
          if (seg.data?.text) {
            textParts.push(seg.data.text);
            ilinkItems.push({ type: 1, text_item: { text: seg.data.text } });
          }
      }
    }

    if (ilinkItems.length === 0 && imageFileIds.length === 0) {
      this.wsClient.sendApiResponse(echo, -1, null, "Empty message");
      return;
    }

    const logText = textParts.join("").slice(0, 80) || "[media]";
    logger.info(this.tag, `Yunzai → iLink: [${params.detail_type}] ${yunzaiUserId} → ${realUserId}: ${logText}${imageFileIds.length ? ` +${imageFileIds.length} image(s)` : ""}`);

    try {
      // Send text items first (if any)
      if (ilinkItems.length > 0) {
        await this.ilinkSession.sendILinkMessage(realUserId, ilinkItems);
      }

      // Upload and send each image via CDN
      for (const fileId of imageFileIds) {
        const fileBuffer = this.fileStore.get(fileId);
        if (!fileBuffer) continue;

        logger.info(this.tag, `Uploading image to CDN: ${fileId} (${fileBuffer.length} bytes)`);
        const uploaded = await uploadMediaToCdn({
          fileBuffer,
          toUserId: realUserId,
          token: this.ilinkSession.token,
          ilinkClient: this.ilinkClient,
          baseUrl: this.ilinkSession.baseUrl,
          cdnBaseUrl: this.ilinkConfig.cdn_base_url,
          mediaType: 1,
        });

        const imageItem = buildImageItem(uploaded);
        await this.ilinkSession.sendILinkMessage(realUserId, [imageItem]);
        this.fileStore.delete(fileId);
        logger.info(this.tag, `Image sent successfully: ${fileId}`);
      }

      const msgId = `sent-${crypto.randomUUID().slice(0, 8)}`;
      this.wsClient.sendApiResponse(echo, 0, { message_id: msgId });
    } catch (err) {
      logger.error(this.tag, "Send failed:", err.message);
      this.wsClient.sendApiResponse(echo, -1, null, err.message);
    }
  }

  async _handleUploadFile(params, echo) {
    const fileId = `file-${crypto.randomUUID().slice(0, 12)}`;
    try {
      let buffer = null;

      if (params.type === "data" && params.data) {
        buffer = Buffer.from(params.data, "base64");
      } else if (params.type === "url" && params.url) {
        logger.info(this.tag, `Downloading file from URL: ${params.url.slice(0, 100)}`);
        const res = await fetch(params.url);
        if (!res.ok) throw new Error(`Download failed: ${res.status}`);
        buffer = Buffer.from(await res.arrayBuffer());
      } else if (params.type === "path" && params.path) {
        const { readFileSync } = await import("node:fs");
        buffer = readFileSync(params.path);
      }

      if (!buffer || buffer.length === 0) {
        this.wsClient.sendApiResponse(echo, -1, null, "Empty or unsupported file");
        return;
      }

      this.fileStore.set(fileId, buffer);
      logger.info(this.tag, `File stored: ${fileId} (${buffer.length} bytes, name=${params.name || "?"})`);

      // Auto-clean after 5 minutes to prevent memory leak
      setTimeout(() => this.fileStore.delete(fileId), 5 * 60 * 1000);

      this.wsClient.sendApiResponse(echo, 0, { file_id: fileId });
    } catch (err) {
      logger.error(this.tag, "upload_file failed:", err.message);
      this.wsClient.sendApiResponse(echo, -1, null, err.message);
    }
  }

  /**
   * Maps a Yunzai-facing user_id (which is this.sessionId) back to the real iLink user ID.
   * Also handles the case where Yunzai might send the raw iLink ID directly (fallback).
   */
  _resolveILinkUserId(yunzaiUserId) {
    if (yunzaiUserId === this.sessionId && this.ilinkUserId) {
      return this.ilinkUserId;
    }
    if (this.ilinkSession.contextTokens.has(yunzaiUserId)) {
      return yunzaiUserId;
    }
    return this.ilinkUserId || null;
  }

  _buildFriendList() {
    const friends = [];
    if (this.ilinkUserId) {
      friends.push({
        user_id: this.sessionId,
        user_name: this.sessionId,
        user_displayname: this.sessionId,
        user_remark: "",
      });
    }
    return friends;
  }

  toJSON() {
    return {
      sessionId: this.sessionId,
      botId: this.botId,
      status: this.status,
      wsConnected: this.wsClient?.connected || false,
      ilink: this.ilinkSession.toJSON(),
      lastError: this.lastError,
    };
  }
}
