function updateClock() {
    const el = document.getElementById("current-time");
    if (!el) return;

    el.textContent = new Date().toLocaleString("vi-VN");
}

async function loadDashboard() {
    try {
        const res = await fetch("/api/dashboard");
        const data = await res.json();

        document.getElementById("totalStations").textContent =
            data.totalStations ?? 0;

        document.getElementById("onlineStations").textContent =
            data.onlineStations ?? 0;

        document.getElementById("offlineStations").textContent =
            data.offlineStations ?? 0;

        document.getElementById("totalFlow").textContent =
            Number(data.totalFlow ?? 0).toLocaleString("vi-VN");
    } catch (err) {
        console.error("Dashboard error:", err);
    }
}

updateClock();
loadDashboard();

setInterval(updateClock, 1000);
setInterval(loadDashboard, 5000);