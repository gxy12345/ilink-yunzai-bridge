import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";
import path from "node:path";
import { logger } from "./logger.mjs";
import { Device } from "./device.mjs";

/**
 * Manages multiple Device instances (ClawBot sessions).
 * Handles device lifecycle, persistence, and lookup.
 */
export class DeviceManager {
  constructor(ilinkClient, yunzaiConfig, dataDir, ilinkConfig) {
    this.ilinkClient = ilinkClient;
    this.yunzaiConfig = yunzaiConfig;
    this.dataDir = dataDir;
    this.ilinkConfig = ilinkConfig || {};
    this.devices = new Map();

    mkdirSync(path.join(dataDir, "accounts"), { recursive: true });
  }

  get tag() {
    return "DeviceManager";
  }

  async initialize() {
    const accountsDir = path.join(this.dataDir, "accounts");
    if (!existsSync(accountsDir)) return;

    const files = readdirSync(accountsDir).filter(
      (f) => f.endsWith(".json") && !f.endsWith(".sync.json")
    );

    for (const file of files) {
      const sessionId = file.replace(".json", "");
      try {
        const data = JSON.parse(readFileSync(path.join(accountsDir, file), "utf-8"));
        if (!data.bot_token) continue;

        logger.info(this.tag, `Restoring device: ${sessionId}`);
        const device = this._createDevice(sessionId);
        const started = await device.start();
        if (started) {
          logger.info(this.tag, `Device ${sessionId} restored successfully`);
        } else {
          logger.warn(this.tag, `Device ${sessionId} needs login`);
        }
      } catch (err) {
        logger.error(this.tag, `Failed to restore ${sessionId}:`, err.message);
      }
    }

    logger.info(this.tag, `Initialized with ${this.devices.size} device(s)`);
  }

  _createDevice(sessionId) {
    const device = new Device(
      this.ilinkClient,
      this.yunzaiConfig,
      this.dataDir,
      sessionId,
      this.ilinkConfig
    );
    this.devices.set(sessionId, device);
    return device;
  }

  async addDevice(sessionId) {
    if (!sessionId) {
      sessionId = `clawbot-${Date.now().toString(36)}`;
    }
    if (this.devices.has(sessionId)) {
      return this.devices.get(sessionId);
    }

    logger.info(this.tag, `Adding new device: ${sessionId}`);
    const device = this._createDevice(sessionId);
    return device;
  }

  getDevice(sessionId) {
    return this.devices.get(sessionId);
  }

  removeDevice(sessionId) {
    const device = this.devices.get(sessionId);
    if (device) {
      device.stop();
      this.devices.delete(sessionId);
      this._deleteAccountFiles(sessionId);
      logger.info(this.tag, `Removed device: ${sessionId}`);
      return true;
    }
    return false;
  }

  _deleteAccountFiles(sessionId) {
    const accountsDir = path.join(this.dataDir, "accounts");
    const tokenFile = path.join(accountsDir, `${sessionId}.json`);
    const syncFile = path.join(accountsDir, `${sessionId}.sync.json`);
    for (const f of [tokenFile, syncFile]) {
      try {
        if (existsSync(f)) unlinkSync(f);
      } catch (err) {
        logger.warn(this.tag, `Failed to delete ${f}: ${err.message}`);
      }
    }
  }

  listDevices() {
    const list = [];
    for (const [id, device] of this.devices) {
      list.push(device.toJSON());
    }
    return list;
  }

  stopAll() {
    for (const [id, device] of this.devices) {
      device.stop();
    }
    logger.info(this.tag, "All devices stopped");
  }

  getStats() {
    let running = 0;
    let needsLogin = 0;
    let stopped = 0;
    for (const [, device] of this.devices) {
      if (device.status === "running") running++;
      else if (device.status === "needs_login") needsLogin++;
      else stopped++;
    }
    return {
      total: this.devices.size,
      running,
      needsLogin,
      stopped,
    };
  }
}
