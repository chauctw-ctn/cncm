(() => {
    "use strict";

    const STORAGE_KEY = "sidebar-collapsed";
    const MOBILE_WIDTH = 768;
    const SIDEBAR_ANIMATION_TIME = 760;

    function ready(fn) {
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", fn, { once: true });
        } else {
            fn();
        }
    }

    function isMobile() {
        return window.innerWidth <= MOBILE_WIDTH;
    }

    function initLayout() {
        initUserInfo();
        initSidebar();
        initUserMenu();
        initModals();
        setActiveSidebarLink();
    }

    function initUserInfo() {
        const currentUser = window.currentUser || {
            username: "admin",
            role: "admin"
        };

        setText("username-display", currentUser.username);
        setText("dropdown-username", currentUser.username);
        setText(
            "dropdown-role",
            currentUser.role === "admin" ? "Quản trị viên" : "Nhân viên"
        );

        document.querySelectorAll(".admin-only").forEach(el => {
            el.style.display = currentUser.role === "admin" ? "flex" : "none";
        });
    }

    function initSidebar() {
        const menuBtn = document.getElementById("menu-btn");
        const overlay = document.getElementById("sidebar-overlay");

        if (!menuBtn || menuBtn.dataset.ready === "true") return;

        menuBtn.dataset.ready = "true";

        if (!isMobile()) {
            const saved = localStorage.getItem(STORAGE_KEY) === "true";
            document.body.classList.toggle("sidebar-collapsed", saved);
        }

        syncMenuButton();

        menuBtn.addEventListener("click", () => {
            if (isMobile()) {
                document.body.classList.toggle("sidebar-open");
                document.body.classList.remove("sidebar-collapsed");
                syncMenuButton();
                return;
            }

            const isCollapsed = document.body.classList.contains("sidebar-collapsed");
            const isHiding = document.body.classList.contains("sidebar-hiding");

            if (isHiding) return;

            if (isCollapsed) {
                document.body.classList.remove("sidebar-collapsed");
                localStorage.setItem(STORAGE_KEY, "false");
                syncMenuButton();
                return;
            }

            document.body.classList.add("sidebar-hiding");

            setTimeout(() => {
                document.body.classList.add("sidebar-collapsed");
                document.body.classList.remove("sidebar-hiding");
                localStorage.setItem(STORAGE_KEY, "true");
                syncMenuButton();
            }, SIDEBAR_ANIMATION_TIME);
        });

        overlay?.addEventListener("click", () => {
            document.body.classList.remove("sidebar-open");
            syncMenuButton();
        });

        window.addEventListener("resize", () => {
            document.body.classList.remove("sidebar-hiding");

            if (isMobile()) {
                document.body.classList.remove("sidebar-collapsed");
            } else {
                document.body.classList.remove("sidebar-open");

                const saved = localStorage.getItem(STORAGE_KEY) === "true";
                document.body.classList.toggle("sidebar-collapsed", saved);
            }

            syncMenuButton();
        });

        document.querySelectorAll(".sidebar-link").forEach(link => {
            link.addEventListener("click", () => {
                if (isMobile()) {
                    document.body.classList.remove("sidebar-open");
                    syncMenuButton();
                }
            });
        });
    }

    function syncMenuButton() {
        const menuBtn = document.getElementById("menu-btn");
        if (!menuBtn) return;

        const opened = isMobile()
            ? document.body.classList.contains("sidebar-open")
            : !document.body.classList.contains("sidebar-collapsed");

        menuBtn.textContent = opened ? "✕" : "☰";
        menuBtn.setAttribute("aria-expanded", String(opened));
        menuBtn.setAttribute("aria-label", opened ? "Đóng menu" : "Mở menu");
    }

    function initUserMenu() {
        const btn = document.getElementById("user-menu-btn");
        const dropdown = document.getElementById("user-dropdown");

        if (!btn || !dropdown || btn.dataset.ready === "true") return;

        btn.dataset.ready = "true";

        btn.addEventListener("click", e => {
            e.stopPropagation();
            dropdown.classList.toggle("show");
            btn.classList.toggle("active");
        });

        dropdown.addEventListener("click", e => e.stopPropagation());

        document.addEventListener("click", () => {
            dropdown.classList.remove("show");
            btn.classList.remove("active");
        });
    }

    function initModals() {
        bindOpenModal("change-password-btn", "change-password-modal");
        bindOpenModal("add-user-btn", "add-user-modal");

        document.querySelectorAll("[data-auth-close]").forEach(btn => {
            if (btn.dataset.ready === "true") return;

            btn.dataset.ready = "true";

            btn.addEventListener("click", () => {
                closeModal(btn.dataset.authClose);
            });
        });

        document.querySelectorAll(".auth-modal").forEach(modal => {
            if (modal.dataset.ready === "true") return;

            modal.dataset.ready = "true";

            modal.addEventListener("click", e => {
                if (e.target === modal) closeModal(modal.id);
            });
        });

        const changePasswordForm = document.getElementById("change-password-form");

        if (changePasswordForm && changePasswordForm.dataset.ready !== "true") {
            changePasswordForm.dataset.ready = "true";
            changePasswordForm.addEventListener("submit", handleChangePassword);
        }
    }

    function bindOpenModal(buttonId, modalId) {
        const btn = document.getElementById(buttonId);

        if (!btn || btn.dataset.modalOpenReady === "true") return;

        btn.dataset.modalOpenReady = "true";

        btn.addEventListener("click", () => {
            closeUserDropdown();
            openModal(modalId);
        });
    }

    function openModal(id) {
        const modal = document.getElementById(id);
        if (!modal) return;

        modal.classList.add("show");
        modal.setAttribute("aria-hidden", "false");
    }

    function closeModal(id) {
        const modal = document.getElementById(id);
        if (!modal) return;

        modal.classList.remove("show");
        modal.setAttribute("aria-hidden", "true");
    }

    function closeUserDropdown() {
        const btn = document.getElementById("user-menu-btn");
        const dropdown = document.getElementById("user-dropdown");

        btn?.classList.remove("active");
        dropdown?.classList.remove("show");
    }

    function handleChangePassword(e) {
        e.preventDefault();

        const newPass = document.getElementById("new-password")?.value || "";
        const confirmPass = document.getElementById("confirm-password")?.value || "";
        const errorEl = document.getElementById("change-password-error");

        if (newPass !== confirmPass) {
            if (errorEl) errorEl.textContent = "Mật khẩu nhập lại không trùng khớp!";
            return;
        }

        if (errorEl) errorEl.textContent = "";
        closeModal("change-password-modal");
    }

    function setActiveSidebarLink() {
        const currentPath = normalizePath(location.pathname);

        document.querySelectorAll(".sidebar-link").forEach(link => {
            const href = normalizePath(link.getAttribute("href"));
            link.classList.toggle("active", href === currentPath);
        });
    }

    function normalizePath(path) {
        if (!path || path === "/") return "/page/dashboard.html";

        return path
            .split("?")[0]
            .split("#")[0]
            .replace(/\/$/, "");
    }

    function setText(id, value) {
        const el = document.getElementById(id);
        if (el) el.textContent = value || "";
    }

    window.initLayout = initLayout;
    window.openAuthModal = openModal;
    window.closeAuthModal = closeModal;

    ready(initLayout);
})();