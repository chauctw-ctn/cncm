const adminCtrl = require("./adminController");

// Tuyến điều hướng quản lý Người dùng (User Management)
router.get("/api/users", adminCtrl.getUsers);
router.post("/api/users", adminCtrl.createUser);
router.delete("/api/users/:id", adminCtrl.deleteUser);

// Tuyến điều hướng cài đặt Ngưỡng Cảnh báo (Alert Rules)
router.get("/api/alerts/thresholds", adminCtrl.getThresholds);
router.post("/api/alerts/thresholds", adminCtrl.upsertThreshold);

// Tuyến cài đặt kết nối Telegram
router.put("/api/alerts/telegram/config", adminCtrl.updateTelegramConfig);