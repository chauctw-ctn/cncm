"use strict";

const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const DB_PATH = path.join(__dirname, "../../data/mysql.db");

function openDb() {
  return new sqlite3.Database(DB_PATH);
}

module.exports = {
  openDb,
  DB_PATH
};