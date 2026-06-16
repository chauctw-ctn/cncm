async function loadLayout() {
    const container = document.getElementById("layout-container");

    if (!container) return;

    const res = await fetch("/page/layout/layout.html");

    if (!res.ok) {
        console.error("Không load được layout.html:", res.status);
        return;
    }

    container.innerHTML = await res.text();

    const script = document.createElement("script");
    script.src = "/page/layout/layout.js";

    script.onload = () => {
        window.initLayout?.();
    };

    script.onerror = () => {
        console.error("Không load được layout.js");
    };

    document.body.appendChild(script);
}

document.addEventListener("DOMContentLoaded", loadLayout);