# KST Delivery Tracker — Next.js + Database (เฟส 2)

เว็บแอปติดตามการส่งของจาก Supplier ตามใบสั่งซื้อ (PO) — ฝ่ายจัดซื้อ ห้องเย็นโชติวัฒน์
อัปเกรดจากเวอร์ชัน HTML standalone ให้ **เก็บข้อมูลถาวรในฐานข้อมูล รองรับหลายผู้ใช้ และอ่านไฟล์ Excel (.xlsx) ได้จริงฝั่งเซิร์ฟเวอร์**

## สถาปัตยกรรม

| ชั้น | เทคโนโลยี | หน้าที่ |
|---|---|---|
| UI | Next.js 14 (App Router) + React | หน้าเว็บ (เสิร์ฟฝั่ง server) |
| Renderer | `src/lib/kst-ui.js` | ตัว render UI เดิม (พอร์ตจากเฟส 1 ที่ทดสอบแล้ว) |
| Logic | `src/lib/compute.ts` | คำนวณสถานะ/วันคงเหลือ + สรุป KPI/Supplier/แผนก/รายเดือน |
| ORM | Prisma | เชื่อมฐานข้อมูล (สลับ engine ได้) |
| DB | **SQL Server** (ค่าเริ่มต้น) / MySQL / PostgreSQL | เก็บข้อมูล PO |

### โครงไฟล์
```
prisma/
  schema.prisma        # โมเดล PurchaseOrder + AppMeta
  seed.ts              # นำเข้าข้อมูล snapshot เริ่มต้น
  seed-data.json       # ข้อมูล PO 263 แถวจากไฟล์เดิม
src/
  lib/compute.ts       # logic คำนวณ (ใช้ร่วม server/seed/import)
  lib/db.ts            # Prisma client + readRows()
  lib/kst-ui.js        # UI renderer (vanilla, ทดสอบแล้ว)
  components/KstApp.tsx # client wrapper เรียก /api/import, /api/export
  app/page.tsx         # โหลด snapshot จาก DB ส่งให้ UI
  app/api/data/route.ts    # GET  ข้อมูลสรุปจาก DB
  app/api/import/route.ts  # POST อัปโหลด .xlsx/.csv/.json → เขียน DB
  app/api/export/route.ts  # GET  ส่งออก CSV/XLSX ตามตัวกรอง
```

## ติดตั้ง / รัน

### 1) ติดตั้ง dependency
```bash
npm install
```

### 2) ตั้งค่าฐานข้อมูล
คัดลอก `.env.example` เป็น `.env`
```bash
cp .env.example .env
```
ค่าเริ่มต้นเป็น **SQLite** (`DATABASE_URL="file:./dev.db"`) — ใช้งานได้ทันทีไม่ต้องตั้งค่าอะไรเพิ่ม เหมาะกับ dev / สาธิต

**สำหรับ production** ที่ต้องการต่อฐานข้อมูลบริษัท ให้แก้ `provider` ใน `prisma/schema.prisma` เป็น `sqlserver` / `mysql` / `postgresql` แล้วตั้ง `DATABASE_URL` ให้ตรงกัน เช่น SQL Server:
```
DATABASE_URL="sqlserver://10.0.0.5:1433;database=KST_TRACKER;user=kst;password=secret;encrypt=true;trustServerCertificate=true"
```

### 3) สร้างตารางและใส่ข้อมูลเริ่มต้น
```bash
npm run prisma:generate   # สร้าง Prisma client
npm run prisma:push       # สร้างตารางในฐานข้อมูล
npm run seed              # ใส่ข้อมูล snapshot 263 แถว
```

### 4) รัน
```bash
npm run dev               # โหมดพัฒนา  → http://localhost:3000
# หรือ production:
npm run build && npm run start
```

## ฟีเจอร์
- **Dashboard** — KPI 6 ใบ, โดนัทสถานะค้างส่ง, กราฟแท่งรายเดือน, รายการเกินกำหนดด่วน, Supplier ค้างมากสุด
- **รายการ PO** — ค้นหา/กรองแผนก/ช่วงวันที่/ชิปสถานะ, เรียงคอลัมน์, แบ่งหน้า
- **Supplier** — รายชื่อ + drill-down รายตัว
- **นำเข้า (จริง)** — อัปโหลด `.xlsx` / `.xls` / `.csv` / `.json` → เซิร์ฟเวอร์อ่านด้วย SheetJS, คำนวณสถานะ, เขียนลงฐานข้อมูล (แทนที่ชุดเดิมแบบ transaction)
- **ส่งออก (จริง)** — ดาวน์โหลด CSV (UTF-8 BOM) หรือ XLSX ตามตัวกรองปัจจุบัน

## การคำนวณสถานะ (ถ้าไฟล์นำเข้าไม่มีคอลัมน์ `status`)
อิงวันที่ snapshot ใน `AppMeta.today`:
- `ov` เกินกำหนด (วันคงเหลือ < 0) · `du` ถึงกำหนด (0–3) · `ne` ใกล้ (4–7) · `ok` ยังมีเวลา (>7)
- `dn` รับแล้ว (มีวันที่รับ / รับครบ) · `ca` ยกเลิก

## หมายเหตุ / สิ่งที่ยังทำต่อได้ (เฟสถัดไป)
- 🔔 **แจ้งเตือนของเกินกำหนด** (อีเมล/LINE Notify) — ยังไม่ทำ ต้องตัดสินใจช่องทาง
- 👥 ระบบล็อกอิน/สิทธิ์ผู้ใช้ — ยังไม่ทำ
- ⏰ ตั้ง cron อัปเดต `days`/`status` รายวัน (ตอนนี้คำนวณตอนอ่าน ถูกต้องเสมอ แต่คอลัมน์ cache อาจค้างจนกว่าจะ import ใหม่)
- ผูกกับ SAP B1 โดยตรง (ดึง PO/GRPO อัตโนมัติ) แทนการ import ไฟล์

> โครงนี้สร้างและทดสอบ logic หลัก (คำนวณ/แปลงข้อมูล/render) ด้วย Node แล้ว แต่ยังไม่ได้รัน `next build` แบบ end-to-end ในเครื่องที่ต่อฐานข้อมูลจริง — เมื่อใส่ `DATABASE_URL` ของบริษัทแล้วทำตามขั้นตอนด้านบนจะใช้งานได้
