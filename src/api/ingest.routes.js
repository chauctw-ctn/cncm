"use strict";

const express = require("express");
const { writeLoggerPayload } = require("../services/logger-writer");

const router = express.Router();

function checkApiKey(req) {
  const serverKey = process.env.DEVICE_API_KEY || "123456";

  const key =
    req.headers["x-api-key"] ||
    req.body.api_key ||
    req.query.api_key;

  return key === serverKey;
}

router.post("/logger", async (req, res) => {
  try {
    if (!checkApiKey(req)) {
      return res.status(401).json({
        success: false,
        message: "Sai DEVICE_API_KEY"
      });
    }

    const result = await writeLoggerPayload(req.body);

    res.json({
      success: true,
      message: "Đã nhận và lưu dữ liệu logger",
      data: result
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
});

module.exports = router;