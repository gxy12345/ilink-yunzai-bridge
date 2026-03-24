import crypto from "node:crypto";
import { createCipheriv } from "node:crypto";
import { logger } from "./logger.mjs";

const CDN_BASE_URL = "https://novac2c.cdn.weixin.qq.com/c2c";
const UPLOAD_MAX_RETRIES = 3;

function encryptAesEcb(plaintext, key) {
  const cipher = createCipheriv("aes-128-ecb", key, null);
  return Buffer.concat([cipher.update(plaintext), cipher.final()]);
}

function aesEcbPaddedSize(plaintextSize) {
  return Math.ceil((plaintextSize + 1) / 16) * 16;
}

/**
 * Full CDN upload pipeline for iLink:
 *   1. getuploadurl → upload_param
 *   2. AES-ECB encrypt → POST to CDN → x-encrypted-param
 *   3. Returns info needed for sendmessage image_item
 *
 * @param {object} params
 * @param {Buffer} params.fileBuffer - Raw image bytes
 * @param {string} params.toUserId - iLink recipient user_id
 * @param {string} params.token - iLink bot_token
 * @param {object} params.ilinkClient - ILinkClient instance
 * @param {string} [params.baseUrl] - iLink API base URL override
 * @param {string} [params.cdnBaseUrl] - CDN base URL override
 * @param {number} [params.mediaType=1] - 1=image, 2=video, 3=file
 * @returns {Promise<UploadedInfo>}
 */
export async function uploadMediaToCdn({
  fileBuffer,
  toUserId,
  token,
  ilinkClient,
  baseUrl,
  cdnBaseUrl,
  mediaType = 1,
}) {
  const plaintext = Buffer.isBuffer(fileBuffer) ? fileBuffer : Buffer.from(fileBuffer);
  const rawsize = plaintext.length;
  const rawfilemd5 = crypto.createHash("md5").update(plaintext).digest("hex");
  const filesize = aesEcbPaddedSize(rawsize);
  const filekey = crypto.randomBytes(16).toString("hex");
  const aeskey = crypto.randomBytes(16);

  logger.debug(
    "CDN",
    `upload: rawsize=${rawsize} filesize=${filesize} md5=${rawfilemd5} filekey=${filekey}`
  );

  // Step 1: getuploadurl
  const uploadUrlResp = await ilinkClient.apiPost(
    "ilink/bot/getuploadurl",
    {
      filekey,
      media_type: mediaType,
      to_user_id: toUserId,
      rawsize,
      rawfilemd5,
      filesize,
      no_need_thumb: true,
      aeskey: aeskey.toString("hex"),
      base_info: ilinkClient.baseInfo(),
    },
    token
  );

  const uploadParam = uploadUrlResp.upload_param;
  if (!uploadParam) {
    throw new Error("getuploadurl returned no upload_param: " + JSON.stringify(uploadUrlResp));
  }

  // Step 2: encrypt + POST to CDN
  const ciphertext = encryptAesEcb(plaintext, aeskey);
  const effectiveCdnBase = cdnBaseUrl || CDN_BASE_URL;
  const cdnUrl =
    `${effectiveCdnBase}/upload?encrypted_query_param=${encodeURIComponent(uploadParam)}&filekey=${encodeURIComponent(filekey)}`;

  let downloadParam = null;
  let lastError = null;

  for (let attempt = 1; attempt <= UPLOAD_MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(cdnUrl, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: new Uint8Array(ciphertext),
      });

      if (res.status >= 400 && res.status < 500) {
        const errMsg = res.headers.get("x-error-message") || (await res.text());
        throw new Error(`CDN client error ${res.status}: ${errMsg}`);
      }
      if (res.status !== 200) {
        const errMsg = res.headers.get("x-error-message") || `status ${res.status}`;
        throw new Error(`CDN server error: ${errMsg}`);
      }

      downloadParam = res.headers.get("x-encrypted-param") || null;
      if (!downloadParam) {
        throw new Error("CDN response missing x-encrypted-param header");
      }
      logger.debug("CDN", `upload success on attempt ${attempt}`);
      break;
    } catch (err) {
      lastError = err;
      if (err.message?.includes("client error")) throw err;
      if (attempt < UPLOAD_MAX_RETRIES) {
        logger.warn("CDN", `attempt ${attempt} failed, retrying: ${err.message}`);
      } else {
        logger.error("CDN", `all ${UPLOAD_MAX_RETRIES} attempts failed: ${err.message}`);
      }
    }
  }

  if (!downloadParam) {
    throw lastError || new Error("CDN upload failed");
  }

  return {
    filekey,
    downloadEncryptedQueryParam: downloadParam,
    aeskey: aeskey.toString("hex"),
    fileSize: rawsize,
    fileSizeCiphertext: filesize,
  };
}

/**
 * Build an iLink image_item from upload result, ready for sendmessage item_list.
 */
export function buildImageItem(uploaded) {
  return {
    type: 2,
    image_item: {
      media: {
        encrypt_query_param: uploaded.downloadEncryptedQueryParam,
        aes_key: Buffer.from(uploaded.aeskey).toString("base64"),
        encrypt_type: 1,
      },
      mid_size: uploaded.fileSizeCiphertext,
    },
  };
}
