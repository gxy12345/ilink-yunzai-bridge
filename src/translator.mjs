import crypto from "node:crypto";

const ILINK_MSG_TYPES = { 1: "text", 2: "image", 3: "voice", 4: "file", 5: "video" };

/**
 * Translates between iLink protocol messages and ComWeChat protocol messages.
 *
 * iLink direction: WeChat user → iLink server → this bridge
 * ComWeChat direction: this bridge → Yunzai WebSocket → Yunzai-Bot
 */

/**
 * Convert an iLink message to a ComWeChat event that Yunzai expects.
 * @param {string} [displayUserId] - If provided, replaces from_user_id in the output event.
 */
export function ilinkToComWeChat(ilinkMsg, botId, displayUserId) {
  const messageSegments = [];
  let altMessage = "";

  for (const item of ilinkMsg.item_list || []) {
    switch (item.type) {
      case 1: {
        const text = item.text_item?.text || "";
        messageSegments.push({ type: "text", data: { text } });
        altMessage += text;
        break;
      }
      case 2:
        messageSegments.push({
          type: "image",
          data: { url: item.image_item?.url || "", file_id: item.image_item?.file_id || "" },
        });
        altMessage += "[图片]";
        break;
      case 3:
        messageSegments.push({
          type: "voice",
          data: { url: item.voice_item?.url || "", file_id: item.voice_item?.file_id || "" },
        });
        altMessage += "[语音]";
        break;
      case 4:
        messageSegments.push({
          type: "file",
          data: {
            url: item.file_item?.url || "",
            file_id: item.file_item?.file_id || "",
            name: item.file_item?.name || "",
          },
        });
        altMessage += "[文件]";
        break;
      case 5:
        messageSegments.push({
          type: "video",
          data: { url: item.video_item?.url || "", file_id: item.video_item?.file_id || "" },
        });
        altMessage += "[视频]";
        break;
      default:
        messageSegments.push({ type: "text", data: { text: `[未知类型:${item.type}]` } });
        altMessage += `[未知类型:${item.type}]`;
    }
  }

  if (ilinkMsg.item_list) {
    for (const item of ilinkMsg.item_list) {
      if (item.ref_msg?.message_item?.text_item?.text) {
        messageSegments.unshift({
          type: "reply",
          data: {
            message_id: "",
            user_id: ilinkMsg.from_user_id,
          },
        });
        break;
      }
    }
  }

  return {
    id: botId,
    type: "message",
    detail_type: "private",
    time: Math.floor(Date.now() / 1000),
    self: { user_id: botId },
    user_id: displayUserId || ilinkMsg.from_user_id,
    message_id: `ilink-${crypto.randomUUID().slice(0, 8)}`,
    alt_message: altMessage,
    message: messageSegments,
  };
}

/**
 * Convert ComWeChat message segments (from Yunzai send_message action) to iLink item_list.
 */
export function comWeChatToILinkItems(segments) {
  const items = [];
  for (const seg of segments) {
    switch (seg.type) {
      case "text":
        items.push({ type: 1, text_item: { text: seg.data?.text || String(seg.data || "") } });
        break;
      case "image":
        if (seg.data?.url) {
          items.push({ type: 2, image_item: { url: seg.data.url } });
        } else if (seg.data?.file_id) {
          items.push({ type: 2, image_item: { file_id: seg.data.file_id } });
        }
        break;
      case "file":
        if (seg.data?.url) {
          items.push({ type: 4, file_item: { url: seg.data.url, name: seg.data.name || "" } });
        }
        break;
      default:
        items.push({ type: 1, text_item: { text: seg.data?.text || JSON.stringify(seg) } });
    }
  }
  return items;
}

/**
 * Build the ComWeChat meta/status_update event that triggers Yunzai's connect() flow.
 */
export function buildStatusUpdateEvent(botId) {
  return {
    id: botId,
    type: "meta",
    detail_type: "status_update",
    time: Math.floor(Date.now() / 1000),
    self: { user_id: botId },
    status: {
      good: true,
      bots: [{ self: { user_id: botId } }],
    },
  };
}

/**
 * Build a heartbeat event.
 */
export function buildHeartbeatEvent(botId) {
  return {
    id: botId,
    type: "meta",
    detail_type: "heartbeat",
    time: Math.floor(Date.now() / 1000),
    self: { user_id: botId },
    interval: 30000,
  };
}

/**
 * Build a response to an API request from Yunzai.
 */
export function buildApiResponse(echo, retcode, data, message) {
  return {
    echo,
    retcode: retcode || 0,
    data: data || null,
    message: message || "",
  };
}
