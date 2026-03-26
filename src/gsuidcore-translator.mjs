import crypto from "node:crypto";

/**
 * Translates between iLink protocol messages and gsuid_core protocol messages.
 *
 * gsuid_core MessageReceive:
 *   { bot_id, bot_self_id, msg_id, user_type, group_id, user_id, sender, user_pm, content }
 *   content: [{ type: "text"|"image"|"at"|"reply"|"file"|"record"|"video", data: ... }]
 *
 * gsuid_core MessageSend:
 *   { bot_id, bot_self_id, msg_id, target_type, target_id, content }
 *   content: [{ type, data }] where image data is "base64://..." or "link://url"
 */

/**
 * Convert an iLink message to a gsuid_core MessageReceive.
 */
export function ilinkToGsuidCore(ilinkMsg, gsBotId, botSelfId, displayUserId) {
  const content = [];
  let rawText = "";

  for (const item of ilinkMsg.item_list || []) {
    switch (item.type) {
      case 1: {
        const text = item.text_item?.text || "";
        content.push({ type: "text", data: text });
        rawText += text;
        break;
      }
      case 2: {
        const url = item.image_item?.url || "";
        if (url) {
          content.push({ type: "image", data: `link://${url}` });
        }
        break;
      }
      case 3: {
        const url = item.voice_item?.url || "";
        if (url) {
          content.push({ type: "record", data: `link://${url}` });
        }
        break;
      }
      case 4: {
        const fileItem = item.file_item || {};
        const name = fileItem.name || "file";
        const url = fileItem.url || "";
        if (url) {
          content.push({ type: "file", data: `${name}|link://${url}` });
        }
        break;
      }
      case 5: {
        const url = item.video_item?.url || "";
        if (url) {
          content.push({ type: "video", data: `link://${url}` });
        }
        break;
      }
      default:
        break;
    }
  }

  if (content.length === 0) {
    content.push({ type: "text", data: rawText || "" });
  }

  return {
    bot_id: gsBotId,
    bot_self_id: botSelfId,
    msg_id: `ilink-${crypto.randomUUID().slice(0, 8)}`,
    user_type: "direct",
    group_id: null,
    user_id: displayUserId || ilinkMsg.from_user_id || "",
    sender: {
      nickname: displayUserId || ilinkMsg.from_user_id || "",
    },
    user_pm: 3,
    content,
  };
}

/**
 * Convert a gsuid_core MessageSend content list into iLink item_list.
 * Returns { ilinkItems, imageBuffers } where imageBuffers need CDN upload.
 */
export function gsuidCoreSendToILinkItems(contentList) {
  const ilinkItems = [];
  const imagePayloads = [];

  for (const msg of contentList || []) {
    if (!msg || !msg.type) continue;

    switch (msg.type) {
      case "text": {
        const text = typeof msg.data === "string" ? msg.data : "";
        if (text) {
          ilinkItems.push({ type: 1, text_item: { text } });
        }
        break;
      }
      case "image": {
        const data = typeof msg.data === "string" ? msg.data : "";
        if (data.startsWith("base64://")) {
          imagePayloads.push({ source: "base64", data: data.slice(9) });
        } else if (data.startsWith("link://")) {
          imagePayloads.push({ source: "url", data: data.slice(7) });
        } else if (data.startsWith("http")) {
          imagePayloads.push({ source: "url", data });
        } else if (data) {
          imagePayloads.push({ source: "base64", data });
        }
        break;
      }
      case "node": {
        if (Array.isArray(msg.data)) {
          const nested = gsuidCoreSendToILinkItems(msg.data);
          ilinkItems.push(...nested.ilinkItems);
          imagePayloads.push(...nested.imagePayloads);
        }
        break;
      }
      case "at":
      case "reply":
      case "buttons":
      case "template_buttons":
      case "markdown":
      case "template_markdown":
      case "image_size":
        break;
      case "record":
      case "video":
      case "file":
        break;
      default:
        if (typeof msg.data === "string" && msg.data) {
          ilinkItems.push({ type: 1, text_item: { text: msg.data } });
        }
    }
  }

  return { ilinkItems, imagePayloads };
}
