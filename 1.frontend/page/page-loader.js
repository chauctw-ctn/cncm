(async function () {
    const root = document.getElementById("layout-root");
    if (!root) return;

    const res = await fetch("/page/layout/layout.html");
    const html = await res.text();

    root.innerHTML = html;

    const script = document.createElement("script");
    script.src = "/page/layout/layout.js";
    script.onload = () => {
        if (window.initLayout) window.initLayout();
    };

    document.body.appendChild(script);
})();