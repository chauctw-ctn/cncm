node src/db/init.js
node index.js

http://localhost:3000/api/health
http://localhost:3000/api/logger/points
http://localhost:3000/api/logger/readings/map


http://localhost:3000/test-logger-map.html
http://localhost:3000/test-logger-api.html
http://localhost:3000/logger-config.html
http://localhost:3000/kpi-config.html


35/gp-btnmt: CLNQT4, G1, G2, G4, G12, G15, G18, G20, G22, G23, G24, G25, G27, QT3, QT4, QT5
36/gp-btnmt: CLNGS4NM2, GS1NM2, GS2NM2, GS3NM2, GS4NM2, QT1NM2, QT2NM2
391/gp-bnnmt: G21, G26, QT2M
393/gp-bnnmt: CLNGS5NM1, GS1NM1, GS2NM1, GS3NM1, GS4NM1, GS5NM1, QT1NM1, QT2NM1












1. Nhà máy 1: 
nm1@canthowassco.vn
V8#qLm!2Xr@7Np$K
2. Nhà máy Hưng Phú: 
nmhp@canthowassco.vn
dT9&Hy*4Za%1Wm!Q
3. Nhà máy Bông Vang: 
nmbv@canthowassco.vn
R@6jPk#8Cv!3Ls$E
4. Tổng quan: 
tongquan@canthowassco.vn
nM$7Xq&2Bt@9Zd!F
5. Trạm tăng áp: 
tta@canthowassco.vn
Y!4Kr#8Wp$6Hv@Nc
6. Chất lượng nước: 
cln@canthowassco.vn
gP@3Lm&9Qx!7Ts#D

<<<<<<< HEAD
git add .
git comit -m "custom history.html"
git push

git pull origin main


fix logger-map.html
-tạo trang hiển thị các điểm logger trên map google với api key(tôi sẽ cập nhật api key)
-sử dụng icon maker: shared/icon-offline.gif và icon-online.gif 
-popup maker: hiển thị các thông tin logger


Test API bằng PowerShell

$body = @{
  api_key = "123456"
  source = "device"
  raw_id = "g45"
  logger_id = "device_g45"
  name = "Logger G45"
  lat = 9.1835
  lng = 105.152611
  ts = "2026-06-19 10:20:00"
  tags = @{
    flow = @{
      value = 30
      unit = "m³/h"
      tag_name = "Lưu lượng"
    }
    level = @{
      value = 31.5
      unit = "m"
      tag_name = "Mực nước"
    }
    totalIndex = @{
      value = 535209
      unit = "m³"
      tag_name = "Tổng lưu lượng"
    }
  }
} | ConvertTo-Json -Depth 10

Invoke-RestMethod `
  -Uri "http://localhost:3000/api/ingest/logger" `
  -Method POST `
  -ContentType "application/json" `
  -Body $body

  Test trên Render
  $body = @{
  api_key = "123456"
  source = "device"
  raw_id = "g46"
  logger_id = "device_g45"
  name = "Logger G46"
  lat = 9.1835
  lng = 105.152611
  ts = "2026-06-19 10:20:00"
  tags = @{
    flow = @{
      value = 30
      unit = "m³/h"
      tag_name = "Lưu lượng"
    }
    level = @{
      value = 31.5
      unit = "m"
      tag_name = "Mực nước"
    }
    totalIndex = @{
      value = 535209
      unit = "m³"
      tag_name = "Tổng lưu lượng"
    }
  }
} | ConvertTo-Json -Depth 10
  Invoke-RestMethod `
  -Uri "https://cncm-oguh.onrender.com/api/ingest/logger" `
  -Method POST `
  -ContentType "application/json" `
  -Body $body



postgresql://postgres:[YOUR-PASSWORD]@db.uxykynfwfcpxwxfogjyq.supabase.co:5432/postgres
Pass: CeFlksOPXBJs8yi8

postgresql://postgres.uxykynfwfcpxwxfogjyq:CeFlksOPXBJs8yi8@aws-1-ap-southeast-2.pooler.supabase.com:6543/postgres