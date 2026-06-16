"use strict";
let allStations = [];
let currentGroup = "all";


let loggerMap;
let loggerMarkerLayer;
let loggerMapLoaded = false;
let loggerMapFitted = false;
let loggerReloadTimer = null;

document.addEventListener("DOMContentLoaded", () => {
  initLoggerMap();
});

function initLoggerMap() {
  document.getElementById("reloadMapBtn")?.addEventListener("click", () => {
    loggerMapFitted = false;
    loadLoggerMap();
  });
  document.getElementById("groupFilter")?.addEventListener("change", (event) => {
    currentGroup = event.target.value;
    loggerMapFitted = false;
    renderFilteredStations();
  });

  if (loggerMapLoaded) return;

  const mapEl = document.getElementById("loggerMap");
  if (!mapEl) return;

  loggerMapLoaded = true;

  loggerMap = L.map("loggerMap", {
    center: [9.18, 105.15],
    zoom: 10,
    zoomControl: true
  });

  const GOOGLE_MAPS_API_KEY = "AIzaSyAyK0kR6vJbz16MxVEkYat34RKSALeLGrw_";

  const baseMaps = {
    "OpenStreetMap": L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 19
    }),

    "CartoDB Sáng": L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
      attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
      subdomains: "abcd",
      maxZoom: 19
    }),

    "CartoDB Tối": L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
      subdomains: "abcd",
      maxZoom: 19
    }),

    "CartoDB Voyager": L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
      attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
      maxZoom: 19
    }),

    "Google Đường": L.tileLayer(`https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}&key=${GOOGLE_MAPS_API_KEY}`, {
      attribution: "&copy; Google Maps",
      maxZoom: 20
    }),

    "Google Vệ tinh": L.tileLayer(`https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}&key=${GOOGLE_MAPS_API_KEY}`, {
      attribution: "&copy; Google Maps",
      maxZoom: 20
    }),

    "Google Hybrid": L.tileLayer(`https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}&key=${GOOGLE_MAPS_API_KEY}`, {
      attribution: "&copy; Google Maps",
      maxZoom: 20
    }),

    "Google Địa hình": L.tileLayer(`https://mt1.google.com/vt/lyrs=p&x={x}&y={y}&z={z}&key=${GOOGLE_MAPS_API_KEY}`, {
      attribution: "&copy; Google Maps",
      maxZoom: 20
    }),

    "Esri Vệ tinh": L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
      attribution: "Tiles &copy; Esri",
      maxZoom: 23
    }),

    "Esri Đường phố": L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}", {
      attribution: "Tiles &copy; Esri",
      maxZoom: 23
    }),

    "OpenTopoMap": L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
      attribution: "Map data: &copy; OpenStreetMap contributors, SRTM | Map style: &copy; OpenTopoMap",
      maxZoom: 19
    })
  };

  baseMaps["OpenStreetMap"].addTo(loggerMap);

  L.control.layers(baseMaps, null, {
    collapsed: true,
    position: "topright"
  }).addTo(loggerMap);

  loggerMarkerLayer = L.layerGroup().addTo(loggerMap);

  document.getElementById("reloadMapBtn")?.addEventListener("click", () => {
    loggerMapFitted = false;
    loadLoggerMap();
  });

  loadLoggerMap();

  loggerReloadTimer = setInterval(loadLoggerMap, 30000);

  setTimeout(() => {
    loggerMap.invalidateSize();
  }, 500);
}

async function loadLoggerMap() {
  const status = document.getElementById("mapStatus");

  try {
    if (status) status.textContent = "Đang tải dữ liệu...";

    const response = await fetch("/api/sources/map-loggers?t=" + Date.now(), {
      cache: "no-store"
    });

    const result = await response.json();

    if (!result.success || !Array.isArray(result.stations)) {
      throw new Error("Dữ liệu API không hợp lệ");
    }

    allStations = result.stations || [];

    buildGroupFilter(allStations);
    renderFilteredStations();

  } catch (error) {
    console.error("Lỗi tải map logger:", error);

    if (status) {
      status.textContent = "Không tải được dữ liệu logger";
    }
  }
}

function renderLoggerMarkers(stations) {
  loggerMarkerLayer.clearLayers();

  const bounds = [];
  const mergedStations = mergeStationsForMap(stations);

  mergedStations.forEach((station) => {
    const lat = Number(station.lat);
    const lng = Number(station.lng);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    const isOnline = checkStationOnline(station.updated_at);

    bounds.push([lat, lng]);

    const popupHtml = createLoggerPopup(station, isOnline);

    const marker = L.marker([lat, lng], {
      icon: createLoggerIcon(station, isOnline),
      riseOnHover: true
    }).addTo(loggerMarkerLayer);

    marker.bindPopup(popupHtml, {
      autoPan: true,
      closeButton: true,
      maxWidth: 340,
      className: "logger-popup-wrapper"
    });

    marker.on("click", function () {
      loggerMap.invalidateSize();

      setTimeout(() => {
        this.openPopup();
      }, 50);
    });
  });

  if (!loggerMapFitted && bounds.length > 0) {
    loggerMap.fitBounds(bounds, {
      padding: [50, 50],
      maxZoom: 19
    });

    loggerMapFitted = true;
  }

  setTimeout(() => {
    loggerMap.invalidateSize();
  }, 200);
}

function mergeStationsForMap(stations) {
  const map = new Map();

  stations.forEach((station) => {
    const lat = Number(station.lat);
    const lng = Number(station.lng);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    const key = `${station.raw_id || station.station_id}_${lat}_${lng}`;

    if (!map.has(key)) {
      map.set(key, {
        ...station,
        lat,
        lng,
        sources: [station.source],
        dataBySource: {
          [station.source]: station.data || {}
        },
        updatedList: [station.updated_at]
      });

      return;
    }

    const existing = map.get(key);

    if (!existing.sources.includes(station.source)) {
      existing.sources.push(station.source);
    }

    existing.dataBySource[station.source] = station.data || {};
    existing.updatedList.push(station.updated_at);

    existing.updated_at = existing.updatedList
      .filter(Boolean)
      .sort()
      .at(-1);
  });

  return Array.from(map.values());
}

function createLoggerPopup(station, isOnline) {
  const dataBySource = station.dataBySource || {
    [station.source]: station.data || {}
  };

  const renderSourceData = (data) => {
    const fields = [
      ["Flow", data.flow, " m³/h"],
      ["Level", data.level, " m"],
      ["Total Index", data.totalIndex, ""],
      ["TDS", data.TDS ?? data.tds, " ppm"],
      ["Amino", data.amino, " ppm"],
      ["Nitrat", data.nitrat, " ppm"],
      ["pH", data.pH, ""]
    ];

    return fields
      .filter(([, value]) => value !== undefined && value !== null && value !== "")
      .map(([label, value, unit]) => {
        return popupRow(label, `${formatNumber(value)}${unit}`);
      })
      .join("");
  };

  return `
    <div class="logger-popup">
      <h3>${escapeHtml(station.name || station.raw_id || station.station_id)}</h3>

      ${popupRow("Mã trạm", station.raw_id || station.station_id)}
      ${popupRow("Trạng thái", isOnline ? "🟢 Online" : "🔴 Offline")}
      ${popupRow("Nguồn", station.sources ? station.sources.join(" + ") : station.source)}

      ${Object.entries(dataBySource).map(([source, data]) => `
        <div class="popup-source-block">
          <h4>${escapeHtml(String(source).toUpperCase())}</h4>
          ${renderSourceData(data)}
        </div>
      `).join("")}

      ${popupRow("Cập nhật", station.updated_at)}
    </div>
  `;
}

function popupRow(label, value) {
  if (value === undefined || value === null || value === "") return "";

  return `
    <div class="popup-row">
      <span class="popup-label">${escapeHtml(label)}</span>
      <span class="popup-value">${escapeHtml(value)}</span>
    </div>
  `;
}

function createLoggerIcon(station, isOnline) {
  const iconUrl = isOnline
    ? "/assets/images/icon-online.gif"
    : "/assets/images/icon-offline.gif";

  const label = escapeHtml(station.name || station.raw_id || station.station_id);

  return L.divIcon({
    className: "logger-div-icon",
    html: `
      <div class="logger-marker-wrap">
        <img class="logger-marker-icon" src="${iconUrl}" alt="">
        <div class="logger-marker-label ${isOnline ? "online" : "offline"}">
          ${label}
        </div>
      </div>
    `,
    iconSize: [140, 42],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32]
  });
}

function checkStationOnline(updatedAt) {
  if (!updatedAt) return false;

  const stationTime = new Date(
    String(updatedAt).replace(" ", "T")
  ).getTime();

  if (!Number.isFinite(stationTime)) return false;

  const diffMinutes = (Date.now() - stationTime) / 60000;

  return diffMinutes <= 60;
}

function formatNumber(value) {
  const num = Number(String(value ?? "").replaceAll(",", ""));

  if (!Number.isFinite(num)) return "0";

  return new Intl.NumberFormat("vi-VN", {
    maximumFractionDigits: 2
  }).format(num);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

window.addEventListener("resize", () => {
  if (!loggerMap) return;

  setTimeout(() => {
    loggerMap.invalidateSize();
  }, 100);
});


function getStationGroup(station) {
  return (
    station.group ||
    station.group_name ||
    station.logger_group ||
    station.zone ||
    station.area ||
    station.district ||
    station.source ||
    "Khác"
  );
}

function buildGroupFilter(stations) {
  const select = document.getElementById("groupFilter");

  if (!select) return;

  const oldValue = select.value || "all";

  const groups = [...new Set(
    stations.map(getStationGroup).filter(Boolean)
  )].sort();

  select.innerHTML = "";

  const allOption = document.createElement("option");
  allOption.value = "all";
  allOption.textContent = "Tất cả nhóm";
  select.appendChild(allOption);

  groups.forEach((group) => {
    const option = document.createElement("option");
    option.value = group;
    option.textContent = group;
    select.appendChild(option);
  });

  if (oldValue === "all" || groups.includes(oldValue)) {
    select.value = oldValue;
    currentGroup = oldValue;
  } else {
    select.value = "all";
    currentGroup = "all";
  }
}

function renderFilteredStations() {
  const filteredStations = currentGroup === "all"
    ? allStations
    : allStations.filter((station) => {
        return getStationGroup(station) === currentGroup;
      });

  updateMapSummary(filteredStations);
  renderLoggerMarkers(filteredStations);
}

function updateMapSummary(stations) {
  const total = stations.length;

  const online = stations.filter((station) => {
    return checkStationOnline(station.updated_at);
  }).length;

  const onlineEl = document.getElementById("onlineCount");
  const totalEl = document.getElementById("totalCount");
  const statusEl = document.getElementById("mapStatus");

  if (onlineEl) onlineEl.textContent = online;
  if (totalEl) totalEl.textContent = total;

  if (statusEl) {
    if (currentGroup === "all") {
      statusEl.textContent = `Đang hiển thị ${total} logger`;
    } else {
      statusEl.textContent = `Nhóm ${currentGroup}: ${online}/${total} online`;
    }
  }
}