const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
let currentLevel = LEVELS.info;

function ts() {
  return new Date().toLocaleString("zh-CN", { hour12: false });
}

function fmt(level, tag, ...args) {
  const prefix = `[${ts()}] [${level.toUpperCase()}]`;
  const tagStr = tag ? ` [${tag}]` : "";
  return [prefix + tagStr, ...args];
}

export const logger = {
  setLevel(level) {
    currentLevel = LEVELS[level] ?? LEVELS.info;
  },

  debug(tag, ...args) {
    if (currentLevel <= LEVELS.debug) console.debug(...fmt("debug", tag, ...args));
  },
  info(tag, ...args) {
    if (currentLevel <= LEVELS.info) console.log(...fmt("info", tag, ...args));
  },
  warn(tag, ...args) {
    if (currentLevel <= LEVELS.warn) console.warn(...fmt("warn", tag, ...args));
  },
  error(tag, ...args) {
    if (currentLevel <= LEVELS.error) console.error(...fmt("error", tag, ...args));
  },
};
