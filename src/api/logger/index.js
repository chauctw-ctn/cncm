"use strict";

const express = require("express");

const router = express.Router();

router.use("/points", require("./points.routes"));
router.use("/tags", require("./tags.routes"));
router.use("/readings", require("./readings.routes"));

module.exports = router;