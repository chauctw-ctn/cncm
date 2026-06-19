"use strict";

const express = require("express");
const path = require("path");

const { saveLoggerPayloads, processNdjson } = require("./src/db/logger-writer");

const mqttClient = require("./src/sources/mqtt/client");
const scadaClient = require("./src/sources/scada/client");
const tvaClient = require("./src/sources/tva/client");
const monreClient = require("./src/sources/monre/client");
const ingestRoutes = require("./src/api/ingest.routes");

const loggerApi = require("./src/api/logger");

const { startAlertChecker } = require("./src/services/alert-checker");
const { checkDbConnection, closePgPool } = require("./src/db/connection");

const app = express();

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");
const DB_PATH = path.join(__dirname, "data/mysql.db");

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use("/api/ingest", ingestRoutes);
app.use("/api/logger", require("./src/api/logger"));
app.use(express.static(PUBLIC_DIR));

app.use("/api/logger", loggerApi);

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "Server is running",
    time: new Date().toISOString()
  });
});

function savePayloads(payloads, sourceName) {
  if (!Array.isArray(payloads) || payloads.length === 0) return;

  saveLoggerPayloads(payloads, { dbPath: DB_PATH })
    .then((result) => {
      if (!result.success) {
        console.error(`[${sourceName}][SAVE ERROR]`, result.error);
        return;
      }

      console.log(
        `[${sourceName}][SAVE] loggers=${result.loggers}, inserted=${result.inserted}`
      );
    })
    .catch((err) => {
      console.error(`[${sourceName}][SAVE ERROR]`, err.message || err);
    });
}

function startMqttService() {
  try {
    console.log("[MQTT] Starting");
    const client = mqttClient.connect();

    client.on("connect", () => {
      console.log("[MQTT] Connected");
      mqttClient.subscribe(client);
    });

    client.on("reconnect", () => {
      console.log("[MQTT] Reconnecting...");
    });

    client.on("error", (err) => {
      console.error("[MQTT] Error:", err.message || err);
    });

    mqttClient.onMessage(client, (payloads) => {
      savePayloads(payloads, "MQTT");
    });

    return client;
  } catch (err) {
    console.error("[MQTT] Start failed:", err.message || err);
    return null;
  }
}

function startScadaService() {
  try {
    const intervalMs = Number(process.env.SCADA_INTERVAL_MS) || 60000;
    console.log(`[SCADA] Starting, interval=${intervalMs}ms`);

    const timer = scadaClient.startPolling(
      (payloads) => {
        savePayloads(payloads, "SCADA");
      },
      intervalMs,
      {
        source: "scada"
      }
    );

    console.log(`[SCADA] Polling every ${intervalMs}ms`);
    return timer;
  } catch (err) {
    console.error("[SCADA] Start failed:", err.message || err);
    return null;
  }
}

function startTvaService() {
  try {
    const fetchIntervalMs = Number(process.env.TVA_FETCH_INTERVAL_MS) || 30000;
    const saveIntervalMinutes = Number(process.env.TVA_SAVE_INTERVAL_MINUTES) || 5;
    console.log(`[TVA] Starting, fetchInterval=${fetchIntervalMs}ms, saveInterval=${saveIntervalMinutes}m`);

    const jobs = tvaClient.scheduleTVAJobs({
      db: DB_PATH,
      source: "tva",
      fetchIntervalMs,
      saveIntervalMinutes,
      processNdjson: (ndjson, options) => {
        return processNdjson(ndjson, {
          ...options,
          dbPath: DB_PATH
        });
      }
    });

    console.log("[TVA] Jobs started");
    return jobs;
  } catch (err) {
    console.error("[TVA] Start failed:", err.message || err);
    return null;
  }
}

function startMonreService() {
  try {
    const fetchIntervalMs = Number(process.env.MONRE_FETCH_INTERVAL_MS) || 30000;
    const saveIntervalMinutes = Number(process.env.MONRE_SAVE_INTERVAL_MINUTES) || 5;
    console.log(`[MONRE] Starting, fetchInterval=${fetchIntervalMs}ms, saveInterval=${saveIntervalMinutes}m`);

    const jobs = monreClient.scheduleMonreJobs({
      db: DB_PATH,
      source: "monre",
      fetchIntervalMs,
      saveIntervalMinutes,
      processNdjson: (ndjson, options) => {
        return processNdjson(ndjson, {
          ...options,
          dbPath: DB_PATH
        });
      }
    });

    console.log("[MONRE] Jobs started");
    return jobs;
  } catch (err) {
    console.error("[MONRE] Start failed:", err.message || err);
    return null;
  }
}

function startServices() {
  console.log("[SERVICES] Starting...");

  const services = {
    mqtt: startMqttService(),
    scada: startScadaService(),
    tva: startTvaService(),
    monre: startMonreService(),
    alertChecker: startAlertChecker(Number(process.env.ALERT_CHECK_INTERVAL_MS) || 60000)
  };

  console.log("[SERVICES] Started");

  return services;
}

app.use((req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

let services = null;

async function startServer() {
  try {
    const db = await checkDbConnection();
    console.log(`[DB] Connected: ${db.target}`);
  } catch (err) {
    console.error("[DB] Connection failed:", err.message || err);
    process.exitCode = 1;
    await closePgPool().catch(() => {});
    return;
  }

  const server = app.listen(PORT, () => {
    console.log(`[SERVER] http://localhost:${PORT}`);

    services = startServices();
  });

  function shutdown() {
    console.log("[SERVER] Shutting down...");

    if (services?.mqtt) {
      services.mqtt.end(true);
    }

    for (const key of ["scada", "alertChecker"]) {
      if (services?.[key]) clearInterval(services[key]);
    }

    closePgPool().catch(() => {});

    server.close(() => {
      console.log("[SERVER] Closed");
      process.exit(0);
    });
  }

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

startServer();
