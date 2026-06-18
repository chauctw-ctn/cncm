"use strict";

const express = require("express");
const { openDb } = require("../../db/connection");
const { sendTelegramMessage } = require("../../services/telegram");

const router = express.Router();

function all(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
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

router.get("/", async (req, res) => {
  const db = openDb();

  try {
    const settings = await getSettings(db);

    res.json({
      success: true,
      data: {
        telegram_enabled: settings.telegram_enabled || "0",
        telegram_bot_token: settings.telegram_bot_token || "",
        telegram_chat_id: settings.telegram_chat_id || "",
        telegram_cooldown_minutes: settings.telegram_cooldown_minutes || "10"
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  } finally {
    db.close();
  }
});

router.post("/", async (req, res) => {
  const db = openDb();

  try {
    const items = {
      telegram_enabled: String(req.body.telegram_enabled || "0"),
      telegram_bot_token: String(req.body.telegram_bot_token || ""),
      telegram_chat_id: String(req.body.telegram_chat_id || ""),
      telegram_cooldown_minutes: String(req.body.telegram_cooldown_minutes || "10")
    };

    for (const [key, value] of Object.entries(items)) {
      await run(
        db,
        `
        INSERT INTO app_settings (key, value)
        VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          updated_ts = CURRENT_TIMESTAMP
        `,
        [key, value]
      );
    }

    res.json({ success: true, message: "Đã lưu cấu hình Telegram" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  } finally {
    db.close();
  }
});

router.post("/telegram/test", async (req, res) => {
  const db = openDb();

  try {
    const settings = await getSettings(db);

    const text = [
      "✅ <b>Test Telegram</b>",
      "",
      "Hệ thống CAWACO Dashboard gửi test thành công.",
      `Thời gian: ${new Date().toLocaleString("vi-VN")}`
    ].join("\n");

    const result = await sendTelegramMessage({
      botToken: settings.telegram_bot_token,
      chatId: settings.telegram_chat_id,
      text
    });

    res.json({
      success: true,
      message: "Đã gửi test Telegram",
      telegram: result
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  } finally {
    db.close();
  }
});

module.exports = router;