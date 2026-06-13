(function () {
    "use strict";

    if (window.ScadaGauge) {
        return;
    }

    class ScadaGauge {
        constructor(containerId, options = {}) {
            this.container = document.getElementById(containerId);

            if (!this.container) {
                console.error(`Không tìm thấy phần tử: #${containerId}`);
                return;
            }

            this.min = Number(options.min ?? 0);
            this.max = Number(options.max ?? 14);
            this.value = Number(options.value ?? 0);

            this.title = options.title ?? "CHỈ SỐ pH";
            this.unit = options.unit ?? "pH";
            this.color = options.color ?? "#8BC34A";

            this.decimals = Number(options.decimals ?? 2);
            this.formatValue = options.formatValue || null;

            this.api = options.api || null;
            this.refreshInterval = Number(options.refreshInterval ?? 3000);
            this.timer = null;

            this.radius = 100;
            this.circumference = 2 * Math.PI * this.radius;
            this.arcLength = this.circumference * 0.75;

            this.render();
            this.setValue(this.value);

            if (this.api) {
                this.start();
            }
        }

        render() {
            this.container.innerHTML = `
                <div class="scada-gauge">
                    <div class="scada-gauge-container">
                        <svg viewBox="35 28 230 260" preserveAspectRatio="xMidYMid meet">
                            <g transform="rotate(135,150,175)">
                                <circle r="100" cx="150" cy="175" fill="#0D0D0D"></circle>

                                <circle
                                    r="100"
                                    cx="150"
                                    cy="175"
                                    stroke="#294273"
                                    stroke-width="20"
                                    stroke-linecap="round"
                                    stroke-dasharray="${this.arcLength} ${this.circumference}"
                                    fill="none">
                                </circle>

                                <circle
                                    class="gauge-progress"
                                    r="100"
                                    cx="150"
                                    cy="175"
                                    stroke="${this.color}"
                                    stroke-width="21"
                                    stroke-linecap="round"
                                    stroke-dasharray="0 ${this.circumference}"
                                    fill="none">
                                </circle>

                                <circle
                                    r="85"
                                    cx="150"
                                    cy="175"
                                    stroke="#F2F2F2"
                                    stroke-width="2"
                                    stroke-dasharray="399 533"
                                    fill="none">
                                </circle>
                            </g>

                            <g class="gauge-needle">
                                <polygon points="150,172 240,175 150,178" fill="#CCD0D9"></polygon>
                                <circle cx="150" cy="175" r="12" fill="#CCD0D9"></circle>
                                <circle cx="150" cy="175" r="5" fill="#0D0D0D"></circle>
                            </g>

                            <text fill="#FFFFFF" font-size="22" font-weight="700" font-family="Arial">
                                <tspan x="150" y="55" text-anchor="middle">${this.title}</tspan>
                            </text>

                            <text fill="#F2F2F2" font-size="18" font-family="Arial">
                                <tspan x="150" y="210" text-anchor="middle">${this.unit}</tspan>
                            </text>

                            <text fill="#FFFFFF" font-size="28" font-weight="700" font-family="Arial">
                                <tspan class="gauge-value" x="150" y="255" text-anchor="middle">0</tspan>
                            </text>
                        </svg>
                    </div>
                </div>
            `;

            this.progressEl = this.container.querySelector(".gauge-progress");
            this.needleEl = this.container.querySelector(".gauge-needle");
            this.valueEl = this.container.querySelector(".gauge-value");

            this.needleEl.style.transformOrigin = "150px 175px";
            this.needleEl.style.transition = "transform 0.5s ease-out";
            this.progressEl.style.transition = "stroke-dasharray 0.5s ease-out";
        }

        parseNumber(value) {
            if (value === null || value === undefined) {
                return NaN;
            }

            if (typeof value === "number") {
                return value;
            }

            let text = String(value).trim();

            if (!text) return NaN;

            text = text.replace(/\s/g, "");

            if (text.includes(",") && text.includes(".")) {
                text = text.replace(/\./g, "").replace(",", ".");
            } else {
                text = text.replace(/,/g, "");
            }

            return Number(text);
        }

        formatDisplayValue(value) {
            if (typeof this.formatValue === "function") {
                return this.formatValue(value);
            }

            return Number(value).toLocaleString("vi-VN", {
                minimumFractionDigits: this.decimals,
                maximumFractionDigits: this.decimals
            });
        }

        buildApiUrl() {
            if (!this.api) return null;

            if (this.api.url) {
                return this.api.url;
            }

            const params = new URLSearchParams();

            if (this.api.type === "sum") {
                params.set("source", this.api.source);
                params.set("parameter", this.api.parameter);
                params.set("station_ids", (this.api.stationIds || []).join(","));

                return `/api/sources/gauge-sum?${params.toString()}`;
            }

            if (this.api.type === "single") {
                params.set("source", this.api.source);
                params.set("station_id", this.api.stationId);
                params.set("parameter", this.api.parameter);

                return `/api/sources/gauge?${params.toString()}`;
            }

            return null;
        }

        async refresh() {
            const url = this.buildApiUrl();

            if (!url) return;

            try {
                const res = await fetch(url, {
                    cache: "no-store"
                });

                const json = await res.json();
                const value = this.parseNumber(json.value);

                if (json.success && Number.isFinite(value)) {
                    this.setValue(value);
                } else {
                    console.warn("Gauge API không có giá trị hợp lệ:", json);
                }
            } catch (err) {
                console.error("Lỗi tải dữ liệu gauge:", err);
            }
        }

        start() {
            this.stop();
            this.refresh();

            this.timer = setInterval(() => {
                this.refresh();
            }, this.refreshInterval);
        }

        stop() {
            if (this.timer) {
                clearInterval(this.timer);
                this.timer = null;
            }
        }

        setValue(value) {
            const parsedValue = this.parseNumber(value);

            if (!Number.isFinite(parsedValue)) {
                return;
            }

            const safeMax = this.max === this.min
                ? this.min + 1
                : this.max;

            const val = Math.max(this.min, Math.min(safeMax, parsedValue));
            const percent = (val - this.min) / (safeMax - this.min);

            const dash = this.arcLength * percent;

            this.progressEl.setAttribute(
                "stroke-dasharray",
                `${dash} ${this.circumference}`
            );

            const angle = 135 + percent * 270;
            this.needleEl.style.transform = `rotate(${angle}deg)`;

            this.value = val;
            this.valueEl.textContent = this.formatDisplayValue(val);
        }

        setTitle(title) {
            this.title = title;
            this.render();
            this.setValue(this.value);
        }

        setApi(api) {
            this.api = api;
            this.start();
        }
    }

    window.ScadaGauge = ScadaGauge;
})();