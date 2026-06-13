// Login form handler
document.getElementById("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    
    const username = document.getElementById("username").value;
    const password = document.getElementById("password").value;
    const errorMessage = document.getElementById("error-message");
    const submitBtn = e.target.querySelector("button[type=\"submit\"]");
    const btnText = submitBtn.querySelector(".btn-text");
    const spinner = submitBtn.querySelector(".spinner");
    
    // Clear previous error
    errorMessage.classList.remove("show");
    errorMessage.textContent = "";
    
    // Show loading state
    submitBtn.disabled = true;
    submitBtn.classList.add("loading");
    btnText.textContent = "Đang đăng nhập...";
    spinner.style.display = "inline-block";
    
    try {
        const response = await fetch("/api/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password })
        });
        const result = await response.json();

        if (response.ok && result.success) {
            localStorage.setItem("authToken", result.token || "");
            localStorage.setItem("username", result.user?.username || username);
            localStorage.setItem("userRole", result.user?.role || "user");
            localStorage.setItem("userStatus", result.user?.status || "active");

            document.body.classList.add("transitioning");
            document.querySelector(".page-transition-overlay").classList.add("active");

            setTimeout(() => {
                window.location.href = result.redirectPath || "/main/index.html";
            }, 400);
        } else {
            errorMessage.textContent = result.message || "Sai ten dang nhap hoac mat khau";
            errorMessage.classList.add("show");

            submitBtn.disabled = false;
            submitBtn.classList.remove("loading");
            btnText.textContent = "Đăng nhập";
            spinner.style.display = "none";
        }
    } catch (error) {
        console.error("Login error:", error);
        errorMessage.textContent = "Khong the dang nhap. Vui long thu lai.";
        errorMessage.classList.add("show");

        submitBtn.disabled = false;
        submitBtn.classList.remove("loading");
        btnText.textContent = "Đăng nhập";
        spinner.style.display = "none";
    }
});

// Check if already logged in
window.addEventListener("load", () => {
    const token = localStorage.getItem("authToken");
    if (token) {
        window.location.href = "/main/index.html";
    }
});