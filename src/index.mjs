import path from "node:path";
import { logger } from "./logger.mjs";
import { loadConfig } from "./config.mjs";
import { ILinkClient } from "./ilink-client.mjs";
import { DeviceManager } from "./device-manager.mjs";
import { WebServer } from "./web-server.mjs";

const CONFIG_PATH = process.env.CONFIG_PATH || "./config.yaml";

async function main() {
  console.log("╔════════════════════════════════════════════╗");
  console.log("║   iLink-Yunzai Bridge                      ║");
  console.log("║   WeChat ClawBot (iLink) ↔ Yunzai-Bot      ║");
  console.log("╚════════════════════════════════════════════╝\n");

  const config = loadConfig(CONFIG_PATH);
  logger.setLevel(config.log_level);

  const dataDir = path.resolve(config.data_dir);
  logger.info("Main", `Data directory: ${dataDir}`);
  logger.info("Main", `Backends (${config.backends.length}):`);
  for (const b of config.backends) {
    if (b.type === "gsuidcore") {
      logger.info("Main", `  [${b.name}] (gsuidcore) ws://${b.host}:${b.port}/ws/${b.bot_id || "wechat"}`);
    } else {
      logger.info("Main", `  [${b.name}] (comwechat) ws://${b.host}:${b.port}${b.path || "/ComWeChat"}`);
    }
  }
  logger.info("Main", `iLink base: ${config.ilink.base_url}`);

  const ilinkClient = new ILinkClient(config.ilink);
  const deviceManager = new DeviceManager(ilinkClient, config.backends, dataDir, config.ilink);

  await deviceManager.initialize();

  const webServer = new WebServer(config.web, deviceManager);
  await webServer.start();

  if (config.web.enabled) {
    logger.info("Main", `Web UI: http://${config.web.host}:${config.web.port}`);
  }

  logger.info("Main", "Bridge started. Waiting for devices...");

  const shutdown = async () => {
    logger.info("Main", "Shutting down...");
    deviceManager.stopAll();
    await webServer.stop();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
