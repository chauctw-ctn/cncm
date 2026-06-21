"use strict";

const { openDb } = require("./connection");

// ==================================================================
// 1. API LẤY DỮ LIỆU MỚI NHẤT (BỔ SUNG DATA_TS VÀ SAVED_TS VÀO METRICS)
// ==================================================================
exports.getLatest = (req, res) => {
  const { logger_id, station_id } = req.query;
  const targetId = station_id || logger_id;

  const db = openDb();
  
  // Lấy thêm trường l.saved_ts từ bảng dữ liệu thô logger_latest
  let sql = `
    SELECT 
      l.logger_id,
      l.tag_key AS parameter_key,
      l.value,
      l.data_ts,
      l.saved_ts,
      s.display_name,
      s.lat,
      s.lng,
      s.description,
      m.source
    FROM logger_latest l
    LEFT JOIN logger_tag_mappings m ON l.tag_key = m.parameter_key 
      AND l.logger_id = (m.source || '_' || m.hardware_tag)
    LEFT JOIN logger_stations s ON (
      s.station_id = m.target_station_id 
      OR s.station_id = SUBSTR(l.logger_id, INSTR(l.logger_id, '_') + 1)
    )
  `;

  const params = [];
  
  if (targetId) {
    sql += ` WHERE l.logger_id = ? OR s.station_id = ? OR SUBSTR(l.logger_id, INSTR(l.logger_id, '_') + 1) = ? `;
    const cleanId = targetId.toLowerCase().trim();
    params.push(cleanId, cleanId, cleanId);
  }

  db.all(sql, params, (err, rows) => {
    db.close();
    if (err) return res.status(500).json({ success: false, error: err.message });

    const mapData = {};

    rows.forEach(row => {
      const loggerId = row.logger_id;
      
      const underscoreIdx = loggerId.indexOf("_");
      let extractedSource = row.source || "unknown";
      let rawStationId = loggerId;

      if (underscoreIdx !== -1) {
        if (!row.source) extractedSource = loggerId.substring(0, underscoreIdx);
        rawStationId = loggerId.substring(underscoreIdx + 1);
      }

      if (!mapData[loggerId]) {
        mapData[loggerId] = {
          station_id: loggerId,
          source: extractedSource,
          display_name: row.display_name || `Trạm ${rawStationId.toUpperCase()}`,
          lat: row.lat !== undefined && row.lat !== null ? row.lat : null,
          lng: row.lng !== undefined && row.lng !== null ? row.lng : null,
          description: row.description || "Thiếu dữ liệu cấu hình tọa độ",
          // Đưa mốc thời gian chung của gói tin ra ngoài nếu cần thiết
          data_ts: row.data_ts || null,
          saved_ts: row.saved_ts || null,
          metrics: {}
        };
      }
      
      // Đổ dữ liệu đo vào metrics
      if (row.parameter_key && row.value !== null && row.value !== undefined) {
        mapData[loggerId].metrics[row.parameter_key] = row.value;
        
        // Cập nhật lại mốc thời gian mới nhất nếu các tag có timeline khác nhau
        if (row.data_ts) mapData[loggerId].data_ts = row.data_ts;
        if (row.saved_ts) mapData[loggerId].saved_ts = row.saved_ts;
      }
    });

    res.json({ 
      success: true, 
      count: Object.keys(mapData).length, 
      data: Object.values(mapData) 
    });
  });
};

// ==================================================================
// 2. API LẤY DANH SÁCH CẤU HÌNH (DÙNG CHO TRANG QUẢN TRỊ ADMIN SETTINGS)
// ==================================================================
exports.getAllStations = (req, res) => {
  const db = openDb();
  
  db.all("SELECT * FROM logger_stations ORDER BY station_id ASC", [], (err, stations) => {
    if (err) { db.close(); return res.status(500).json({ success: false, error: err.message }); }
    
    db.all("SELECT * FROM logger_tag_mappings", [], (err2, tags) => {
      db.close();
      if (err2) return res.status(500).json({ success: false, error: err2.message });

      // Gộp mảng danh sách Tag Mapping chi tiết vào từng trạm tương ứng
      const result = stations.map(st => ({
        ...st,
        lat: st.lat !== null ? st.lat : null,
        lng: st.lng !== null ? st.lng : null,
        tags: tags.filter(t => t.target_station_id === st.station_id)
      }));
      
      res.json({ success: true, count: result.length, data: result });
    });
  });
};

// ==================================================================
// 3. API CẬP NHẬT TRẠM (ĐỔI TÊN NHÃN / CẬP NHẬT TOẠ ĐỘ QUA API)
// ==================================================================
exports.updateStation = (req, res) => {
  const { station_id } = req.params;
  const { display_name, lat, lng, description } = req.body;

  if (!display_name) {
    return res.status(400).json({ success: false, error: "Tên nhãn hiển thị không được để trống!" });
  }

  const db = openDb();
  
  // Sử dụng cú pháp INSERT ... ON CONFLICT để tự động chuyển hướng thành UPDATE nếu trùng khóa chính
  const sql = `
    INSERT INTO logger_stations (station_id, display_name, lat, lng, description)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(station_id) DO UPDATE SET
      display_name = excluded.display_name,
      lat = excluded.lat,
      lng = excluded.lng,
      description = excluded.description
  `;

  const finalLat = lat !== undefined && lat !== "" && lat !== null ? Number(lat) : null;
  const finalLng = lng !== undefined && lng !== "" && lng !== null ? Number(lng) : null;
  const cleanStationId = station_id.toLowerCase().trim();

  db.run(sql, [cleanStationId, display_name, finalLat, finalLng, description || ""], function(err) {
    db.close();
    if (err) return res.status(500).json({ success: false, error: err.message });
    
    res.json({ 
      success: true, 
      message: `Đã đồng bộ thành công cấu hình trạm [${cleanStationId}] vào hệ thống!` 
    });
  });
};

// ==================================================================
// 4. API TẠO MỚI TRẠM ĐIỂM GHIM
// ==================================================================
exports.createStation = (req, res) => {
  const { station_id, display_name, lat, lng, description } = req.body;
  if (!station_id || !display_name) {
    return res.status(400).json({ success: false, error: "Thiếu mã định danh hoặc tên nhãn hiển thị của trạm!" });
  }

  const db = openDb();
  const finalLat = lat !== undefined && lat !== "" && lat !== null ? Number(lat) : null;
  const finalLng = lng !== undefined && lng !== "" && lng !== null ? Number(lng) : null;

  db.run(
    "INSERT INTO logger_stations (station_id, display_name, lat, lng, description) VALUES (?, ?, ?, ?, ?)",
    [station_id.toLowerCase().trim(), display_name, finalLat, finalLng, description || ""],
    function(err) {
      db.close();
      if (err) return res.status(500).json({ success: false, error: "Mã trạm này đã tồn tại trên hệ thống!" });
      res.json({ success: true, message: "Thêm điểm trạm mới thành công!" });
    }
  );
};

// ==================================================================
// 5. API XÓA ĐIỂM TRẠM KHỎI HỆ THỐNG CẤU HÌNH
// ==================================================================
exports.deleteStation = (req, res) => {
  const { station_id } = req.params;
  const db = openDb();
  
  db.run("DELETE FROM logger_stations WHERE station_id = ?", [station_id.toLowerCase().trim()], function(err) {
    db.close();
    if (err) return res.status(500).json({ success: false, error: err.message });
    res.json({ success: true, message: "Đã gỡ bỏ trạm hoàn toàn khỏi cấu hình bản đồ." });
  });
};

// ==================================================================
// 6. API MAPPING TAG (GÁN THÊM TAG CẢM BIẾN VÀO TRẠM)
// ==================================================================
exports.addTagMapping = (req, res) => {
  const { source, hardware_tag, parameter_key, target_station_id } = req.body;
  if (!source || !hardware_tag || !parameter_key || !target_station_id) {
    return res.status(400).json({ success: false, error: "Vui lòng điền đầy đủ thông tin ánh xạ!" });
  }

  const db = openDb();
  db.run(
    "INSERT INTO logger_tag_mappings (source, hardware_tag, parameter_key, target_station_id) VALUES (?, ?, ?, ?)",
    [source.toLowerCase().trim(), hardware_tag.trim(), parameter_key.trim(), target_station_id.toLowerCase().trim()],
    function(err) {
      db.close();
      if (err) return res.status(500).json({ success: false, error: "Cặp thông số thô từ thiết bị này đã được gán cấu hình!" });
      res.json({ success: true, message: "Gán thông số cảm biến vào trạm thành công!", id: this.lastID });
    }
  );
};

// ==================================================================
// 7. API GỠ BỎ MAPPING TAG KHỎI TRẠM
// ==================================================================
exports.deleteTagMapping = (req, res) => {
  const { id } = req.params;
  const db = openDb();
  db.run("DELETE FROM logger_tag_mappings WHERE id = ?", [id], function(err) {
    db.close();
    if (err) return res.status(500).json({ success: false, error: err.message });
    res.json({ success: true, message: "Đã xóa bỏ liên kết thông số." });
  });
};

// ==================================================================
// 8. API XEM LỊCH SỬ PHỤC VỤ BIỂU ĐỒ (CHART HISTORY)
// ==================================================================
exports.getHistory = (req, res) => {
  const { logger_id, tag_key, from_date, to_date, limit } = req.query;
  if (!logger_id || !tag_key) return res.status(400).json({ success: false, error: "Thiếu mã thiết bị hoặc thông số đo!" });

  const db = openDb();
  let sql = `SELECT data_ts, value FROM logger_readings WHERE logger_id = ? AND tag_key = ?`;
  const params = [logger_id, tag_key];

  if (from_date) { sql += " AND data_ts >= ?"; params.push(from_date); }
  if (to_date) { sql += " AND data_ts <= ?"; params.push(to_date); }
  
  sql += " ORDER BY data_ts ASC LIMIT ?";
  params.push(limit ? parseInt(limit, 10) : 100);

  db.all(sql, params, (err, rows) => {
    db.close();
    if (err) return res.status(500).json({ success: false, error: err.message });
    
    const values = rows.map(r => r.value);
    res.json({
      success: true,
      logger_id,
      tag_key,
      summary: {
        min: values.length ? Math.min(...values) : 0,
        max: values.length ? Math.max(...values) : 0,
        avg: values.length ? Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(2)) : 0
      },
      chart: {
        labels: rows.map(r => r.data_ts),
        datasets: values
      },
      raw: rows
    });
  });
};