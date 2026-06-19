(function () {
  function initLayout(pageTitle) {
    const user = Auth.requireLogin();
    if (!user) return;

    document.body.insertAdjacentHTML(
      "afterbegin",
      `
      <header class="app-header">
        <button class="icon-btn" id="toggleSidebar">☰</button>                
        <div class="header-info" style="margin-left: 20px; font-size: 14px; line-height: 1.4;">
          <div>CÔNG TY CỔ PHẦN CẤP NƯỚC CÀ MAU</div>
          <div>Địa chỉ: Số 204, đường Quang Trung, Khóm 26, phường Tân Thành, tỉnh Cà Mau</div>
          <div>Điện thoại: 02903 836 360 - 02903 836 723 | Fax: 0290 383 6723</div>
        </div>        
        
        <div class="header-spacer"></div>
        <div class="header-user">${user.fullname || user.username}</div>
        <button class="logout-btn" onclick="Auth.logout()">Đăng xuất</button>
      </header>

      <aside class="app-sidebar">
        <div class="sidebar-logo">
          <img src="/shared/logo.jpg" alt="CAWACO Logo">
          <div class="sidebar-logo-text">
            <div>CAWACO</div>
            <small>${pageTitle || "SCADA Dashboard"}</small>
          </div>
        </div>

        <nav class="sidebar-menu">
          <a class="sidebar-link" href="/index.html">
            <span class="sidebar-icon">🏠</span>
            <span class="sidebar-text">Trang chủ</span>
          </a>

          <a class="sidebar-link" href="/logger-map.html">
            <span class="sidebar-icon">🗺️</span>
            <span class="sidebar-text">Logger Map</span>
          </a>

          <a class="sidebar-link" href="/quality-water.html">
            <span class="sidebar-icon">📊</span>
            <span class="sidebar-text">Chất lượng nước</span>
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

    const toggleBtn = document.getElementById("toggleSidebar");

    toggleBtn.onclick = () => {
      document.body.classList.toggle("sidebar-hidden");

      localStorage.setItem(
        "SIDEBAR_HIDDEN",
        document.body.classList.contains("sidebar-hidden") ? "1" : "0"
      );
    };

    if (localStorage.getItem("SIDEBAR_HIDDEN") === "1") {
      document.body.classList.add("sidebar-hidden");
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