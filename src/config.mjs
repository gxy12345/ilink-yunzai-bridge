import { readFileSync, existsSync } from "node:fs";
import { parse as parseYaml } from "yaml";

const DEFAULTS = {
  yunzai: {
    host: "127.0.0.1",
    port: 2536,
    reconnect_interval: 5000,
  },
  ilink: {
    base_url: "https://ilinkai.weixin.qq.com",
    cdn_base_url: "https://novac2c.cdn.weixin.qq.com/c2c",
    channel_version: "1.0.2",
    poll_timeout_ms: 40000,
    api_timeout_ms: 15000,
  },
  web: {
    enabled: true,
    host: "0.0.0.0",
    port: 3001,
    invite_host: "",
  },
  data_dir: "./data",
  log_level: "info",
};

function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (
      source[key] &&
      typeof source[key] === "object" &&
      !Array.isArray(source[key]) &&
      target[key] &&
      typeof target[key] === "object"
    ) {
      result[key] = deepMerge(target[key], source[key]);
    } else if (source[key] !== undefined) {
      result[key] = source[key];
    }
  }
  return result;
}

export function loadConfig(configPath = "./config.yaml") {
  let userConfig = {};
  if (existsSync(configPath)) {
    const raw = readFileSync(configPath, "utf-8");
    userConfig = parseYaml(raw) || {};
  }
  return deepMerge(DEFAULTS, userConfig);
}
