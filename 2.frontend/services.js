const express = require("express");
const path = require("path");

const app = express();
const PORT = 3000;

app.use(express.static(__dirname));

app.get("/", (req, res) => {
    res.redirect("/page/dashboard.html");
});

app.get("/api/dashboard", (req, res) => {
    res.json({
        totalStations: 12,
        onlineStations: 10,
        offlineStations: 2,
        totalFlow: 1250
    });
});

app.listen(PORT, () => {
    console.log(`Server chạy tại http://localhost:${PORT}`);
});