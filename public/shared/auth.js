(function () {
  const DEFAULT_USERS = [
    {
      username: "admin",
      password: "admin123",
      fullname: "Administrator",
      role: "admin",
      enabled: true
    }
  ];

  function getUsers() {
    const raw = localStorage.getItem("APP_USERS");
    if (!raw) {
      localStorage.setItem("APP_USERS", JSON.stringify(DEFAULT_USERS));
      return DEFAULT_USERS;
    }

    try {
      return JSON.parse(raw);
    } catch {
      localStorage.setItem("APP_USERS", JSON.stringify(DEFAULT_USERS));
      return DEFAULT_USERS;
    }
  }

  function saveUsers(users) {
    localStorage.setItem("APP_USERS", JSON.stringify(users));
  }

  function getCurrentUser() {
    const raw = sessionStorage.getItem("CURRENT_USER");
    return raw ? JSON.parse(raw) : null;
  }

  function login(username, password) {
    const users = getUsers();

    const user = users.find(
      u =>
        u.username === username &&
        u.password === password &&
        u.enabled !== false
    );

    if (!user) return null;

    const sessionUser = {
      username: user.username,
      fullname: user.fullname,
      role: user.role
    };

    sessionStorage.setItem("CURRENT_USER", JSON.stringify(sessionUser));

    return sessionUser;
  }

  function logout() {
    sessionStorage.removeItem("CURRENT_USER");
    location.href = "/login.html";
  }

  function requireLogin() {
    const user = getCurrentUser();

    if (!user) {
      location.href = "/login.html";
      return null;
    }

    return user;
  }

  window.Auth = {
    getUsers,
    saveUsers,
    getCurrentUser,
    login,
    logout,
    requireLogin
  };
})();