"use strict";

function initDashboard() {
    initDashboardGauges();
    initFlowHistoryChart();
}

function initDashboardGauges() {
    if (typeof ScadaGauge === "undefined") {
        console.error("Chưa load được /shared/gauge.js");
        return;
    }

    const gaugeConfigs = [
        { id: "Gauge_01", min: 0, max: 2000, title: "TỔNG CÔNG SUẤT",  unit: "m³/h", color: "#8BC34A", api: "/api/sources/total-flow-all"   },
        { id: "Gauge_02", min: 0, max: 2000, title: "GP35-BTNMT",       unit: "m³/h", color: "#8BC34A", api: "/api/sources/total-flow-gp35"   },
        { id: "Gauge_03", min: 0, max: 500,  title: "GP36-BTNMT",       unit: "m³/h", color: "#2196F3", api: "/api/sources/total-flow-gp36"   },
        { id: "Gauge_04", min: 0, max: 500,  title: "GP391-BTNMT",      unit: "m³/h", color: "#FF9800", api: "/api/sources/total-flow-gp391"  },
        { id: "Gauge_05", min: 0, max: 500,  title: "GP393-BTNMT",      unit: "m³/h", color: "#4CAF50", api: "/api/sources/total-flow-gp393"  },
        { id: "Gauge_06", min: 0, max: 500,  title: "GP-STNMT",         unit: "m³/h", color: "#00BCD4", api: "/api/sources/total-flow-gpstn"  }
    ];

    window.dashboardGauges = gaugeConfigs.map((cfg) => {
        const el = document.getElementById(cfg.id);
        if (!el) { console.warn("Không tìm thấy gauge container:", cfg.id); return null; }

        return new ScadaGauge(cfg.id, {
            min: cfg.min, max: cfg.max,
            title: cfg.title, unit: cfg.unit,
            color: cfg.color, decimals: 0,
            api: { url: cfg.api }
        });
    }).filter(Boolean);
}

async function initFlowHistoryChart() {
    const canvas = document.getElementById("flowHistoryChart");
    const status = document.getElementById("flowHistoryStatus");
    if (!canvas || !status) return;

    if (!window.Chart) { status.textContent = "Không tải được Chart.js"; return; }

    const series = [
        { key: "all",   label: "Tổng",   color: "#F2D16B", width: 3 },
        { key: "gp35",  label: "GP35",   color: "#8BC34A", width: 2 },
        { key: "gp36",  label: "GP36",   color: "#2196F3", width: 2 },
        { key: "gp391", label: "GP391",  color: "#FF9800", width: 2 },
        { key: "gp393", label: "GP393",  color: "#4CAF50", width: 2 },
        { key: "gpstn", label: "GP-STN", color: "#00BCD4", width: 2 }
    ];

    const chart = new Chart(canvas, {
        type: "line",
        data: {
            labels: [],
            datasets: series.map(s => ({
                label: s.label,
                data: [],
                borderColor: s.color,
                backgroundColor: s.color,
                borderWidth: s.width,
                fill: false,
                pointStyle: "circle",
                pointRadius: 2,
                pointHoverRadius: 2,
                pointBorderWidth: 2,
                pointBackgroundColor: s.color,
                pointBorderColor: "#ffffff",
                hitRadius: 12,
                hoverBorderWidth: 3,
                tension: 0.28
            }))
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            interaction: { mode: "index", intersect: false },
            plugins: {
                legend: {
                    position: "bottom",
                    labels: { color: "#dbe7ff", usePointStyle: true, pointStyle: "circle", boxWidth: 12, boxHeight: 12, padding: 16 }
                },
                tooltip: {
                    usePointStyle: true,
                    callbacks: {
                        label: (ctx) => `${ctx.dataset.label}: ${Number(ctx.parsed.y || 0).toLocaleString("vi-VN")} m³/h`
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: "rgba(159,182,255,0.12)" },
                    ticks: { color: "#9fb6ff", maxRotation: 0, autoSkip: true, maxTicksLimit: 8 }
                },
                y: {
                    beginAtZero: true,
                    grid: { color: "rgba(159,182,255,0.12)" },
                    ticks: { color: "#9fb6ff", callback: v => Number(v).toLocaleString("vi-VN") },
                    title: { display: true, text: "m³/h", color: "#dbe7ff" }
                }
            }
        }
    });

    async function refreshHistory() {
        try {
            const res  = await fetch("/api/sources/flow-history?limit=48", { cache: "no-store" });
            const json = await res.json();
            if (!json.success || !Array.isArray(json.rows)) throw new Error("Dữ liệu không hợp lệ");

            chart.data.labels = json.rows.map(r => {
                const t = String(r.ts || "");
                return t.length >= 16 ? t.slice(11, 16) : t;
            });
            series.forEach((s, i) => {
                chart.data.datasets[i].data = json.rows.map(r => Number(r[s.key] || 0));
            });
            chart.update();
            status.textContent = json.rows.length
                ? `Cập nhật: ${json.rows.at(-1).ts}`
                : "Chưa có dữ liệu";
        } catch (err) {
            console.error("Lỗi tải lịch sử flow:", err);
            status.textContent = "Lỗi tải dữ liệu";
        }
    }

    window._flowChart = chart;
    applyChartTheme(chart);

    await refreshHistory();
    setInterval(refreshHistory, 30000);
}


// ===========================
// CHART THEME SYNC
// ===========================

function getChartColors() {
    const isLight = document.documentElement.getAttribute("data-theme") === "light";

    return {
        tick:   isLight ? "#475569" : "#9fb6ff",
        legend: isLight ? "#0f172a" : "#dbe7ff",
        grid:   isLight ? "rgba(71,85,105,0.15)" : "rgba(159,182,255,0.12)",
        axis:   isLight ? "#475569" : "#dbe7ff"
    };
}
function applyChartTheme(chart) {
    if (!chart) return;
    const c = getChartColors();

    chart.options.scales.x.grid.color        = c.grid;
    chart.options.scales.x.ticks.color       = c.tick;
    chart.options.scales.y.grid.color        = c.grid;
    chart.options.scales.y.ticks.color       = c.tick;
    chart.options.scales.y.title.color       = c.axis;
    chart.options.plugins.legend.labels.color = c.legend;

    chart.update();
}

// Lắng nghe thay đổi data-theme để cập nhật chart
const _themeObserver = new MutationObserver(() => {
    if (window._flowChart) applyChartTheme(window._flowChart);
});
_themeObserver.observe(document.documentElement, {
    attributes: true, attributeFilter: ["data-theme"]
});

window.initDashboard = initDashboard;