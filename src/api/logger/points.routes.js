"use strict";

const express = require("express");
const { openDb } = require("../../db/connection");

const router = express.Router();

router.get("/", (req, res) => {
  const db = openDb();

  db.all(
    `
    SELECT *
    FROM logger_points
    ORDER BY source, raw_id
    `,
    [],
    (err, rows) => {
      db.close();

      if (err) {
        return res.status(500).json({ success: false, message: err.message });
      }

      res.json({ success: true, data: rows });
    }
  );
});

router.post("/", (req, res) => {
  const {
    logger_id,
    source,
    raw_id,
    name,
    lat,
    lng,
    enabled = 1,
    tags = []
  } = req.body;

  if (!logger_id || !source || !raw_id) {
    return res.status(400).json({
      success: false,
      message: "Thiếu logger_id, source hoặc raw_id"
    });
  }

  const db = openDb();

  db.serialize(() => {
    db.run("BEGIN TRANSACTION");

    db.run(
      `
      INSERT INTO logger_points (
        logger_id, source, raw_id, name, lat, lng, enabled
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(logger_id) DO UPDATE SET
        source = excluded.source,
        raw_id = excluded.raw_id,
        name = excluded.name,
        lat = excluded.lat,
        lng = excluded.lng,
        enabled = excluded.enabled,
        updated_ts = CURRENT_TIMESTAMP
      `,
      [
        logger_id,
        source,
        raw_id,
        name || raw_id.toUpperCase(),
        lat ?? null,
        lng ?? null,
        enabled
      ],
      (err) => {
        if (err) {
          db.run("ROLLBACK");
          db.close();
          return res.status(500).json({ success: false, message: err.message });
        }

        if (!Array.isArray(tags) || tags.length === 0) {
          db.run("COMMIT");
          db.close();
          return res.json({
            success: true,
            message: "Đã lưu logger",
            logger_id
          });
        }

        const stmt = db.prepare(`
          INSERT INTO logger_tags (
            logger_id, tag_key, tag_name, unit, enabled, min_value, max_value, display_order
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(logger_id, tag_key) DO UPDATE SET
            tag_name = excluded.tag_name,
            unit = excluded.unit,
            enabled = excluded.enabled,
            min_value = excluded.min_value,
            max_value = excluded.max_value,
            display_order = excluded.display_order
        `);

        for (const tag of tags) {
          if (!tag.tag_key) continue;

          stmt.run([
            logger_id,
            tag.tag_key,
            tag.tag_name || tag.tag_key,
            tag.unit || "",
            tag.enabled ?? 1,
            tag.min_value ?? null,
            tag.max_value ?? null,
            tag.display_order ?? 0
          ]);
        }

        stmt.finalize((tagErr) => {
          if (tagErr) {
            db.run("ROLLBACK");
            db.close();
            return res.status(500).json({ success: false, message: tagErr.message });
          }

          db.run("COMMIT");
          db.close();

          res.json({
            success: true,
            message: "Đã lưu logger và tags",
            logger_id
          });
        });
      }
    );
  });
});

router.put("/:logger_id", (req, res) => {
  const { logger_id } = req.params;
  const { source, raw_id, name, lat, lng, enabled } = req.body;

  const db = openDb();

  db.run(
    `
    UPDATE logger_points
    SET
      source = COALESCE(?, source),
      raw_id = COALESCE(?, raw_id),
      name = COALESCE(?, name),
      lat = COALESCE(?, lat),
      lng = COALESCE(?, lng),
      enabled = COALESCE(?, enabled),
      updated_ts = CURRENT_TIMESTAMP
    WHERE logger_id = ?
    `,
    [
      source ?? null,
      raw_id ?? null,
      name ?? null,
      lat ?? null,
      lng ?? null,
      enabled ?? null,
      logger_id
    ],
    function (err) {
      db.close();

      if (err) {
        return res.status(500).json({ success: false, message: err.message });
      }

      res.json({
        success: true,
        changed: this.changes
      });
    }
  );
});

router.delete("/:logger_id", (req, res) => {
  const { logger_id } = req.params;
  const db = openDb();

  db.serialize(() => {
    db.run("BEGIN TRANSACTION");

    db.run(`DELETE FROM logger_latest WHERE logger_id = ?`, [logger_id]);
    db.run(`DELETE FROM logger_readings WHERE logger_id = ?`, [logger_id]);
    db.run(`DELETE FROM logger_tags WHERE logger_id = ?`, [logger_id]);

    db.run(
      `DELETE FROM logger_points WHERE logger_id = ?`,
      [logger_id],
      function (err) {
        if (err) {
          db.run("ROLLBACK");
          db.close();
          return res.status(500).json({ success: false, message: err.message });
        }

        db.run("COMMIT");
        db.close();

        res.json({
          success: true,
          deleted: this.changes
        });
      }
    );
  });
});

module.exports = router;