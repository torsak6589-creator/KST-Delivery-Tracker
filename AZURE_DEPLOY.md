# KST Delivery Tracker — Azure App Service Deploy Guide

แอปนี้เป็น **Next.js (server)** + Prisma จึงต้อง deploy บน **Azure App Service (Linux/Node)** — ไม่ใช่ GitHub Pages หรือ Azure Functions

ผลลัพธ์: ทุกคนในองค์กรเข้าใช้งานผ่าน URL เดียวกัน
```
https://<ชื่อแอป>.azurewebsites.net
```

---

## ขั้นตอน 1 — สร้าง App Service (ทำครั้งเดียว)

1. Azure Portal → **Create a resource** → **Web App**
2. ตั้งค่า:
   - **Name**: `kst-delivery-tracker` (จะกลายเป็น URL `kst-delivery-tracker.azurewebsites.net`)
   - **Publish**: Code
   - **Runtime stack**: **Node 20 LTS**
   - **Operating System**: **Linux**
   - **Region**: Southeast Asia
   - **Plan**: B1 ขึ้นไป (Free F1 รันได้แต่ช้า/หลับ — แนะนำ B1 สำหรับใช้งานจริง)

---

## ขั้นตอน 2 — ตั้งค่า Startup Command + App Settings

### 2.1 Startup Command
App Service → **Configuration → General settings → Startup Command**:
```
bash /home/site/wwwroot/startup.sh
```
(`startup.sh` ในโปรเจกต์จะ: apply schema → seed ครั้งแรกถ้า DB ว่าง → start เซิร์ฟเวอร์)

### 2.2 Application settings
App Service → **Configuration → Application settings** เพิ่ม:

| Name | Value | คำอธิบาย |
|------|-------|---------|
| `DATABASE_URL` | `file:/home/data/dev.db` | เริ่มต้นใช้ SQLite บนพื้นที่ถาวร `/home` (ข้อมูลไม่หายเมื่อ restart) |
| `NEXT_PUBLIC_SNAPSHOT_DATE` | `2026-06-24` | วันอ้างอิงคำนวณสถานะ |
| `SCM_DO_BUILD_DURING_DEPLOYMENT` | `false` | build มาจาก GitHub Actions แล้ว ไม่ต้อง build ซ้ำ |
| `WEBSITE_RUN_FROM_PACKAGE` | `0` | ให้ startup.sh เขียนไฟล์ DB ได้ |

กด **Save** (แอปจะ restart)

> **ใช้ SQL Server บริษัทแทน SQLite:** เปลี่ยน `provider = "sqlserver"` ใน `prisma/schema.prisma` แล้วตั้ง
> `DATABASE_URL="sqlserver://HOST:1433;database=KST_TRACKER;user=USER;password=PASS;encrypt=true;trustServerCertificate=true"`
> ⚠️ ต้องให้ App Service เข้าถึง SQL Server ได้ (ถ้า SQL Server อยู่ในวง LAN ต้องตั้ง **VNet Integration** + เปิด firewall ฝั่ง SQL) — แจ้งผมได้ถ้าต้องการให้ช่วยตั้งส่วนนี้

---

## ขั้นตอน 3 — เชื่อม GitHub Actions (deploy อัตโนมัติ)

1. App Service → **Deployment Center → Manage publish profile → Download** (ได้ไฟล์ `.PublishSettings`)
2. GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**
   - Name: `AZURE_WEBAPP_PUBLISH_PROFILE`
   - Value: วางเนื้อหาทั้งไฟล์ `.PublishSettings`
3. แก้ `AZURE_WEBAPP_NAME` ใน `.github/workflows/azure-deploy.yml` ให้ตรงกับชื่อ App Service (ถ้าไม่ได้ใช้ `kst-delivery-tracker`)

หลังจากนี้ ทุกครั้งที่ push เข้า `main` → GitHub Actions จะ build และ deploy ให้อัตโนมัติ
(หรือกด **Run workflow** เองที่แท็บ Actions → "Deploy to Azure App Service")

---

## ขั้นตอน 4 — Deploy ครั้งแรก

merge PR เข้า `main` (หรือกด Run workflow) → รอ ~3-5 นาที → เปิด
```
https://<ชื่อแอป>.azurewebsites.net
```
ครั้งแรก `startup.sh` จะ seed ข้อมูล 263 แถวให้อัตโนมัติ

---

## การอัปเดตข้อมูล PO (หลัง deploy)
ผู้ใช้กดปุ่ม **⤓ นำเข้า Excel** บนหน้าเว็บ แล้วเลือกไฟล์ `.xlsx/.csv` ได้เลย — ระบบจะแทนที่ข้อมูลและคำนวณสถานะใหม่ให้

## Troubleshooting
- เปิดแล้วขึ้น error / ไม่ขึ้น → App Service → **Log stream** ดู log จาก `startup.sh`
- ข้อมูลหายหลัง restart → ตรวจ `DATABASE_URL` ต้องชี้ `/home/...` (พื้นที่ถาวร) ไม่ใช่ `./dev.db`
- deploy แล้ว 503 → ตรวจ Startup Command ว่าตั้งเป็น `bash /home/site/wwwroot/startup.sh`
