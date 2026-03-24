import { createServer } from "node:http";
import QRCode from "qrcode";
import { logger } from "./logger.mjs";
import { renderPage } from "./web-page.mjs";

/**
 * HTTP server providing a management web UI and REST API for device management.
 */
export class WebServer {
  constructor(webConfig, deviceManager) {
    this.host = webConfig.host;
    this.port = webConfig.port;
    this.enabled = webConfig.enabled;
    this.deviceManager = deviceManager;
    this.server = null;
  }

  async start() {
    if (!this.enabled) {
      logger.info("WebServer", "Web server disabled");
      return;
    }

    this.server = createServer((req, res) => {
      this._handle(req, res).catch((err) => {
        logger.error("WebServer", "Request error:", err.message);
        this._json(res, 500, { error: err.message });
      });
    });

    await new Promise((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(this.port, this.host, resolve);
    });

    logger.info("WebServer", `Listening on http://${this.host}:${this.port}`);
  }

  async stop() {
    if (!this.server) return;
    const s = this.server;
    this.server = null;
    await new Promise((resolve) => s.close(resolve));
  }

  async _handle(req, res) {
    const url = new URL(req.url || "/", `http://${this.host}:${this.port}`);
    const method = req.method;
    const pathname = url.pathname;

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (method === "OPTIONS") {
      res.statusCode = 204;
      res.end();
      return;
    }

    if (method === "GET" && pathname === "/") {
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(renderPage());
      return;
    }

    if (method === "GET" && pathname === "/api/health") {
      this._json(res, 200, {
        ok: true,
        stats: this.deviceManager.getStats(),
      });
      return;
    }

    if (method === "GET" && pathname === "/api/devices") {
      this._json(res, 200, {
        devices: this.deviceManager.listDevices(),
        stats: this.deviceManager.getStats(),
      });
      return;
    }

    if (method === "POST" && pathname === "/api/devices") {
      const body = await this._readBody(req);
      const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";
      if (!sessionId) {
        this._json(res, 400, { ok: false, error: "Device name is required" });
        return;
      }
      if (this.deviceManager.getDevice(sessionId)) {
        this._json(res, 409, { ok: false, error: `Device "${sessionId}" already exists` });
        return;
      }
      const device = await this.deviceManager.addDevice(sessionId);
      this._json(res, 200, {
        ok: true,
        sessionId: device.sessionId,
        status: device.status,
      });
      return;
    }

    const deviceMatch = pathname.match(/^\/api\/devices\/([^/]+)$/);
    if (deviceMatch && method === "DELETE") {
      const sessionId = decodeURIComponent(deviceMatch[1]);
      const removed = this.deviceManager.removeDevice(sessionId);
      this._json(res, 200, { ok: removed });
      return;
    }

    const loginMatch = pathname.match(/^\/api\/devices\/([^/]+)\/login$/);
    if (loginMatch && method === "POST") {
      const sessionId = decodeURIComponent(loginMatch[1]);
      const device = this.deviceManager.getDevice(sessionId);
      if (!device) {
        this._json(res, 404, { error: "Device not found" });
        return;
      }
      try {
        const result = await device.startQrLogin();
        let qrImageDataUrl = null;
        if (result.qrcodeUrl) {
          qrImageDataUrl = await QRCode.toDataURL(result.qrcodeUrl, {
            width: 300,
            margin: 2,
            color: { dark: "#000000", light: "#ffffff" },
          });
        }
        this._json(res, 200, { ...result, qrImageDataUrl });
      } catch (err) {
        this._json(res, 500, { error: err.message });
      }
      return;
    }

    const qrStatusMatch = pathname.match(/^\/api\/devices\/([^/]+)\/qr-status$/);
    if (qrStatusMatch && method === "GET") {
      const sessionId = decodeURIComponent(qrStatusMatch[1]);
      const device = this.deviceManager.getDevice(sessionId);
      if (!device) {
        this._json(res, 404, { error: "Device not found" });
        return;
      }
      const result = await device.pollQrStatus();
      this._json(res, 200, result);
      return;
    }

    const startMatch = pathname.match(/^\/api\/devices\/([^/]+)\/start$/);
    if (startMatch && method === "POST") {
      const sessionId = decodeURIComponent(startMatch[1]);
      const device = this.deviceManager.getDevice(sessionId);
      if (!device) {
        this._json(res, 404, { error: "Device not found" });
        return;
      }
      const started = await device.start();
      this._json(res, 200, { ok: started, status: device.status });
      return;
    }

    const stopMatch = pathname.match(/^\/api\/devices\/([^/]+)\/stop$/);
    if (stopMatch && method === "POST") {
      const sessionId = decodeURIComponent(stopMatch[1]);
      const device = this.deviceManager.getDevice(sessionId);
      if (!device) {
        this._json(res, 404, { error: "Device not found" });
        return;
      }
      device.stop();
      this._json(res, 200, { ok: true, status: device.status });
      return;
    }

    this._json(res, 404, { error: "Not found" });
  }

  async _readBody(req) {
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    if (chunks.length === 0) return {};
    try {
      return JSON.parse(Buffer.concat(chunks).toString("utf-8"));
    } catch {
      return {};
    }
  }

  _json(res, status, data) {
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.end(JSON.stringify(data, null, 2) + "\n");
  }
}
