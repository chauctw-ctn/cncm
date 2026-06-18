"use strict";

const mqtt = require("mqtt");

const DEFAULT_CONFIG = {
  host: process.env.MQTT_HOST || "14.225.252.85",
  port: process.env.MQTT_PORT || "1883",
  topic: process.env.MQTT_TOPIC || "telemetry",
  tzOffsetMinutes: Number.isNaN(Number(process.env.MQTT_TZ_OFFSET_MINUTES))
    ? 420
    : Number(process.env.MQTT_TZ_OFFSET_MINUTES)
};

const TAG_PARAMETER_MAP = {
  MUCNUOC: "level",
  LUULUONG: "flow",
  TONGLUULUONG: "totalIndex"
};

function normalizeMetricValue(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isNaN(value) ? null : value;

  // Xử lý chuỗi số và loại bỏ khoảng trắng
  const cleaned = String(value).replace(/,/g, "").trim();
  const numericValue = Number(cleaned);
  return Number.isNaN(numericValue) ? null : numericValue;
}

function normalizeTimezoneOffset(value) {
  return value.replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
}

function formatTimestampWithOffset(ts, offsetMinutes) {
  if (!ts) return null;

  const normalized = normalizeTimezoneOffset(String(ts).trim());
  const parsed = new Date(normalized);

  if (Number.isNaN(parsed.getTime())) return null;

  const adjusted = new Date(parsed.getTime() + offsetMinutes * 60 * 1000);
  const pad = (value) => String(value).padStart(2, "0");

  return [
    adjusted.getUTCFullYear(),
    pad(adjusted.getUTCMonth() + 1),
    pad(adjusted.getUTCDate())
  ].join("-") + " " + [
    pad(adjusted.getUTCHours()),
    pad(adjusted.getUTCMinutes()),
    pad(adjusted.getUTCSeconds())
  ].join(":");
}

function safeParseJson(text) {
  try {
    return JSON.parse(text);
  } catch (_) {
    return null;
  }
}

function parsePayloadText(text) {
  if (typeof text !== "string") return null;

  const candidates = [text.trim()];
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");

  if (start >= 0 && end > start) {
    candidates.push(text.slice(start, end + 1));
  }

  const braceMatch = text.match(/{[\s\S]*}/);
  if (braceMatch) {
    candidates.push(braceMatch[0]);
  }

  for (const candidate of candidates) {
    const cleaned = candidate.replace(/[\u0000-\u001F\u007F]/g, "");

    const parsed = safeParseJson(cleaned);
    if (parsed) return parsed;

    const sanitized = cleaned.replace(/-?nan/gi, "null");
    const sanitizedParsed = safeParseJson(sanitized);
    if (sanitizedParsed) return sanitizedParsed;
  }

  return null;
}

function parseTelemetryPayload(payload, options = {}) {
  const config = { ...DEFAULT_CONFIG, ...options };

  if (!payload || !Array.isArray(payload.d)) {
    return [];
  }

  // Khởi tạo data_ts từ mốc thời gian của thiết bị bắn lên Broker
  const formattedTs =
    formatTimestampWithOffset(payload.ts, config.tzOffsetMinutes) || payload.ts;

  const stations = new Map();

  payload.d.forEach((item) => {
    if (!item || !item.tag) return;

    const tag = String(item.tag);
    const parts = tag.split("_");

    if (parts.length < 2) return;

    const metricKey = parts[parts.length - 1].toUpperCase();
    const parameter = TAG_PARAMETER_MAP[metricKey];

    if (!parameter) return;

    const value = normalizeMetricValue(item.value);
    if (value === null) return;

    const stationId = parts.slice(0, -1).join("").toLowerCase();
    if (!stationId) return;

    const station = stations.get(stationId) || {
      mqtt_id: stationId,
      ts: formattedTs // Gán vào khóa chuỗi .ts để index.js và writer.js đồng bộ bóc tách sang data_ts
    };

    station[parameter] = value;
    stations.set(stationId, station);
  });

  return Array.from(stations.values());
}

function connect(options = {}) {
  const config = { ...DEFAULT_CONFIG, ...options };
  const url = `mqtt://${config.host}:${config.port}`;

  return mqtt.connect(url, {
    clean: true,
    connectTimeout: 10000,
    reconnectPeriod: 3000
  });
}

function subscribe(client, options = {}) {
  const config = { ...DEFAULT_CONFIG, ...options };

  client.subscribe(config.topic, { qos: 0 }, (err) => {
    if (err) {
      console.error("[MQTT] Subscribe error:", err.message || err);
      return;
    }
  });
}

function onMessage(client, callback, options = {}) {
  client.on("message", (topic, payload) => {
    const text = payload.toString("utf8");
    const parsed = parsePayloadText(text);
    if (!parsed) return;
    
    const stationPayloads = parseTelemetryPayload(parsed, options);
    
    console.log(`[MQTT][DATA]:${JSON.stringify(stationPayloads)}`);    
    
    if (typeof callback === "function" && stationPayloads.length > 0) {
      callback(stationPayloads, topic);
    }
  });
}

module.exports = {
  connect,
  subscribe,
  onMessage,
  parsePayloadText,
  parseTelemetryPayload
};