// /page/layout/layout.js

(() => {
    "use strict";

    const STORAGE_KEYS = {
        theme: "theme",
        sidebar: "sidebar-collapsed"
    };

    function ready(fn) {
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", fn, { once: true });
        } else {
            fn();
        }
    }

    function initLayout() {
        initTheme();
        initSidebar();
        initUserMenu();
        initAuthModals();
        showAdminMenus(window.currentUserRole || "admin");
    }

    /* =========================
       THEME
    ========================= */

    function initTheme() {
        const savedTheme =
            localStorage.getItem(STORAGE_KEYS.theme) || "dark";

        setTheme(savedTheme);
        createThemeButton();
    }

    function createThemeButton() {
        const authSection = document.querySelector(".auth-section");

        if (!authSection) return;
        if (document.getElementById("theme-toggle-btn")) return;

        const btn = document.createElement("button");

        btn.id = "theme-toggle-btn";
        btn.className = "theme-toggle-btn";
        btn.type = "button";
        btn.title = "Đổi giao diện";

        btn.innerHTML = getThemeIcon();

        btn.addEventListener("click", () => {
            const current =
                document.documentElement.getAttribute("data-theme") ||
                "dark";

            const next =
                current === "dark"
                    ? "light"
                    : "dark";

            setTheme(next);

            localStorage.setItem(
                STORAGE_KEYS.theme,
                next
            );

            btn.innerHTML = getThemeIcon();
        });

        authSection.prepend(btn);
    }

    function setTheme(theme) {
        const safeTheme =
            theme === "light"
                ? "light"
                : "dark";

        document.documentElement.setAttribute(
            "data-theme",
            safeTheme
        );
    }

    function getThemeIcon() {
        const theme =
            document.documentElement.getAttribute("data-theme") ||
            "dark";

        return theme === "dark"
            ? "☀️"
            : "🌙";
    }

    /* =========================
       SIDEBAR
    ========================= */

    function initSidebar() {

        const menuBtn =
            document.getElementById("menu-btn");

        const sidebarNav =
            document.querySelector(".sidebar-nav");

        const overlay =
            document.getElementById("sidebar-overlay");

        if (!menuBtn || !sidebarNav) return;

        if (menuBtn.dataset.sidebarReady === "true") return;

        menuBtn.dataset.sidebarReady = "true";

        const collapsed =
            localStorage.getItem(STORAGE_KEYS.sidebar);

        if (collapsed === "true") {
            document.body.classList.add(
                "sidebar-collapsed"
            );
        }

        syncSidebarButton();

        menuBtn.addEventListener("click", () => {
            const isMobile = window.innerWidth <= 768;

            if (isMobile) {
                document.body.classList.toggle("sidebar-open");
                syncSidebarButton();
                return;
            }

            const isCollapsed = document.body.classList.contains("sidebar-collapsed");
            const isHiding = document.body.classList.contains("sidebar-hiding");

            if (isHiding) return;

            if (isCollapsed) {
                // MỞ: hiện từ trên xuống
                document.body.classList.remove("sidebar-collapsed");
                localStorage.setItem(STORAGE_KEYS.sidebar, "false");
                syncSidebarButton();
                return;
            }

            // ĐÓNG: ẩn từ dưới lên
            document.body.classList.add("sidebar-hiding");

            setTimeout(() => {
                document.body.classList.add("sidebar-collapsed");
                document.body.classList.remove("sidebar-hiding");
                localStorage.setItem(STORAGE_KEYS.sidebar, "true");
                syncSidebarButton();
            }, 1200);
        });

        overlay?.addEventListener("click", () => {

            document.body.classList.remove(
                "sidebar-open"
            );

            syncSidebarButton();
        });

        window.addEventListener("resize", () => {

            if (window.innerWidth > 768) {
                document.body.classList.remove(
                    "sidebar-open"
                );
            }

            syncSidebarButton();
        });

        setActiveSidebarLink();
    }

    function syncSidebarButton() {

        const menuBtn =
            document.getElementById("menu-btn");

        if (!menuBtn) return;

        const expanded =
            window.innerWidth <= 768
                ? document.body.classList.contains(
                      "sidebar-open"
                  )
                : !document.body.classList.contains(
                      "sidebar-collapsed"
                  );

        menuBtn.setAttribute(
            "aria-expanded",
            expanded
        );
    }

    /* =========================
       ACTIVE MENU
    ========================= */

    function setActiveSidebarLink() {

        const currentPath =
            normalizePath(location.pathname);

        document
            .querySelectorAll(".sidebar-link")
            .forEach(link => {

                const href =
                    normalizePath(
                        link.getAttribute("href")
                    );

                link.classList.toggle(
                    "active",
                    href === currentPath
                );
            });
    }

    function normalizePath(path) {

        if (!path || path === "/") {
            return "/index.html";
        }

        return path
            .split("?")[0]
            .replace(/\/$/, "/index.html");
    }

    /* =========================
       USER MENU
    ========================= */

    function initUserMenu() {

        const btn =
            document.getElementById(
                "user-menu-btn"
            );

        const dropdown =
            document.getElementById(
                "user-dropdown"
            );

        if (!btn || !dropdown) return;

        if (btn.dataset.ready === "true")
            return;

        btn.dataset.ready = "true";

        btn.addEventListener("click", e => {

            e.stopPropagation();

            dropdown.classList.toggle(
                "show"
            );

            btn.classList.toggle(
                "active"
            );
        });

        dropdown.addEventListener(
            "click",
            e => e.stopPropagation()
        );

        document.addEventListener(
            "click",
            () => {

                dropdown.classList.remove(
                    "show"
                );

                btn.classList.remove(
                    "active"
                );
            }
        );
    }

    /* =========================
       MODAL
    ========================= */

    function initAuthModals() {

        document
            .querySelectorAll(
                "[data-auth-close]"
            )
            .forEach(btn => {

                if (
                    btn.dataset.modalReady ===
                    "true"
                ) {
                    return;
                }

                btn.dataset.modalReady = "true";

                btn.addEventListener(
                    "click",
                    () =>
                        closeModal(
                            btn.dataset.authClose
                        )
                );
            });

        document
            .querySelectorAll(".auth-modal")
            .forEach(modal => {

                if (
                    modal.dataset.overlayReady ===
                    "true"
                ) {
                    return;
                }

                modal.dataset.overlayReady =
                    "true";

                modal.addEventListener(
                    "click",
                    e => {

                        if (
                            e.target === modal
                        ) {
                            closeModal(
                                modal.id
                            );
                        }
                    }
                );
            });
    }

    function openModal(id) {

        const modal =
            document.getElementById(id);

        if (!modal) return;

        modal.classList.add("show");

        modal.setAttribute(
            "aria-hidden",
            "false"
        );
    }

    function closeModal(id) {

        const modal =
            document.getElementById(id);

        if (!modal) return;

        modal.classList.remove(
            "show",
            "active"
        );

        modal.setAttribute(
            "aria-hidden",
            "true"
        );
    }

    /* =========================
       ROLE
    ========================= */

    function showAdminMenus(role) {

        [
            "add-user-btn",
            "manage-users-btn",
            "telegram-config-btn",
            "coordinates-config-btn"
        ].forEach(id => {

            const btn =
                document.getElementById(id);

            if (!btn) return;

            btn.style.display =
                role === "admin"
                    ? "flex"
                    : "none";
        });
    }

    window.initLayout = initLayout;
    window.initHeader = initLayout;
    window.initSidebar = initSidebar;
    window.setTheme = setTheme;
    window.openAuthModal = openModal;
    window.closeAuthModal = closeModal;

    ready(initLayout);

})();