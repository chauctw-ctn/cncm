"use strict";

const express = require("express");

const router = express.Router();

router.use("/points", require("./points.routes"));
router.use("/tags", require("./tags.routes"));
router.use("/readings", require("./readings.routes"));
router.use("/kpis", require("./kpi.routes"));
router.use("/history", require("./history.routes"));
router.use("/thresholds", require("./thresholds.routes"));
router.use("/settings", require("./settings.routes"));

module.exports = router;