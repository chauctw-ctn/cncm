"use strict";

const mqtt = require("mqtt");

const DEFAULT_CONFIG = {
  host: process.env.MQTT_HOST || "14.225.252.85",
  port: process.env.MQTT_PORT || "1883",
  topic: process.env.MQTT_TOPIC || "telemetry",
  source: "mqtt",
  tzOffsetMinutes: Number.isNaN(Number(process.env.MQTT_TZ_OFFSET_MINUTES))
    ? 420
    : Number(process.env.MQTT_TZ_OFFSET_MINUTES)
};

const RAW_LOGGER_STATIONS = {
  g15: { lat: 9.1835, lng: 105.152611 },
  g18: { lat: 9.175669, lng: 105.170509 },
  g29a: { lat: 9.14649, lng: 105.139282 },
  g30a: { lat: 9.165363, lng: 105.157047 },
  g31b: { lat: 9.206425, lng: 105.166463 },

  gs1nm1: { lat: 9.205068, lng: 105.133103 },
  gs1nm2: { lat: 9.205104, lng: 105.131994 },
  gs2nm1: { lat: 9.173416, lng: 105.209793 },
  gs2nm2: { lat: 9.173416, lng: 105.209793 },
  gs3nm1: { lat: 9.205121, lng: 105.132026 },
  gs3nm2: { lat: 9.173283, lng: 105.209918 },
  gs4nm1: { lat: 9.170691, lng: 105.214664 },
  gs4nm2: { lat: 9.204509, lng: 105.128481 },
  gs5nm1: { lat: 9.168239, lng: 105.212727 },

  gtacvan: { lat: 9.163367, lng: 105.251512 },

  qt1nm1: { lat: 9.173508, lng: 105.209793 },
  qt1nm2: { lat: 9.205658, lng: 105.12963 },
  qt2: { lat: 9.179219, lng: 105.139376 },
  qt2nm1: { lat: 9.205197, lng: 105.133057 },
  qt2nm2: { lat: 9.203337, lng: 105.129712 },
  qt3: { lat: 9.178764, lng: 105.162811 },
  qt4: { lat: 9.1815, lng: 105.1488 },
  qt5: { lat: 9.178642, lng: 105.154274 },

  tb1: { lat: 9.177, lng: 105.152 },
  tb2: { lat: 9.241708, lng: 105.134453 },
  tb4: { lat: 9.231647, lng: 105.157951 },
  tb12: { lat: 9.196925, lng: 105.160156 },
  tb16: { lat: 9.181186, lng: 105.088219 },
  tb20: { lat: 9.152653, lng: 105.157631 },
  tb21: { lat: 9.141861, lng: 105.138564 },
  tb22: { lat: 9.130936, lng: 105.135063 },
  tb23: { lat: 9.119739, lng: 105.141647 },
  tb24: { lat: 9.108739, lng: 105.136789 },
  tb25: { lat: 9.100839, lng: 105.133297 },
  tb26: { lat: 9.092956, lng: 105.133219 },
  tb27: { lat: 9.081444, lng: 105.132731 }
};

const TAG_PARAMETER_MAP = {
  MUCNUOC: "level",
  LUULUONG: "flow",
  TONGLUULUONG: "totalIndex"
};

function buildStationId(source, rawId) {
  return `${source}_${String(rawId).toLowerCase()}`;
}

function normalizeMetricValue(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isNaN(value) ? null : value;

  const cleaned = String(value).replace(/,/g, "").trim();
  const numericValue = Number(cleaned);

  return Number.isNaN(numericValue) ? null : numericValue;
}

function normalizeTimezoneOffset(value) {
  return String(value).replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
}

function formatTimestampWithOffset(ts, offsetMinutes) {
  if (!ts) return null;

  const normalized = normalizeTimezoneOffset(String(ts).trim());
  const parsed = new Date(normalized);

  if (Number.isNaN(parsed.getTime())) return null;

  const adjusted = new Date(parsed.getTime() + offsetMinutes * 60 * 1000);
  const pad = (value) => String(value).padStart(2, "0");

  const date = [
    adjusted.getUTCFullYear(),
    pad(adjusted.getUTCMonth() + 1),
    pad(adjusted.getUTCDate())
  ].join("-");

  const time = [
    pad(adjusted.getUTCHours()),
    pad(adjusted.getUTCMinutes()),
    pad(adjusted.getUTCSeconds())
  ].join(":");

  return `${date} ${time}`;
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
  if (braceMatch) candidates.push(braceMatch[0]);

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
  const source = config.source || "mqtt";

  if (!payload || !Array.isArray(payload.d)) return [];

  const formattedTs =
    formatTimestampWithOffset(payload.ts, config.tzOffsetMinutes) || payload.ts;

  const stations = new Map();

  payload.d.forEach((item) => {
    if (!item || !item.tag) return;

    const tag = String(item.tag).trim();
    const parts = tag.split("_");

    if (parts.length < 2) return;

    const metricKey = parts[parts.length - 1].toUpperCase();
    const parameter = TAG_PARAMETER_MAP[metricKey];

    if (!parameter) return;

    const value = normalizeMetricValue(item.value);
    if (value === null) return;

    const rawId = parts.slice(0, -1).join("").toLowerCase();
    if (!rawId) return;

    const stationId = buildStationId(source, rawId);
    const coord = RAW_LOGGER_STATIONS[rawId] || {};

    const station = stations.get(stationId) || {
      source,
      station_id: stationId,
      raw_id: rawId,
      name: rawId.toUpperCase(),
      mqtt_id: rawId,
      ts: formattedTs,
      data_ts: formattedTs,
      lat: coord.lat ?? null,
      lng: coord.lng ?? null
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

    console.log(`[MQTT] Subscribed topic: ${config.topic}`);
  });
}

function onMessage(client, callback, options = {}) {
  client.on("message", (topic, payload) => {
    const text = payload.toString("utf8");
    const parsed = parsePayloadText(text);
    if (!parsed) return;

    const stationPayloads = parseTelemetryPayload(parsed, options);

    if (stationPayloads.length > 0) {
      console.log(`[MQTT][DATA]: ${JSON.stringify(stationPayloads)}`);
    }

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
  parseTelemetryPayload,
  RAW_LOGGER_STATIONS,
  TAG_PARAMETER_MAP,
  buildStationId,
  normalizeMetricValue
};