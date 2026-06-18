(function () {
  function initLayout(pageTitle) {
    const user = Auth.requireLogin();
    if (!user) return;

    document.body.insertAdjacentHTML(
      "afterbegin",
      `
      <header class="app-header">
        <button class="icon-btn" id="toggleSidebar">☰</button>
        <div class="header-title">${pageTitle || "CAWACO Dashboard"}</div>
        <div class="header-spacer"></div>
        <div class="header-user">${user.fullname || user.username}</div>
        <button class="logout-btn" onclick="Auth.logout()">Đăng xuất</button>
      </header>

      <aside class="app-sidebar">
        <nav class="sidebar-menu">
          <a class="sidebar-link" href="/index.html">
            <span class="sidebar-icon">🏠</span>
            <span class="sidebar-text">Trang chủ</span>
          </a>

          <a class="sidebar-link" href="/logger-map.html">
            <span class="sidebar-icon">🗺️</span>
            <span class="sidebar-text">Logger Map</span>
          </a>

          <a class="sidebar-link" href="/kpi.html">
            <span class="sidebar-icon">📊</span>
            <span class="sidebar-text">KPI</span>
          </a>

          <a class="sidebar-link" href="/history.html">
            <span class="sidebar-icon">🕘</span>
            <span class="sidebar-text">Lịch sử</span>
          </a>

          <a class="sidebar-link" href="/settings.html">
            <span class="sidebar-icon">⚙️</span>
            <span class="sidebar-text">Cài đặt</span>
          </a>
        </nav>
      </aside>
      `
    );

    document.getElementById("toggleSidebar").onclick = () => {
      document.body.classList.toggle("sidebar-collapsed");
      localStorage.setItem(
        "SIDEBAR_COLLAPSED",
        document.body.classList.contains("sidebar-collapsed") ? "1" : "0"
      );
    };

    if (localStorage.getItem("SIDEBAR_COLLAPSED") === "1") {
      document.body.classList.add("sidebar-collapsed");
    }

    const path = location.pathname;
    document.querySelectorAll(".sidebar-link").forEach(link => {
      if (link.getAttribute("href") === path) {
        link.classList.add("active");
      }
    });
  }

  window.AppLayout = {
    initLayout
  };
})();