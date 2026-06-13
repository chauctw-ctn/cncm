let map = null;
let markers = [];
let allStations = [];
let serverTimestamp = null;
let offlineTimeoutMinutes = 60;
const GOOGLE_MAPS_API_KEY = "AIzaSyAyK0kR6vJbz16MxVEkYat34RKSALeLGrw_";

let userName = null;
let logoutBtn = null;
let timeNodes = [];
let sidebar = null;
let sidebarOverlay = null;
let headerMenuBtn = null;
let userMenuBtn = null;
let userDropdown = null;
let dropdownUsername = null;
let dropdownRole = null;
let addUserBtn = null;
let manageUsersBtn = null;
let telegramConfigBtn = null;
let coordinatesConfigBtn = null;
let userMenuBound = false;
let loggermapFilterToggle = null;
let loggermapFilterContent = null;
let loggermapTvaOnline = null;
let loggermapTvaOffline = null;
let loggermapMqttOnline = null;
let loggermapMqttOffline = null;
let loggermapScadaOnline = null;
let loggermapScadaOffline = null;
let loggermapTotalOnline = null;
let loggermapTotalOffline = null;
let loggermapFilterBound = false;
let loggermapFilterTva = null;
let loggermapFilterMqtt = null;
let loggermapFilterScada = null;
let loggermapGroupFilter = { tva: true, mqtt: true, scada: true };

function requireAuth() {
    const token = localStorage.getItem("authToken");
    if (!token) {
        window.location.href = "/login/login.html";
    }
}

function renderTime() {
    const now = new Date();
    const formatted = now.toLocaleString("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
        day: "2-digit",
        month: "2-digit"
    });
    timeNodes.forEach((node) => {
        node.textContent = formatted;
    });
}

function wireLogout() {
    if (window.__authLogoutManaged || !logoutBtn) return;
    logoutBtn.addEventListener("click", () => {
        localStorage.removeItem("authToken");
        localStorage.removeItem("username");
        localStorage.removeItem("userRole");
        window.location.href = "/login/login.html";
    });
}

function updateUserUI() {
    const username = localStorage.getItem("username") || "Khach";
    const role = localStorage.getItem("userRole") || "user";
    const isAdmin = role === "admin";

    if (userName) {
        userName.textContent = username;
        userName.style.display = "inline-flex";
    }

    if (dropdownUsername) {
        dropdownUsername.textContent = username;
    }

    if (dropdownRole) {
        dropdownRole.textContent = role;
    }

    if (addUserBtn) addUserBtn.style.display = isAdmin ? "flex" : "none";
    if (manageUsersBtn) manageUsersBtn.style.display = isAdmin ? "flex" : "none";
    if (telegramConfigBtn) telegramConfigBtn.style.display = isAdmin ? "flex" : "none";
    if (coordinatesConfigBtn) coordinatesConfigBtn.style.display = isAdmin ? "flex" : "none";
}

function wireUserMenu() {
    if (window.__authMenuManaged || !userMenuBtn || !userDropdown || userMenuBound) return;
    userMenuBound = true;

    userMenuBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        userDropdown.classList.toggle("active");
    });

    document.addEventListener("click", (event) => {
        if (!userDropdown.classList.contains("active")) return;
        const target = event.target;
        if (userDropdown.contains(target) || userMenuBtn.contains(target)) return;
        userDropdown.classList.remove("active");
    });
}

function syncHeaderState() {
    userName = document.getElementById("username-display");
    logoutBtn = document.getElementById("logout-btn");
    headerMenuBtn = document.getElementById("menu-btn");
    userMenuBtn = document.getElementById("user-menu-btn");
    userDropdown = document.getElementById("user-dropdown");
    dropdownUsername = document.getElementById("dropdown-username");
    dropdownRole = document.getElementById("dropdown-role");
    addUserBtn = document.getElementById("add-user-btn");
    manageUsersBtn = document.getElementById("manage-users-btn");
    telegramConfigBtn = document.getElementById("telegram-config-btn");
    coordinatesConfigBtn = document.getElementById("coordinates-config-btn");

    updateUserUI();
    wireLogout();
    wireUserMenu();
    bindToggleButton(headerMenuBtn);
}

function syncSidebarState() {
    sidebar = document.getElementById("sidebar");
    sidebarOverlay = document.getElementById("sidebar-overlay");
    // timeNodes = Array.from(document.querySelectorAll("[data-time]"));

    if (sidebarOverlay) {
        sidebarOverlay.addEventListener("click", () => applySidebarState(false));
    }
}

function syncLoggermapFilterState() {
    loggermapFilterToggle = document.getElementById("loggermap-filter-toggle");
    loggermapFilterContent = document.getElementById("loggermap-filter-content");
    loggermapTvaOnline = document.getElementById("loggermap-tva-online");
    loggermapTvaOffline = document.getElementById("loggermap-tva-offline");
    loggermapMqttOnline = document.getElementById("loggermap-mqtt-online");
    loggermapMqttOffline = document.getElementById("loggermap-mqtt-offline");
    loggermapScadaOnline = document.getElementById("loggermap-scada-online");
    loggermapScadaOffline = document.getElementById("loggermap-scada-offline");
    loggermapTotalOnline = document.getElementById("loggermap-total-online");
    loggermapTotalOffline = document.getElementById("loggermap-total-offline");
    loggermapFilterTva = document.getElementById("loggermap-filter-tva");
    loggermapFilterMqtt = document.getElementById("loggermap-filter-mqtt");
    loggermapFilterScada = document.getElementById("loggermap-filter-scada");

    loadLoggermapFilterState();
    syncLoggermapFilterInputs();
    bindLoggermapFilterToggle();
    bindLoggermapGroupFilters();
    setLoggermapFilterOpen(false);
    if (allStations.length > 0) {
        updateLoggermapFilterCounts(allStations);
    }
}

function bindLoggermapFilterToggle() {
    if (!loggermapFilterToggle || !loggermapFilterContent || loggermapFilterBound) return;
    loggermapFilterBound = true;

    loggermapFilterToggle.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const isOpen = loggermapFilterContent.classList.contains("active");
        setLoggermapFilterOpen(!isOpen);
    });
}

function bindLoggermapGroupFilters() {
    if (!loggermapFilterTva || !loggermapFilterMqtt || !loggermapFilterScada) return;

    const onChange = () => {
        loggermapGroupFilter = {
            tva: loggermapFilterTva.checked,
            mqtt: loggermapFilterMqtt.checked,
            scada: loggermapFilterScada.checked
        };
        saveLoggermapFilterState();
        applyLoggermapGroupFilter();
    };

    loggermapFilterTva.addEventListener("change", onChange);
    loggermapFilterMqtt.addEventListener("change", onChange);
    loggermapFilterScada.addEventListener("change", onChange);
}

function loadLoggermapFilterState() {
    loggermapGroupFilter = { tva: true, mqtt: true, scada: true };
    saveLoggermapFilterState();
}

function syncLoggermapFilterInputs() {
    if (loggermapFilterTva) loggermapFilterTva.checked = loggermapGroupFilter.tva !== false;
    if (loggermapFilterMqtt) loggermapFilterMqtt.checked = loggermapGroupFilter.mqtt !== false;
    if (loggermapFilterScada) loggermapFilterScada.checked = loggermapGroupFilter.scada !== false;
}

function saveLoggermapFilterState() {
    localStorage.setItem("loggermapGroupFilter", JSON.stringify(loggermapGroupFilter));
}

function applyLoggermapGroupFilter() {
    if (!map || markers.length === 0) return;

    markers.forEach((marker) => {
        const group = getStationGroup(marker.stationData || {});
        const shouldShow = loggermapGroupFilter[group] !== false;
        if (shouldShow) {
            if (!map.hasLayer(marker)) marker.addTo(map);
            if (!marker.isPopupOpen() && marker.getTooltip()) marker.openTooltip();
        } else if (map.hasLayer(marker)) {
            marker.remove();
        }
    });
}

function setLoggermapFilterOpen(open) {
    if (!loggermapFilterToggle || !loggermapFilterContent) return;
    loggermapFilterToggle.classList.toggle("expanded", open);
    loggermapFilterToggle.setAttribute("aria-expanded", String(open));
    loggermapFilterContent.classList.toggle("active", open);
}

function updateLoggermapFilterCounts(stations) {
    const counts = {
        mqtt: { online: 0, offline: 0 },
        tva: { online: 0, offline: 0 },
        scada: { online: 0, offline: 0 }
    };

    stations.forEach((station) => {
        const offline = isStationOffline(station);
        const statusKey = offline ? "offline" : "online";
        const group = getStationGroup(station);
        if (!counts[group]) return;
        counts[group][statusKey] += 1;
    });

    if (loggermapTvaOnline) loggermapTvaOnline.textContent = counts.tva.online;
    if (loggermapTvaOffline) loggermapTvaOffline.textContent = counts.tva.offline;
    if (loggermapMqttOnline) loggermapMqttOnline.textContent = counts.mqtt.online;
    if (loggermapMqttOffline) loggermapMqttOffline.textContent = counts.mqtt.offline;
    if (loggermapScadaOnline) loggermapScadaOnline.textContent = counts.scada.online;
    if (loggermapScadaOffline) loggermapScadaOffline.textContent = counts.scada.offline;

    const totalOnline = counts.tva.online + counts.mqtt.online + counts.scada.online;
    const totalOffline = counts.tva.offline + counts.mqtt.offline + counts.scada.offline;
    if (loggermapTotalOnline) loggermapTotalOnline.textContent = totalOnline;
    if (loggermapTotalOffline) loggermapTotalOffline.textContent = totalOffline;

    localStorage.setItem("loggermapCounts", JSON.stringify({
        counts,
        totalOnline,
        totalOffline
    }));
}

function applySidebarState(open) {
    if (!sidebar || !sidebarOverlay) {
        syncSidebarState();
    }

    if (sidebar) {
        sidebar.classList.toggle("active", open);
        sidebar.classList.toggle("hidden", !open);
    }

    if (sidebarOverlay) {
        const showOverlay = open && window.innerWidth <= 768;
        sidebarOverlay.classList.toggle("active", showOverlay);
        sidebarOverlay.classList.toggle("show", showOverlay);
    }

    const mapEl = document.getElementById("map");
    if (mapEl) {
        mapEl.classList.toggle("with-sidebar", open);
    }

    localStorage.setItem("sidebarOpen", String(open));

    if (map) {
        setTimeout(() => map.invalidateSize(), 350);
    }
}

function bindToggleButton(button) {
    if (!button) return;
    button.addEventListener("click", () => {
        if (!sidebar) {
            syncSidebarState();
        }
        const isOpen = sidebar && sidebar.classList.contains("active");
        applySidebarState(!isOpen);
    });
}

function formatDateTime(date) {
    const d = new Date(date);
    const formatter = new Intl.DateTimeFormat("vi-VN", {
        timeZone: "Asia/Ho_Chi_Minh",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false
    });
    return formatter.format(d);
}

function formatDateToDDMMYYYY(date) {
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
}

function parseDDMMYYYYToYYYYMMDD(dateStr) {
    const parts = String(dateStr || "").split("/");
    if (parts.length !== 3) return null;
    const [day, month, year] = parts;
    return `${year}-${month}-${day}`;
}

const LABEL_EXCEPTIONS = new Set(["pH", "TDS"]);

function formatParamLabel(label) {
    const text = String(label || "").trim();
    if (!text) return text;
    if (LABEL_EXCEPTIONS.has(text)) return text;
    return text.charAt(0).toUpperCase() + text.slice(1);
}

function normalizeParamText(value) {
    return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
}

function getParamDisplayInfo(param) {
    let shortName = String(param?.name || "");
    const paramNameLower = shortName.toLowerCase();
    const normalizedParamName = paramNameLower.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    let isWaterQuality = false;
    let qualityClass = "";
    const paramValue = parseFloat(param?.value);

    if (paramNameLower.includes("tổng") && paramNameLower.includes("lưu lượng")) {
        shortName = "Tổng lưu lượng";
    } else if (paramNameLower.includes("lưu lượng")) {
        shortName = "Lưu lượng";
    } else if (paramNameLower.includes("áp lực") || normalizedParamName.includes("ap luc")) {
        shortName = "Áp lực";
    } else if (paramNameLower.includes("mực nước") || normalizedParamName.includes("muc nuoc")) {
        shortName = "Mực nước";
    } else if (paramNameLower.includes("nhiệt độ") || normalizedParamName.includes("nhiet do")) {
        shortName = "Nhiệt độ";
    } else if (normalizedParamName.includes("ph")) {
        shortName = "pH";
        isWaterQuality = true;
        if (!Number.isNaN(paramValue)) {
            qualityClass = (paramValue >= 6.5 && paramValue <= 8.5) ? "good" : "warning";
        }
    } else if (normalizedParamName.includes("tds")) {
        shortName = "TDS";
        isWaterQuality = true;
        if (!Number.isNaN(paramValue)) {
            if (paramValue <= 1000) qualityClass = "good";
            else if (paramValue <= 1500) qualityClass = "warning";
            else qualityClass = "danger";
        }
    } else if (normalizedParamName.includes("amoni")) {
        shortName = "Amoni";
        isWaterQuality = true;
        if (!Number.isNaN(paramValue)) {
            qualityClass = paramValue <= 3 ? "good" : "warning";
        }
    } else if (normalizedParamName.includes("nitrat")) {
        shortName = "Nitrat";
        isWaterQuality = true;
        if (!Number.isNaN(paramValue)) {
            qualityClass = paramValue <= 15 ? "good" : "warning";
        }
    }

    return {
        label: formatParamLabel(shortName),
        isWaterQuality,
        qualityClass
    };
}

function buildAvailableParams(station) {
    const params = [];
    const seen = new Set();
    if (!station?.data) return params;

    station.data.forEach((param) => {
        const originalName = String(param?.name || "").trim();
        if (!originalName) return;
        const info = getParamDisplayInfo(param);
        if (info.label === "Tổng lưu lượng") return;
        const key = info.label.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        params.push({
            name: originalName,
            unit: param.unit || "",
            label: info.label
        });
    });

    return params;
}

function findStationById(stationId) {
    if (!stationId) return null;
    return allStations.find((station) => String(station.id) === String(stationId)) || null;
}

function getStationGroup(station) {
    const explicitType = String(
        station.type || station.station_type || station.stationType || ""
    ).toLowerCase();
    if (explicitType) return explicitType;

    const stationId = String(station.id || station.station_id || "").toLowerCase();
    const prefixMatch = stationId.match(/^(mqtt|tva|scada)[-_]/);
    if (prefixMatch) return prefixMatch[1];
    if (stationId.startsWith("mqtt")) return "mqtt";
    if (stationId.startsWith("tva")) return "tva";
    if (stationId.startsWith("scada")) return "scada";
    return "mqtt";
}

function createStationIcon(station) {
    const offline = isStationOffline(station);
    const iconUrl = offline ? "/loggermap/DIS.gif" : "/loggermap/PS_GR.gif";

    return L.icon({
        iconUrl,
        iconSize: [32, 32],
        iconAnchor: [16, 32],
        popupAnchor: [0, -32]
    });
}

function isStationOffline(station) {
    if (station.hasValueChange === false) {
        return true;
    }
    if (station.hasValueChange === true) {
        return false;
    }

    const checkTime = station.lastUpdateInDB || station.updateTime;
    if (!checkTime) {
        return true;
    }

    const updateTime = new Date(checkTime);
    const now = serverTimestamp ? new Date(serverTimestamp) : new Date();
    if (Number.isNaN(updateTime.getTime())) {
        return true;
    }

    const diffMinutes = (now - updateTime) / (1000 * 60);
    return diffMinutes > offlineTimeoutMinutes;
}

function initMap() {
    const center = [9.177, 105.15];
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    map = L.map("map", {
        scrollWheelZoom: true,
        wheelPxPerZoomLevel: 120,
        tap: isMobile,
        tapTolerance: 15,
        touchZoom: true,
        doubleClickZoom: true,
        boxZoom: !isMobile,
        dragging: true,
        zoomControl: true,
        attributionControl: true
    }).setView(center, 16);

    window.map = map;
    window.leafletMap = map;

    map.createPane("customTooltipPane");
    map.getPane("customTooltipPane").style.zIndex = 615;
    map.createPane("markerOnTopPane");
    map.getPane("markerOnTopPane").style.zIndex = 620;

    const openStreetMap = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
        maxZoom: 19
    });

    const cartoDBPositron = L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
        attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
        subdomains: "abcd",
        maxZoom: 20
    });

    const cartoDBDark = L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
        subdomains: "abcd",
        maxZoom: 20
    });

    const cartoDBVoyager = L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
        attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
        subdomains: "abcd",
        maxZoom: 20
    });

    const googleRoadmap = L.tileLayer(`https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}&key=${GOOGLE_MAPS_API_KEY}`, {
        attribution: "&copy; Google Maps",
        maxZoom: 20,
        subdomains: ["mt0", "mt1", "mt2", "mt3"]
    });

    const googleSatellite = L.tileLayer(`https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}&key=${GOOGLE_MAPS_API_KEY}`, {
        attribution: "&copy; Google Maps",
        maxZoom: 20,
        subdomains: ["mt0", "mt1", "mt2", "mt3"]
    });

    const googleHybrid = L.tileLayer(`https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}&key=${GOOGLE_MAPS_API_KEY}`, {
        attribution: "&copy; Google Maps",
        maxZoom: 20,
        subdomains: ["mt0", "mt1", "mt2", "mt3"]
    });

    const googleTerrain = L.tileLayer(`https://mt1.google.com/vt/lyrs=p&x={x}&y={y}&z={z}&key=${GOOGLE_MAPS_API_KEY}`, {
        attribution: "&copy; Google Maps",
        maxZoom: 20,
        subdomains: ["mt0", "mt1", "mt2", "mt3"]
    });

    const esriWorldImagery = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
        attribution: "Tiles &copy; Esri",
        maxZoom: 19
    });

    const esriWorldStreetMap = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}", {
        attribution: "Tiles &copy; Esri",
        maxZoom: 19
    });

    const openTopoMap = L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
        attribution: "Map data: &copy; OpenStreetMap contributors, SRTM | Map style: &copy; OpenTopoMap",
        maxZoom: 17
    });

    // googleHybrid.addTo(map);
    openStreetMap.addTo(map);

    const baseMaps = {
        "OpenStreetMap": openStreetMap,
        "Google Roadmap": googleRoadmap,
        "Google Satellite": googleSatellite,
        "Google Hybrid": googleHybrid,
        "Google Terrain": googleTerrain,
        "CartoDB Positron": cartoDBPositron,
        "CartoDB Dark": cartoDBDark,
        "CartoDB Voyager": cartoDBVoyager,
        "ESRI Satellite": esriWorldImagery,
        "ESRI Street Map": esriWorldStreetMap,
        "OpenTopoMap": openTopoMap
    };

    L.control.layers(baseMaps, null, {
        position: "topright",
        collapsed: true
    }).addTo(map);

    loadStations();

    setInterval(() => {
        refreshStations();
    }, 30 * 1000);
}

function showLoading(show) {
    const loading = document.getElementById("loading");
    if (!loading) return;
    loading.classList.toggle("hidden", !show);
}

async function loadStations() {
    showLoading(true);

    try {
        const response = await fetch(`/api/stations?timeout=${offlineTimeoutMinutes}&_t=${Date.now()}`, {
            cache: "no-store"
        });
        const data = await response.json();

        if (data.success) {
            allStations = data.stations;
            serverTimestamp = data.timestamp;
            displayMarkers(data.stations);
            updateLoggermapFilterCounts(allStations);
            applyLoggermapGroupFilter();
        } else {
            console.error("Khong the tai du lieu tram:", data.error);
        }
    } catch (error) {
        console.error("Loi ket noi:", error);
    } finally {
        showLoading(false);
    }
}

async function refreshStations() {
    try {
        const response = await fetch(`/api/stations?timeout=${offlineTimeoutMinutes}&_t=${Date.now()}`, {
            cache: "no-store"
        });
        const data = await response.json();

        if (data.success) {
            allStations = data.stations;
            serverTimestamp = data.timestamp;

            markers.forEach((marker) => {
                const newStationData = allStations.find((s) => String(s.id) === String(marker.stationId));
                if (!newStationData) return;

                marker.stationData = newStationData;

                try {
                    marker.setIcon(createStationIcon(newStationData));
                } catch (e) {
                    // ignore icon update failures
                }

                try {
                    const offline = isStationOffline(newStationData);
                    const stationGroup = getStationGroup(newStationData);
                    const labelClass = offline
                        ? "station-label offline"
                        : `station-label ${stationGroup}`;
                    if (marker.getTooltip()) {
                        marker.unbindTooltip();
                    }
                    marker.bindTooltip(newStationData.name, {
                        permanent: true,
                        direction: "top",
                        offset: [0, -8],
                        className: labelClass,
                        pane: "customTooltipPane"
                    });
                    if (!marker.isPopupOpen()) marker.openTooltip();
                } catch (e) {
                    // ignore tooltip update failures
                }

                try {
                    const newContent = createPopupContent(newStationData);
                    const popup = marker.getPopup();
                    if (popup) popup.setContent(newContent);
                } catch (e) {
                    // ignore popup update failures
                }
            });

            updateLoggermapFilterCounts(allStations);
            applyLoggermapGroupFilter();
        }
    } catch (error) {
        console.error("Loi lam moi du lieu:", error);
    }
}

function clearMarkers() {
    markers.forEach((marker) => marker.remove());
    markers = [];
}

function displayMarkers(stations) {
    clearMarkers();

    const sortedStations = [...stations].sort((a, b) => {
        const aOffline = isStationOffline(a);
        const bOffline = isStationOffline(b);
        return aOffline === bOffline ? 0 : (aOffline ? 1 : -1);
    });

    const bounds = [];

    sortedStations.forEach((station) => {
        const lat = Number.parseFloat(station.lat);
        const lng = Number.parseFloat(station.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

        const position = [lat, lng];
        bounds.push(position);

        const offline = isStationOffline(station);
        const customIcon = createStationIcon(station);

        const marker = L.marker(position, {
            icon: customIcon,
            pane: "markerOnTopPane"
        }).addTo(map);

        marker.stationId = station.id;
        marker.stationName = station.name;
        marker.stationData = station;

        const stationGroup = getStationGroup(station);
        const labelClass = offline
            ? "station-label offline"
            : `station-label ${stationGroup}`;
        marker.bindTooltip(station.name, {
            permanent: true,
            direction: "top",
            offset: [0, -8],
            className: labelClass,
            pane: "customTooltipPane"
        });

        const popupContent = createPopupContent(station);
        marker.bindPopup(popupContent, {
            className: "custom-popup",
            maxWidth: 280,
            closeButton: true,
            autoClose: false,
            closeOnClick: false,
            autoPanPaddingTopLeft: [25, 25],
            autoPanPaddingBottomRight: [25, 25]
        });

        marker.on("popupopen", function () {
            this.closeTooltip();
        });

        marker.on("popupclose", function () {
            this.openTooltip();
        });

        markers.push(marker);
    });

    if (bounds.length > 0) {
        map.fitBounds(bounds, {
            padding: [10, 10],
            maxZoom: 16
        });
    }
}

function createPopupContent(station) {
    const stationClass = getStationGroup(station);
    const offline = isStationOffline(station);
    const stationId = station.id || station.station_id || "";
    const stationName = station.name || stationId || "";
    const availableParams = buildAvailableParams(station);

    let formattedUpdateTime = "N/A";
    const dbTimestamp = station.timestamp;
    if (dbTimestamp) {
        const updateDate = new Date(dbTimestamp);
        if (!Number.isNaN(updateDate.getTime())) {
            formattedUpdateTime = formatDateTime(updateDate);
        } else if (station.updateTime) {
            formattedUpdateTime = station.updateTime;
        }
    } else if (station.updateTime) {
        formattedUpdateTime = station.updateTime;
    }

    const statusHtml = offline
        ? '<div class="popup-status offline">⚠️ OFFLINE</div>'
        : '<div class="popup-status online">✓ ONLINE</div>';

    let html = `
        <div class="station-popup ${stationClass}">
            <div class="popup-header">${station.name}</div>
            ${statusHtml}
            <div class="popup-time">${formattedUpdateTime}</div>
            <div class="popup-data">
    `;

    const displayedParams = new Set();

    if (station.data && station.data.length > 0) {
        station.data.forEach((param) => {
            const info = getParamDisplayInfo(param);
            const shortName = info.label;
            const isWaterQuality = info.isWaterQuality;
            const qualityClass = info.qualityClass;

            if (displayedParams.has(shortName)) {
                return;
            }
            displayedParams.add(shortName);

            const valueClass = isWaterQuality ? `water-quality ${qualityClass}` : stationClass;
            const qualityIcon = isWaterQuality && qualityClass === "good" ? "✓" :
                isWaterQuality && qualityClass === "warning" ? "⚠" :
                isWaterQuality && qualityClass === "danger" ? "✕" : "";

            html += `
                <div class="data-row">
                    <span class="data-label">${shortName}</span>
                    <span class="data-value ${valueClass}">${qualityIcon} ${param.value} ${param.unit || ""}</span>
                </div>
            `;
        });
    } else {
        html += '<div class="no-data">Khong co du lieu</div>';
    }

    html += "</div>";

    if (availableParams.length > 0) {
        html += `
            <div class="popup-actions">
                <button class="chart-btn" type="button" data-station-id="${stationId}" data-station-name="${stationName}">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="12" y1="20" x2="12" y2="10"/>
                        <line x1="18" y1="20" x2="18" y2="4"/>
                        <line x1="6" y1="20" x2="6" y2="16"/>
                    </svg>
                    <span>Xem biểu đồ</span>
                </button>
            </div>
        `;
    }

    html += "</div>";

    return html;
}

let currentChart = null;
let currentChartStationId = null;
let currentChartStationName = null;
let currentAvailableParameters = [];

function showMultiParameterChart(stationId, stationName, availableParams) {
    currentChartStationId = stationId;
    currentChartStationName = stationName;
    currentAvailableParameters = availableParams;

    const modal = document.getElementById("chart-modal");
    const modalTitle = document.getElementById("chart-modal-title");
    const startDateInput = document.getElementById("chart-start-date");
    const endDateInput = document.getElementById("chart-end-date");
    const parametersContainer = document.getElementById("chart-parameters");

    if (!modal || !modalTitle || !startDateInput || !endDateInput || !parametersContainer) {
        console.error("Chart modal elements not found");
        return;
    }

    modalTitle.textContent = `Bieu do du lieu - ${stationName}`;

    parametersContainer.innerHTML = "";
    parametersContainer.style.display = "none";

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);

    endDateInput.value = formatDateToDDMMYYYY(endDate);
    startDateInput.value = formatDateToDDMMYYYY(startDate);

    modal.style.display = "block";

    if (typeof flatpickr !== "undefined") {
        flatpickr(startDateInput, {
            dateFormat: "d/m/Y",
            defaultDate: startDateInput.value,
            enableTime: false,
            allowInput: true,
            locale: { firstDayOfWeek: 1 }
        });

        flatpickr(endDateInput, {
            dateFormat: "d/m/Y",
            defaultDate: endDateInput.value,
            enableTime: false,
            allowInput: true,
            locale: { firstDayOfWeek: 1 }
        });
    }

    setTimeout(() => loadChartData(), 100);
}

function setChartError(message) {
    const chartError = document.getElementById("chart-error");
    if (!chartError) return;
    chartError.textContent = message || "";
    chartError.classList.toggle("show", Boolean(message));
}

async function loadChartData() {
    const startDateInput = document.getElementById("chart-start-date");
    const endDateInput = document.getElementById("chart-end-date");
    const chartLoading = document.getElementById("chart-loading");
    const chartContainer = document.getElementById("chart-container");

    if (!startDateInput || !endDateInput || !chartLoading || !chartContainer) return;

    const startDateStr = startDateInput.value;
    const endDateStr = endDateInput.value;

    if (!startDateStr || !endDateStr) {
        setChartError("Vui long chon khoang thoi gian");
        return;
    }

    const datePattern = /^(\d{2})\/(\d{2})\/(\d{4})$/;
    if (!datePattern.test(startDateStr) || !datePattern.test(endDateStr)) {
        setChartError("Dinh dang ngay khong dung. Vui long nhap dd/mm/yyyy");
        return;
    }

    const startDate = parseDDMMYYYYToYYYYMMDD(startDateStr);
    const endDate = parseDDMMYYYYToYYYYMMDD(endDateStr);
    if (!startDate || !endDate) {
        setChartError("Ngay khong hop le");
        return;
    }

    const startDateObj = new Date(startDate);
    const endDateObj = new Date(endDate);
    if (Number.isNaN(startDateObj.getTime()) || Number.isNaN(endDateObj.getTime())) {
        setChartError("Ngay khong hop le");
        return;
    }

    if (startDateObj > endDateObj) {
        setChartError("Ngay bat dau phai nho hon ngay ket thuc");
        return;
    }

    const selectedParams = currentAvailableParameters.map((param) => ({
        name: param.name,
        unit: param.unit || "",
        label: param.label || param.name
    }));

    if (selectedParams.length === 0) {
        setChartError("Khong co thong so de hien thi");
        return;
    }

    setChartError("");
    chartLoading.style.display = "block";
    chartContainer.style.display = "none";

    try {
        const allData = [];

        for (const param of selectedParams) {
            const params = new URLSearchParams({
                stations: currentChartStationId,
                parameter: param.name,
                startDate,
                endDate,
                limit: "10000"
            });

            params.set("_t", Date.now().toString());

            const response = await fetch(`/api/stats?${params.toString()}`, {
                cache: "no-store",
                headers: {
                    Authorization: `Bearer ${localStorage.getItem("authToken")}`
                }
            });

            if (!response.ok) {
                throw new Error("Khong the tai du lieu");
            }

            const result = await response.json();
            if (!result.success) {
                throw new Error(result.error || "Loi khong xac dinh");
            }

            if (result.data && result.data.length > 0) {
                let filteredData = result.data;
                if (normalizeParamText(param.label) === "luu luong") {
                    filteredData = result.data.filter((record) => {
                        const value = parseFloat(record.value);
                        const paramName = String(record.parameter_name || "").toLowerCase();
                        if (!Number.isNaN(value) && value > 1000) return false;
                        if (paramName.includes("tong")) return false;
                        return true;
                    });
                }

                if (filteredData.length > 0) {
                    allData.push({
                        parameter: param.label,
                        unit: param.unit,
                        data: filteredData
                    });
                }
            }
        }

        if (allData.length === 0) {
            setChartError("Khong co du lieu trong khoang thoi gian nay");
            chartLoading.style.display = "none";
            return;
        }

        displayMultiParameterChart(allData);
        chartLoading.style.display = "none";
        chartContainer.style.display = "block";
    } catch (error) {
        console.error("Error loading chart data:", error);
        setChartError(`Loi tai du lieu: ${error.message}`);
        chartLoading.style.display = "none";
    }
}

function displayMultiParameterChart(allData) {
    const canvas = document.getElementById("water-level-chart");
    if (!canvas) return;

    if (currentChart) {
        currentChart.destroy();
    }

    const ctx = canvas.getContext("2d");
    const paramColors = {
        "muc nuoc": { border: "rgb(59, 130, 246)", bg: "rgba(59, 130, 246, 0.1)" },
        "luu luong": { border: "rgb(239, 68, 68)", bg: "rgba(239, 68, 68, 0.1)" },
        "nhiet do": { border: "rgb(239, 68, 68)", bg: "rgba(239, 68, 68, 0.1)" },
        "ap luc": { border: "rgb(168, 85, 247)", bg: "rgba(168, 85, 247, 0.1)" }
    };

    const allTimestamps = new Set();
    allData.forEach((paramData) => {
        paramData.data.forEach((record) => {
            allTimestamps.add(record.timestamp);
        });
    });

    const sortedTimestamps = Array.from(allTimestamps).sort();
    const labels = sortedTimestamps.map((ts) => formatDateTime(new Date(ts)));

    const datasets = allData.map((paramData) => {
        const normalizedLabel = normalizeParamText(paramData.parameter);
        const color = paramColors[normalizedLabel] || {
            border: "rgb(107, 114, 128)",
            bg: "rgba(107, 114, 128, 0.1)"
        };

        const dataValues = sortedTimestamps.map((ts) => {
            const record = paramData.data.find((row) => row.timestamp === ts);
            return record ? record.value : null;
        });

        return {
            label: `${paramData.parameter}${paramData.unit ? ` (${paramData.unit})` : ""}`,
            data: dataValues,
            borderColor: color.border,
            backgroundColor: color.bg,
            borderWidth: 2,
            tension: 0.4,
            fill: false,
            pointRadius: 2,
            pointHoverRadius: 5,
            pointBackgroundColor: color.border,
            pointBorderColor: "#fff",
            pointBorderWidth: 2,
            spanGaps: true
        };
    });

    currentChart = new Chart(ctx, {
        type: "line",
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: "index", intersect: false },
            plugins: {
                legend: {
                    display: true,
                    position: "top",
                    labels: {
                        font: { family: "Space Grotesk, sans-serif", size: 12 },
                        usePointStyle: true,
                        padding: 15
                    }
                },
                tooltip: {
                    backgroundColor: "rgba(0, 0, 0, 0.8)",
                    padding: 12,
                    displayColors: false,
                    titleFont: { size: 13, family: "Space Grotesk, sans-serif" },
                    bodyFont: { size: 12, family: "Space Grotesk, sans-serif" }
                }
            },
            scales: {
                y: {
                    beginAtZero: false,
                    ticks: { font: { family: "Space Grotesk, sans-serif", size: 11 } },
                    grid: { color: "rgba(0, 0, 0, 0.05)" }
                },
                x: {
                    ticks: {
                        font: { family: "Space Grotesk, sans-serif", size: 10 },
                        maxRotation: 45,
                        minRotation: 45
                    },
                    grid: { color: "rgba(0, 0, 0, 0.05)" }
                }
            }
        }
    });
}

(function initChartModal() {
    const chartModal = document.getElementById("chart-modal");
    const closeChartModal = document.getElementById("close-chart-modal");
    const loadChartBtn = document.getElementById("load-chart-btn");

    if (closeChartModal) {
        closeChartModal.addEventListener("click", () => {
            if (chartModal) {
                chartModal.style.display = "none";
            }
            if (currentChart) {
                currentChart.destroy();
                currentChart = null;
            }
        });
    }

    if (chartModal) {
        chartModal.addEventListener("click", (event) => {
            if (event.target === chartModal) {
                chartModal.style.display = "none";
                if (currentChart) {
                    currentChart.destroy();
                    currentChart = null;
                }
            }
        });
    }

    if (loadChartBtn) {
        loadChartBtn.addEventListener("click", loadChartData);
    }
})();

requireAuth();
renderTime();
initMap();
setInterval(renderTime, 60000);

window.addEventListener("resize", () => {
    if (!sidebar || !sidebarOverlay) return;
    const open = sidebar.classList.contains("active");
    const showOverlay = open && window.innerWidth <= 768;
    sidebarOverlay.classList.toggle("active", showOverlay);
    sidebarOverlay.classList.toggle("show", showOverlay);
    if (map) map.invalidateSize();
});

document.addEventListener("headerLoaded", syncHeaderState);
document.addEventListener("sidebarLoaded", () => {
    syncSidebarState();
    syncLoggermapFilterState();
    if (loggermapFilterTva) loggermapFilterTva.checked = loggermapGroupFilter.tva;
    if (loggermapFilterMqtt) loggermapFilterMqtt.checked = loggermapGroupFilter.mqtt;
    if (loggermapFilterScada) loggermapFilterScada.checked = loggermapGroupFilter.scada;
    renderTime();

    const savedState = localStorage.getItem("sidebarOpen");
    const shouldOpen = savedState === null ? true : savedState === "true";
    applySidebarState(shouldOpen);
});

document.addEventListener("click", (event) => {
    const button = event.target.closest(".chart-btn");
    if (!button) return;
    const stationId = button.dataset.stationId || "";
    const stationName = button.dataset.stationName || "";
    const station = findStationById(stationId);
    const availableParams = buildAvailableParams(station);
    if (availableParams.length === 0) return;
    showMultiParameterChart(stationId, stationName, availableParams);
});

syncHeaderState();
syncSidebarState();
syncLoggermapFilterState();
if (loggermapFilterTva) loggermapFilterTva.checked = loggermapGroupFilter.tva;
if (loggermapFilterMqtt) loggermapFilterMqtt.checked = loggermapGroupFilter.mqtt;
if (loggermapFilterScada) loggermapFilterScada.checked = loggermapGroupFilter.scada;
bindToggleButton(headerMenuBtn);
