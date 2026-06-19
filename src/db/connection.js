"use strict";

const fs = require("fs");
const path = require("path");

const DB_PATH = path.join(__dirname, "../../data/mysql.db");
const ENV_PATH = path.join(__dirname, "../../.env");

function loadEnvFile() {
  if (!fs.existsSync(ENV_PATH)) return;

  const lines = fs.readFileSync(ENV_PATH, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const index = trimmed.indexOf("=");
    if (index === -1) continue;

    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();

    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadEnvFile();

function shouldUsePostgres() {
  return (
    String(process.env.DATABASE_CLIENT || "").toLowerCase() === "postgres" ||
    Boolean(process.env.DATABASE_URL)
  );
}

function normalizeParams(params) {
  if (typeof params === "function") return [];
  if (params === undefined || params === null) return [];
  return Array.isArray(params) ? params : [params];
}

function convertPlaceholders(sql) {
  let index = 0;
  return String(sql).replace(/\?/g, () => `$${++index}`);
}

function translateSql(sql) {
  const text = String(sql).trim();

  if (/^PRAGMA\s+table_info\(([^)]+)\)/i.test(text)) {
    const tableName = text.match(/^PRAGMA\s+table_info\(([^)]+)\)/i)[1];
    return {
      sql: `
        SELECT column_name AS name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = $1
        ORDER BY ordinal_position
      `,
      params: [tableName.replace(/['"`]/g, "")]
    };
  }

  return {
    sql: convertPlaceholders(text)
      .replace(/datetime\('now',\s*\$([0-9]+)\)/gi, "NOW() + ($$$1)::interval")
  };
}

let pgPool = null;

function getPgPool() {
  if (!pgPool) {
    const { Pool } = require("pg");

    pgPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });
  }

  return pgPool;
}

function getDbTarget() {
  if (!shouldUsePostgres()) {
    return `sqlite:${DB_PATH}`;
  }

  try {
    const url = new URL(process.env.DATABASE_URL);
    return `${url.protocol}//${url.username}@${url.hostname}:${url.port || "5432"}${url.pathname}`;
  } catch (_) {
    return "postgres:invalid-url";
  }
}

function explainDatabaseError(err) {
  const message = err?.message || String(err);

  if (/tenant\/user .* not found/i.test(message)) {
    return [
      message,
      "DATABASE_URL pooler khong hop le: Supabase khong tim thay project/user nay.",
      "Copy lai Transaction pooler URI trong Supabase va thay vao .env."
    ].join(" ");
  }

  if (/ENOTFOUND/i.test(message)) {
    return [
      message,
      "Host database khong resolve duoc. Hay kiem tra project ref/host trong DATABASE_URL."
    ].join(" ");
  }

  return message;
}

async function checkDbConnection() {
  if (!shouldUsePostgres()) return { ok: true, target: getDbTarget() };

  try {
    await getPgPool().query("SELECT 1");
    return { ok: true, target: getDbTarget() };
  } catch (err) {
    err.message = explainDatabaseError(err);
    throw err;
  }
}

async function closePgPool() {
  if (!pgPool) return;

  const pool = pgPool;
  pgPool = null;
  await pool.end();
}

class PostgresDb {
  constructor() {
    this.pool = getPgPool();
    this.queue = Promise.resolve();
  }

  _query(sql, params = []) {
    const translated = translateSql(sql);
    const values = translated.params || normalizeParams(params);

    return this.pool.query(translated.sql, values);
  }

  _enqueue(sql, params = []) {
    const task = this.queue.then(() => this._query(sql, params));
    this.queue = task.catch(() => {});
    return task;
  }

  all(sql, params, callback) {
    const cb = typeof params === "function" ? params : callback;
    const values = normalizeParams(params);

    this._enqueue(sql, values)
      .then((result) => cb && cb(null, result.rows))
      .catch((err) => cb && cb(err));

    return this;
  }

  get(sql, params, callback) {
    const cb = typeof params === "function" ? params : callback;
    const values = normalizeParams(params);

    this._enqueue(sql, values)
      .then((result) => cb && cb(null, result.rows[0]))
      .catch((err) => cb && cb(err));

    return this;
  }

  run(sql, params, callback) {
    const cb = typeof params === "function" ? params : callback;
    const values = normalizeParams(params);

    this._enqueue(sql, values)
      .then((result) => {
        const context = {
          changes: result.rowCount || 0,
          lastID: result.rows?.[0]?.id
        };
        cb && cb.call(context, null);
      })
      .catch((err) => cb && cb(err));

    return this;
  }

  prepare(sql) {
    const db = this;
    const pending = [];

    return {
      run(params = [], callback) {
        const cb = typeof params === "function" ? params : callback;
        const values = normalizeParams(params);
        const task = db._enqueue(sql, values)
          .then((result) => {
            cb && cb.call({ changes: result.rowCount || 0 }, null);
          })
          .catch((err) => cb && cb(err));

        pending.push(task);
        return this;
      },
      finalize(callback) {
        Promise.all(pending)
          .then(() => callback && callback(null))
          .catch((err) => callback && callback(err));
      }
    };
  }

  serialize(callback) {
    callback();
  }

  close(callback) {
    this.queue.finally(() => callback && callback());
  }
}

function openDb() {
  if (shouldUsePostgres()) {
    return new PostgresDb();
  }

  const sqlite3 = require("sqlite3").verbose();
  return new sqlite3.Database(DB_PATH);
}

module.exports = {
  openDb,
  DB_PATH,
  shouldUsePostgres,
  getDbTarget,
  checkDbConnection,
  explainDatabaseError,
  closePgPool
};
