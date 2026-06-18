"use strict";

const axios = require("axios");

async function sendTelegramMessage({ botToken, chatId, text }) {
  if (!botToken || !chatId || !text) {
    throw new Error("Thiếu botToken, chatId hoặc text");
  }

  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

  const res = await axios.post(url, {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true
  });

  return res.data;
}

module.exports = { sendTelegramMessage };