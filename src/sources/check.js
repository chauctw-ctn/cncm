"use strict";

const scada = require("./scada/client");
const tva = require("./tva/client");
const monre = require("./monre/client");

async function checkSource(name, run) {
  try {
    const count = await run();
    console.log(`[${name}] OK: ${count} stations`);
  } catch (err) {
    console.error(`[${name}] FAILED: ${err.message || err}`);
    process.exitCode = 1;
  }
}

async function main() {
  await checkSource("SCADA", async () => {
    const data = await scada.fetchScadaData();
    return data.length;
  });

  await checkSource("TVA", async () => {
    const result = await tva.fetchTVAData();
    return tva.normalizeStations(result.stations).length;
  });

  await checkSource("MONRE", async () => {
    const features = await monre.fetchMonreData();
    return monre.normalizeMonreFeatures(features).length;
  });
}

main();
