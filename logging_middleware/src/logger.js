"use strict";

const axios = require("axios");

const LOG_API_URL = process.env.LOG_API_URL || "http://4.224.186.213/evaluation-service/logs";
const LOG_API_TOKEN = process.env.LOG_API_TOKEN || "";

function assertLowercase(value, field) {
  if (typeof value !== "string") {
    throw new TypeError(`[Logger] "${field}" must be a string, received ${typeof value}`);
  }
  if (value !== value.toLowerCase()) {
    throw new TypeError(`[Logger] "${field}" must be lowercase. Received: "${value}"`);
  }
  if (value.trim() === "") {
    throw new TypeError(`[Logger] "${field}" must not be empty.`);
  }
}

const LEVEL_CONSOLE_MAP = {
  debug: "debug",
  info: "info",
  warning: "warn",
  error: "error",
  fatal: "error",
};

async function Log(stack, level, pkg, message) {
  assertLowercase(stack, "stack");
  assertLowercase(level, "level");
  assertLowercase(pkg, "package");

  if (typeof message !== "string") {
    throw new TypeError(`[Logger] "message" must be a string, received ${typeof message}`);
  }

  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] [${stack.toUpperCase()}] [${level.toUpperCase()}] [${pkg}] ${message}`;

  const consoleFn = LEVEL_CONSOLE_MAP[level] || "log";
  console[consoleFn](logLine);

  const payload = {
    stack,
    level,
    package: pkg,
    message: message.length > 48 ? message.slice(0, 48) : message,
  };

  try {
    await axios.post(LOG_API_URL, payload, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LOG_API_TOKEN}`,
      },
      timeout: 5000,
    });
  } catch (err) {
    const reason = err.response
      ? `HTTP ${err.response.status} — ${JSON.stringify(err.response.data)}`
      : err.message;
    console.error(`[Logger] ⚠️  Failed to forward log to evaluation server: ${reason}`);
  }
}

module.exports = { Log };
