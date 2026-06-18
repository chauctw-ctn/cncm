"use strict";

const express = require("express");
const { openDb } = require("../../db/connection");

const router = express.Router();

router.get("/", (req, res) => {
  const {
    logger_id,
    tag_key,
    source,
    from,
    to,
    limit = 1000
  } = req.query;

  const where = [];
  const params = [];

  if (logger_id) {
    where.push("r.logger_id = ?");
    params.push(logger_id);
  }

  if (tag_key) {
    where.push("r.tag_key = ?");
    params.push(tag_key);
  }

  if (source) {
    where.push("p.source = ?");
    params.push(source);
  }

  if (from) {
    where.push("r.data_ts >= ?");
    params.push(from);
  }

  if (to) {
    where.push("r.data_ts <= ?");
    params.push(to);
  }

  const sql = `
    SELECT
      r.id,
      r.logger_id,
      p.name AS logger_name,
      p.source,
      p.raw_id,
      r.tag_key,
      t.tag_name,
      t.unit,
      r.value,
      r.data_ts,
      r.saved_ts
    FROM logger_readings r
    LEFT JOIN logger_points p
      ON r.logger_id = p.logger_id
    LEFT JOIN logger_tags t
      ON r.logger_id = t.logger_id
     AND r.tag_key = t.tag_key
    ${where.length ? "WHERE " + where.join(" AND ") : ""}
    ORDER BY r.data_ts DESC
    LIMIT ?
  `;

  params.push(Number(limit));

  const db = openDb();

  db.all(sql, params, (err, rows) => {
    db.close();

    if (err) {
      return res.status(500).json({
        success: false,
        message: err.message
      });
    }

    res.json({
      success: true,
      filters: {
        logger_id: logger_id || "all",
        tag_key: tag_key || "all",
        source: source || "all",
        from: from || null,
        to: to || null,
        limit: Number(limit)
      },
      total: rows.length,
      data: rows
    });
  });
});

module.exports = router;