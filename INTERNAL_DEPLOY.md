# KST Delivery Tracker — คู่มือรันในบริษัท (Self-host บนวง LAN)

ให้ทุกคนในบริษัทเข้าใช้งานผ่าน URL ภายใน เช่น `http://192.168.1.50:3000`
โดยข้อมูลไม่ออกนอกองค์กร และต่อ SQL Server บริษัทได้โดยตรง

---

## ภาพรวม
- เลือก **1 เครื่องที่เปิดทิ้งไว้** (เซิร์ฟเวอร์ หรือคอมที่เปิดช่วงเวลาทำงาน) เป็นตัวรันแอป
- เครื่องอื่นๆ ในบริษัทเปิดเบราว์เซอร์เข้า `http://<IP-เครื่องนั้น>:3000`
- แนะนำรันด้วย **Docker** (ตั้งครั้งเดียว อัปเดตง่าย) — มีวิธีรันแบบไม่ใช้ Docker ท้ายเอกสาร

---

> **ฐานข้อมูลกลาง (สำคัญ):** รันเครื่องเดียวเป็นเซิร์ฟเวอร์ ทุกคนในวง LAN เข้ามาที่เครื่องนี้
> ใช้ฐานข้อมูลก้อนเดียวกัน (เก็บใน Docker volume `kst-data`) — ใครนำเข้า/แก้ไข ทุกคนเห็นตรงกันทันที

## วิธีที่ 1 — Docker (แนะนำ)

### เตรียมเครื่อง
ติดตั้ง **Docker Desktop** (Windows/Mac) หรือ **Docker Engine** (Linux server)
ดาวน์โหลด: https://www.docker.com/products/docker-desktop/

### รัน (ครั้งแรก)
เปิด Terminal / PowerShell ในเครื่องที่จะรัน แล้ว:
```bash
git clone https://github.com/torsak6589-creator/KST-Delivery-Tracker.git
cd KST-Delivery-Tracker
```
จากนั้น **กดรันทีเดียว**:
- **Windows:** ดับเบิลคลิก `start-windows.bat` (จะ build + เริ่มระบบ + บอก URL ให้เสร็จ)
- **Linux/Mac:** `./start.sh`

หรือสั่งเองตรงๆ:
```bash
docker compose up -d --build
```
รอ build เสร็จ (~3-5 นาทีครั้งแรก) — ระบบจะสร้างฐานข้อมูลและใส่ข้อมูล 263 แถวให้อัตโนมัติ

### หา IP ของเครื่อง
- Windows: เปิด PowerShell พิมพ์ `ipconfig` → ดู **IPv4 Address** (เช่น `192.168.1.50`)
- Linux/Mac: `ip addr` หรือ `ifconfig`

### เข้าใช้งาน
แจ้งทุกคนในบริษัทเปิด:
```
http://192.168.1.50:3000      (แทนด้วย IP จริงของเครื่อง)
```

### เปิด Firewall (ถ้าเข้าจากเครื่องอื่นไม่ได้)
Windows: เปิด PowerShell **(Run as Administrator)**:
```powershell
New-NetFirewallRule -DisplayName "KST Tracker 3000" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow
```

---

## การดูแลหลังรัน

| งาน | คำสั่ง (ในโฟลเดอร์โปรเจกต์) |
|---|---|
| ดูสถานะ | `docker compose ps` |
| ดู log | `docker compose logs -f` |
| หยุด | `docker compose down` |
| เริ่มใหม่ | `docker compose up -d` |
| **อัปเดตเวอร์ชันใหม่** | `git pull` แล้ว `docker compose up -d --build` |

> ข้อมูลเก็บใน Docker volume `kst-data` — `docker compose down` ธรรมดา **ข้อมูลไม่หาย**
> (จะหายก็ต่อเมื่อสั่ง `docker compose down -v` เท่านั้น)

### อัปเดตข้อมูล PO
ผู้ใช้กดปุ่ม **⤓ นำเข้า Excel** บนหน้าเว็บ เลือกไฟล์ `.xlsx/.csv` ได้เลย — ระบบแทนที่ข้อมูลและคำนวณสถานะใหม่ให้

---

## ต่อกับ SQL Server บริษัท (ถ้าต้องการใช้ข้อมูลจริงจาก SAP B1)
ข้อดีของการรันในบริษัท: เครื่องนี้อยู่วง LAN เดียวกับ SQL Server จึงต่อตรงได้เลย ไม่ต้องตั้ง VNet
1. แก้ `prisma/schema.prisma`: เปลี่ยน `provider = "sqlite"` → `provider = "sqlserver"`
2. ใน `docker-compose.yml` สลับมาใช้บรรทัด `DATABASE_URL` แบบ sqlserver (มีตัวอย่างคอมเมนต์ไว้) ใส่ host/user/password จริง
3. `docker compose up -d --build`

---

## วิธีที่ 2 — รันด้วย Node ตรงๆ (ไม่ใช้ Docker)
ถ้าเครื่องลง Docker ไม่ได้ ใช้วิธีนี้แทน (ต้องมี **Node.js 20 LTS**):
```bash
git clone https://github.com/torsak6589-creator/KST-Delivery-Tracker.git
cd KST-Delivery-Tracker
git checkout claude/eager-mccarthy-v9yd7h
npm install
copy .env.example .env        # Windows  (Linux/Mac: cp .env.example .env)
npm run prisma:generate
npm run prisma:push
npm run seed
npm run build
npm run start                 # รันที่ http://localhost:3000
```
ให้เครื่องอื่นเข้าผ่าน `http://<IP-เครื่องนี้>:3000` (เปิด Firewall พอร์ต 3000 เช่นเดียวกัน)

> ถ้าต้องการให้แอป **เริ่มอัตโนมัติเมื่อเปิดเครื่อง** แนะนำใช้ Docker (`restart: unless-stopped` ตั้งให้แล้ว) หรือใช้ `pm2` กับวิธี Node

---

## หมายเหตุ
- ใช้ IP ตรงๆ ได้เลย แต่ถ้าอยากได้ชื่อสวยๆ เช่น `http://tracker.kst.local` ให้ฝ่าย IT เพิ่ม DNS A record ชี้ไปที่ IP เครื่อง
- เครื่องที่รันควรตั้ง IP แบบคงที่ (static / DHCP reservation) เพื่อไม่ให้ URL เปลี่ยน
