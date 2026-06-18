node src/db/init.js
node index.js

http://localhost:3000/api/health
http://localhost:3000/api/logger/points
http://localhost:3000/api/logger/readings/map


http://localhost:3000/test-logger-map.html
http://localhost:3000/test-logger-api.html
http://localhost:3000/logger-config.html

http://localhost:3000/kpi-config.html












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



// Cấu hình Database PostgreSQL
    database: {
        url: process.env.DATABASE_URL || 'postgresql://postgres.llehbswibzhtsqgdulux:CR0kEeWlb8vemvuz@aws-1-ap-southeast-2.pooler.supabase.com:6543/postgres',
        ssl: {
            rejectUnauthorized: false
        },
        options: '-c TimeZone=Asia/Ho_Chi_Minh',