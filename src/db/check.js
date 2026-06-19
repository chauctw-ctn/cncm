"use strict";

const {
  checkDbConnection,
  closePgPool
} = require("./connection");

async function main() {
  try {
    const result = await checkDbConnection();
    console.log(`[DB] OK: ${result.target}`);
  } catch (err) {
    console.error(`[DB] FAILED: ${err.message || err}`);
    process.exitCode = 1;
  } finally {
    await closePgPool().catch(() => {});
  }
}

main();
