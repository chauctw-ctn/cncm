"use strict";

const { openDb } = require("../db/connection");
const { sendTelegramMessage } = require("./telegram");

function all(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
  });
}

function get(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => err ? reject(err) : resolve(row));
  });
}

function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      err ? reject(err) : resolve(this);
    });
  });
}

async function getSettings(db) {
  const rows = await all(db, `SELECT key, value FROM app_settings`);
  const settings = {};

  rows.forEach(row => {
    settings[row.key] = row.value;
  });

  return settings;
}

function buildAlertText(row, status) {
  const statusText = status === "HIGH" ? "VƯỢT NGƯỠNG CAO" : "THẤP HƠN NGƯỠNG";

  return [
    `🚨 <b>CẢNH BÁO LOGGER</b>`,
    ``,
    `<b>Trạm:</b> ${row.logger_name || row.logger_id}`,
    `<b>Logger ID:</b> ${row.logger_id}`,
    `<b>Tag:</b> ${row.tag_name || row.tag_key}`,
    `<b>Trạng thái:</b> ${statusText}`,
    `<b>Giá trị:</b> ${row.value ?? "--"} ${row.unit || ""}`,
    `<b>Min:</b> ${row.min_value ?? "--"}`,
    `<b>Max:</b> ${row.max_value ?? "--"}`,
    `<b>Thời gian dữ liệu:</b> ${row.data_ts || "--"}`,
    row.message ? `<b>Ghi chú:</b> ${row.message}` : ""
  ].filter(Boolean).join("\n");
}

async function alreadySentRecently(db, loggerId, tagKey, status, cooldownMinutes) {
  const row = await get(
    db,
    `
    SELECT id
    FROM alert_events
    WHERE logger_id = ?
      AND tag_key = ?
      AND status = ?
      AND sent_ts >= datetime('now', ?)
    ORDER BY id DESC
    LIMIT 1
    `,
    [loggerId, tagKey, status, `-${cooldownMinutes} minutes`]
  );

  return !!row;
}

async function saveAlertEvent(db, row, status, message) {
  await run(
    db,
    `
    INSERT INTO alert_events (
      logger_id, tag_key, status, value, message
    )
    VALUES (?, ?, ?, ?, ?)
    `,
    [row.logger_id, row.tag_key, status, row.value, message]
  );
}

async function checkAndSendAlerts() {
  const db = openDb();

  try {
    const settings = await getSettings(db);

    if (settings.telegram_enabled !== "1") {
      return { success: true, skipped: "telegram disabled" };
    }

    const cooldown = Number(settings.telegram_cooldown_minutes || 10);

    const rows = await all(
      db,
      `
      SELECT
        th.logger_id,
        th.tag_key,
        th.min_value,
        th.max_value,
        th.message,

        p.name AS logger_name,
        t.tag_name,
        t.unit,

        l.value,
        l.data_ts
      FROM tag_thresholds th
      LEFT JOIN logger_points p
        ON th.logger_id = p.logger_id
      LEFT JOIN logger_tags t
        ON th.logger_id = t.logger_id
       AND th.tag_key = t.tag_key
      LEFT JOIN logger_latest l
        ON th.logger_id = l.logger_id
       AND th.tag_key = l.tag_key
      WHERE th.warning_enabled = 1
        AND l.value IS NOT NULL
      `
    );

    let sent = 0;

    for (const row of rows) {
      let status = "OK";

      if (row.min_value !== null && row.value < row.min_value) {
        status = "LOW";
      }

      if (row.max_value !== null && row.value > row.max_value) {
        status = "HIGH";
      }

      if (status === "OK") continue;

      const exists = await alreadySentRecently(
        db,
        row.logger_id,
        row.tag_key,
        status,
        cooldown
      );

      if (exists) continue;

      const text = buildAlertText(row, status);

      await sendTelegramMessage({
        botToken: settings.telegram_bot_token,
        chatId: settings.telegram_chat_id,
        text
      });

      await saveAlertEvent(db, row, status, text);

      sent += 1;
    }

    return { success: true, sent };
  } finally {
    db.close();
  }
}

function startAlertChecker(intervalMs = 60000) {
  console.log(`[ALERT] Checker started every ${intervalMs}ms`);

  const runCheck = async () => {
    try {
      const result = await checkAndSendAlerts();

      if (result.sent > 0) {
        console.log(`[ALERT] Telegram sent ${result.sent}`);
      }
    } catch (err) {
      console.error("[ALERT] Failed:", err.message || err);
    }
  };

  runCheck();

  return setInterval(runCheck, intervalMs);
}

module.exports = {
  checkAndSendAlerts,
  startAlertChecker
};