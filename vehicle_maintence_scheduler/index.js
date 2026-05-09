"use strict";

require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });

const express = require("express");
const { Log } = require("../logging_middleware");
const { handleSchedule } = require("./src/routes/schedule");

const app = express();
const PORT = process.env.SCHEDULER_PORT || 4000;

app.use(express.json());

app.use(async (req, _res, next) => {
  await Log("backend", "info", "service", `Incoming request — ${req.method} ${req.originalUrl}`);
  next();
});

app.post("/schedule", handleSchedule);

app.get("/health", async (req, res) => {
  await Log("backend", "info", "handler", "Health check called");
  res.status(200).json({ status: "ok", service: "vehicle-scheduling" });
});

app.use(async (req, res) => {
  await Log("backend", "warning", "service", `Route not found — ${req.method} ${req.originalUrl}`);
  res.status(404).json({ error: "Not Found" });
});

app.use(async (err, req, res, _next) => {
  await Log("backend", "error", "handler", `Unhandled error: ${err.message}`);
  res.status(500).json({ error: "Internal Server Error" });
});

async function bootstrap() {
  try {
    app.listen(PORT, async () => {
      await Log("backend", "info", "service", `Vehicle scheduling started on port ${PORT}`);
    });
  } catch (err) {
    await Log("backend", "fatal", "service", `Failed to start microservice: ${err.message}`);
    process.exit(1);
  }
}

process.on("SIGINT", async () => {
  await Log("backend", "info", "service", "SIGINT — shutting down");
  process.exit(0);
});

bootstrap();
