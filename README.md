# Handoff: KST Supplier Delivery Tracker — Modern Redesign

> สำหรับ developer (Claude Code): เอกสารนี้อธิบายการออกแบบใหม่ของ **KST Supplier Delivery Tracker**
> (ระบบติดตามการส่งของจาก Supplier ตามใบสั่งซื้อ — ฝ่ายจัดซื้อ ห้องเย็นโชติวัฒน์หาดใหญ่)
> เป้าหมาย: สร้าง **เว็บแอปใช้งานจริง** ด้วย **Next.js + ฐานข้อมูล** (เก็บข้อมูลถาวร, รองรับหลายผู้ใช้)
> โดยยังคงวิธี **นำเข้าข้อมูลด้วยไฟล์ Excel ด้วยมือ** เหมือนระบบเดิม และเพิ่มฟีเจอร์ **แจ้งเตือนของเกินกำหนด**

---

## 1. Overview

ระบบเดิมเป็นไฟล์ HTML ไฟล์เดียว (`uploads/KST_Delivery_Tracker.html`) ที่ฝังข้อมูล PO ~4,924 รายการไว้ในไฟล์
ผู้ใช้นำเข้า Excel เพื่ออัปเดต แล้วดูตารางติดตามสถานะการส่งของ ปัญหา: ข้อมูลไม่ถาวร (อยู่ในเบราว์เซอร์), ใช้คนเดียว, ธีมเก่า (navy/gold) แน่นตา

การออกแบบใหม่นี้:
- **ธีมทันสมัย** — dashboard การ์ด เงานุ่ม สีพาสเทล + accent indigo สด
- **แยก 3 หน้า**: Dashboard (ภาพรวม) · รายการ PO · Supplier — sidebar นำทาง + filter bar ด้านบน
- **ฟีเจอร์ใหม่: แจ้งเตือนของเกินกำหนด** (alert banner เด่นบน Dashboard + แนะนำ job แจ้งเตือนรายวัน)
- ออกแบบสำหรับ **เดสก์ท็อป / จอกว้าง** เป็นหลัก

---

## 2. About the Design Files

ไฟล์ในโฟลเดอร์นี้เป็น **design reference ที่สร้างด้วย HTML** — เป็น prototype แสดง "หน้าตาและพฤติกรรมที่ต้องการ"
**ไม่ใช่ production code ที่จะก๊อปไปใช้ตรง ๆ**

งานของ developer คือ **สร้างดีไซน์เหล่านี้ขึ้นใหม่ใน Next.js codebase** โดยใช้ pattern/library ของโปรเจกต์จริง
(React components, Tailwind/CSS modules, ORM ฯลฯ) ให้ได้หน้าตาตรงตาม mock และเชื่อมกับฐานข้อมูลจริง

ไฟล์ในบันเดิล:
- `mockup/KST_Delivery_Tracker_mockup.html` — **mock แบบ standalone เปิดได้ออฟไลน์** (เปิดด้วยเบราว์เซอร์เพื่อดู/คลิกเล่นได้ทันที) ✅ เริ่มจากไฟล์นี้
- `source/KST Delivery Tracker.dc.html` — ซอร์สดีไซน์ (template + logic) อ้างอิงค่าจริงทั้งหมด
- `source/kst-data.js` — ชุดข้อมูลตัวอย่าง (sample) ที่ดึงจากข้อมูลจริง ใช้ใน mock
- `source/support.js` — runtime ของ prototype (ไม่ต้องสนใจในการ implement จริง)

---

## 3. Fidelity

**High-fidelity (hifi)** — สี ตัวอักษร ระยะห่าง radius เงา และ interaction เป็นค่าสุดท้ายที่ตั้งใจไว้
ให้ recreate UI ให้ตรง pixel ตาม design tokens ในข้อ 8 โดยใช้ library/ระบบของ codebase จริง

---

## 4. ตรรกะหลักของระบบ (สำคัญที่สุด — copy ให้ตรง)

### 4.1 หน่วยข้อมูล (grain)
แต่ละแถวในไฟล์ Excel = **PO line × เหตุการณ์การรับของ (GRPO)** หนึ่งครั้ง
PO เดียวกัน + line เดียวกัน อาจมีหลายแถว เพราะรับของหลายครั้ง (partial receipt)
คีย์กันซ้ำที่แนะนำ: `poNo + lineItem + itemCode + grpoNo + receiveDate`

### 4.2 การคำนวณสถานะการส่ง (delivery status) — ใช้ทุกที่
คำนวณจาก `dueDate` (กำหนดส่ง) เทียบ "วันนี้" + สถานะ PO/การรับของ:

```
days = round((dueDate - today) / 1วัน)   // วันนี้ตั้งเวลา 00:00:00

if (grpoStatus === 'รับ' || poStatus === 'เสร็จสิ้น')  → 'dn'  (รับแล้ว / ปิด PO)
else if (poStatus === 'ยกเลิก')                        → 'ca'  (ยกเลิก)
else if (dueDate ว่าง/ไม่ valid)                       → 'ok'
else if (days < 0)                                     → 'ov'  (เกินกำหนด)
else if (days <= 3)                                    → 'du'  (ถึงกำหนด 0–3 วัน)
else if (days <= 7)                                    → 'ne'  (ใกล้กำหนด 4–7 วัน)
else                                                   → 'ok'  (ยังมีเวลา > 7 วัน)
```

> **อย่า** เก็บ status ลง DB แบบ static — มันขึ้นกับ "วันนี้" ต้องคำนวณตอน query/แสดงผลเสมอ
> (ทำเป็น computed field / SQL CASE / view ที่รับ `now()` เป็น parameter)

ป้ายสถานะ (badge label):
- `ov` → "เกิน {|days|} วัน"
- `du` → days===0 ? "วันนี้" : "อีก {days} วัน"
- `ne` / `ok` → "อีก {days} วัน"
- `dn` → "รับแล้ว" · `ca` → "ยกเลิก"

### 4.3 การนำเข้า Excel — แมปหัวคอลัมน์ (match จากข้อความหัวตาราง, ทนต่อการสลับคอลัมน์)
หาแถว header ด้วยเซลล์ที่ค่า === `"PO No."` แล้วแมปตามตารางนี้:

| หัวคอลัมน์ (Excel)              | field           | type        |
|--------------------------------|-----------------|-------------|
| วันที่ออก PO                    | poDate          | date        |
| PO No.                         | poNo            | string      |
| สถานะ PO                       | poStatus        | string (เปิด/เสร็จสิ้น/ยกเลิก) |
| Line Item(PO)                  | lineItem        | int         |
| Required Date(PR)              | requiredDate    | date        |
| PR No.                         | prNo            | string      |
| Arrove AVL                     | approveAVL      | string      |
| รหัสผู้ขาย(PO)                  | vendorCode      | string      |
| ชื่อผู้ขาย(PO)                  | vendorName      | string      |
| กำหนดส่งของ(PO)                | dueDate         | date        |
| แผนก/ฝ่าย(PO)                  | department      | string      |
| ผู้ประสงค์ใช้(PO)              | requester       | string      |
| รหัสสินค้า(PO)                 | itemCode        | string      |
| รายการสินค้า(PO)               | itemName        | string      |
| คำอธิบายรายการ(PO)             | itemDesc        | string      |
| จำนวน(PO)                      | qty             | number      |
| ราคาต่อหน่วย(PO)               | unitPrice       | number      |
| จำนวนเงิน(PO)                  | amount          | number      |
| หน่วย(PO)                      | unit            | string      |
| จำนวนที่ค้างรับ(PO)            | pendingQty      | number      |
| สถานะการรับของ(GRPO)           | grpoStatus      | string (รับ/ค้างรับ) |
| วันที่รับของ(GRPO)             | receiveDate     | date        |
| เลขที่เอกสาร (GRPO)            | grpoNo          | string      |
| จำนวนรับของต่อครั้ง (GRPO)     | receiveQty      | number      |
| ราคาที่รับของต่อครั้ง (GRPO)   | receiveAmount   | number      |
| ผู้สร้าง PO                    | createdBy       | string      |
| Work Order No.                 | workOrderNo     | string      |

**การ parse วันที่** (รองรับหลายรูปแบบ → เก็บเป็น ISO `YYYY-MM-DD`):
- `Date` object → `toISOString().slice(0,10)`
- Excel serial number → `new Date(Date.UTC(1899,11,30) + serial*86400000)`
- string `"DD.MM.YY"` / `"DD.MM.YYYY"` / `"DD/MM/YYYY"` → `YYYY-MM-DD` (ถ้าปี < 100 ให้ +2000)
- string `"YYYY-MM-DD"` → ใช้ตรง
- ปีในไฟล์เป็น **ค.ศ. (Gregorian)** เช่น 2026 — เก็บเป็น ค.ศ. ใน DB
- การ **แสดงผล** ใช้ locale `th-TH` → จะได้ปี พ.ศ. อัตโนมัติ (เช่น 24 มิ.ย. 2569)

**number**: ตัด `,` ออกก่อน `parseFloat`, ค่าว่าง → 0
ข้ามแถวที่ไม่มี `poNo`

### 4.4 พฤติกรรม import (production)
- 1 การอัปโหลด = สร้าง snapshot ใหม่ (record `Import`) แล้ว **แทนที่ชุดข้อมูลปัจจุบันทั้งหมด** ใน transaction
  (ระบบเดิม replace ทั้งชุดเมื่อ import — รักษาพฤติกรรมนี้)
- เก็บประวัติการ import (ใครนำเข้า, เมื่อไหร่, กี่แถว, ชื่อไฟล์) เพื่อ audit
- แสดง banner ผลลัพธ์: "✓ นำเข้าสำเร็จ N รายการ จากไฟล์ ... " / error ถ้าหาหัวคอลัมน์ไม่เจอ

---

## 5. Screens / Views

แอปมี layout หลัก: **Sidebar ซ้าย (กว้าง 248px, พื้นขาว)** + **พื้นที่เนื้อหาขวา (scroll, พื้น `#F3F4FA`)**

### Sidebar (ทุกหน้า)
- โลโก้ KST: กล่อง 38×38 radius 11, พื้น = accent, ตัวอักษร "KST" สีขาว Sora 700 15px, เงา `0 6px 16px {accent@32%}`
- ชื่อแอป "Delivery Tracker" 14px/700 + sub "ฝ่ายจัดซื้อ · ห้องเย็นโชติวัฒน์" 11px `#9AA0B4`
- หัวข้อ "เมนู" 10px/700 uppercase `#B0B5C6` letter-spacing .7px
- เมนู 3 รายการ (icon ขนาด 18 stroke 2 + label 13.5px/700): **ภาพรวม** (icon grid), **รายการ PO** (icon list + badge จำนวนค้างส่ง), **Supplier** (icon truck)
  - item ปกติ: สี `#6B7186`, พื้นใส
  - item active: สี = accent, พื้น = accent@10%, radius 11, padding 10×12
- กล่องล่างสุด: "ข้อมูล ณ วันที่ {วันที่ไทยแบบเต็ม}" พื้น `#F6F7FC` border `#EDEEF6` radius 13

### 5.1 Dashboard (ภาพรวม) — route `/dashboard`
**Purpose:** ผู้ใช้เห็นภาพรวมความเสี่ยงการส่งของในพริบตา + ลงมือกับของเกินกำหนด

Layout (บนลงล่าง, padding 26×32):
1. **Header**: title "ภาพรวมการจัดส่ง" (Sora 24/700) + subtitle ; ขวา = ปุ่ม "นำเข้า Excel" (outline) + "ส่งออกรายงาน" (accent fill)
2. **Overdue Alert banner** (ฟีเจอร์ใหม่) — แสดงเมื่อมีของเกินกำหนด:
   - พื้น `linear-gradient(100deg,#FFF1F2,#FFF6F1)`, border `#FBD9DC`, radius 16, padding 16×20, คลิกได้ → ไปหน้า PO filter `ov`
   - ไอคอนสามเหลี่ยมเตือนในวงกลม `#FFE0E3` (มี animation `pulse` 2.4s)
   - ข้อความ: "ของส่งเกินกำหนด {N} รายการ ต้องติดตามด่วน" (15/700 `#B91C36`) + "มูลค่ารวม {X} บาท ..." (`#A65560`)
3. **KPI grid** — 6 การ์ดเท่ากัน (`grid-template-columns:repeat(6,1fr)`, gap 14):
   การ์ดละ: พื้นพาสเทลตามสถานะ, border บาง, radius 16, padding 16; บรรทัดบน = จุดสี 9px + label 11/700 `#5A6175`; ตัวเลขใหญ่ Sora 30/700 letter-spacing -1px สีตามสถานะ; subtitle 11px `#8A90A2`
   คลิกการ์ด → ไปหน้า PO พร้อม filter สถานะนั้น
   | การ์ด | ตัวเลข (ข้อมูลจริง) | สีตัวเลข | พื้น/border |
   |------|------|------|------|
   | PO ทั้งหมด | 4,924 | `#171A2B` | `#FFFFFF` / `#ECEDF4` |
   | เกินกำหนด | 250 | `#E5364B` | `#FFF4F5` / `#FBDEE2` |
   | ถึงกำหนด | 43 | `#DA6B16` | `#FFF7EF` / `#FBE6CF` |
   | ใกล้กำหนด | 68 | `#B5860B` | `#FCF8E8` / `#F1E6BC` |
   | ยังมีเวลา | 45 | `#0E9E6E` | `#EDFAF3` / `#CCEFDD` |
   | รับแล้ว/ปิด | 4,518 | `#3A6FF0` | `#EFF3FE` / `#D6E1FB` |
4. **แถวกราฟ 2 ช่อง** (`grid 1.05fr 1.35fr`, gap 18):
   - **Donut "สถานะของที่ยังค้างส่ง"**: วงกลม 148px ใช้ `conic-gradient` แบ่ง 4 สี (ov/du/ne/ok), เจาะกลาง (inset 20px พื้นขาว) แสดงยอดรวมค้างส่ง (Sora 30/700) ; ขวาเป็น legend จุดสี + label + จำนวน + %
   - **Bar chart "กำหนดส่งที่กำลังจะถึง"**: แท่งตามเดือน (จำนวนรายการค้างส่ง/เดือน), สูงสุด = accent, ที่เหลือ = accent@42%, radius บน 8px ; label เดือนไทยย่อ + ปี
5. **แถวล่าง 2 ช่อง** (`grid 1.35fr 1.05fr`):
   - **"ต้องติดตามด่วน"**: list 6 รายการเกินกำหนดมากสุด (วันเกิน Sora 17 `#E5364B` + ชื่อสินค้า/supplier/PO + มูลค่า + วันครบ) คลิก → เปิด modal
   - **"Supplier ที่มีของค้างมากสุด"**: horizontal bar 6 ราย เรียงตามมูลค่าค้าง (แท่งสีแดงถ้ามีเกินกำหนด, ไม่งั้น accent)

### 5.2 รายการ PO — route `/pos`
**Purpose:** ค้นหา/กรอง/เรียง รายการ PO ทั้งหมด และเปิดดูรายละเอียด

Layout: ส่วนหัว fixed + ตาราง scroll + pagination ติดล่าง
- **Header**: "รายการใบสั่งซื้อ" (Sora 22/700) + countText ("แสดง X–Y จาก N รายการ") + ปุ่มนำเข้า/ส่งออก
- **Filter bar** (flex, wrap, gap 10):
  - ช่องค้นหา (มีไอคอนแว่น, placeholder "ค้นหา Supplier / รายการ / PO No.") — ค้นใน vendorName+poNo+itemName+itemCode+prNo
  - select "ทุกแผนก/ฝ่าย" (จาก distinct department)
  - date range จาก–ถึง (กรองตาม dueDate)
  - ปุ่ม "ล้างตัวกรอง"
  - focus state ของ input: border = accent + ring `0 0 0 3px {accent@?}`
- **Status chips** (flex wrap, gap 8): ทั้งหมด/เกินกำหนด/ถึงกำหนด/ใกล้กำหนด/ยังมีเวลา/รับแล้ว
  - chip ปกติ: จุดสี + label + จำนวน, พื้น = สีพาสเทลของสถานะ, ตัวอักษร = สีสถานะ
  - chip active: พื้น = สีสถานะเต็ม, ตัวอักษรขาว
- **ตาราง** (พื้นขาว, radius บน 16, header sticky พื้น `#FAFBFD`):
  คอลัมน์: PO No.(+Line) · กำหนดส่ง · วัน(±days, Sora 13/700 สีตามสถานะ) · สถานะ(badge pill) · Supplier(ชื่อย่อ+code) · รายการสินค้า(+code) · มูลค่า(฿)(+qty) · รับ(✓/–) · แผนก
  - หัวคอลัมน์ที่เรียงได้มี "↕": poNo, dueDate, days, vendorName, amount
  - แถว hover พื้น `#FAFBFE`, คลิกแถว → เปิด modal
  - ไอคอน "รับ": ✓ วงกลม `#EBF1FE`/`#3A6FF0` ถ้า status==='dn', ไม่งั้น – วงกลม `#F4F5F9`/`#C2C7D6`
- **Pagination** (40 แถว/หน้า): ‹ + เลขหน้า (active = พื้น accent ขาว) + › + "หน้า p/total"
- **การย่อชื่อ Supplier (vshort)**: ตัด prefix `บริษัท|ห้างหุ้นส่วนจำกัด|บมจ.|หจก.` นำหน้า และตัด ` จำกัด...` ท้าย

### 5.3 Supplier — route `/suppliers` + `/suppliers/[code]`
**Purpose:** ดูภาพรวมต่อ supplier และเจาะดูรายการของแต่ละราย

**รายชื่อ (list):**
- title "Supplier" + subtitle จำนวนราย
- ตาราง: Supplier(ชื่อย่อ+code) · มูลค่ารวม(฿) · รายการ · ค้างส่ง(สีส้มถ้า>0) · เกินกำหนด(สีแดงถ้า>0) · อัตรารับของครบ (progress bar + %)
  - progress bar fill: ≥85% เขียว `#10B981`, ≥60% เหลือง `#EAB308`, ต่ำกว่า แดง `#F43F5E`
- คลิกแถว → หน้า detail

**รายละเอียด (detail):**
- ปุ่ม "← กลับไปรายชื่อ Supplier"
- การ์ดหัว: avatar 52×52 (ตัวอักษรแรกชื่อ, พื้น accent@10% ตัว accent) + ชื่อเต็ม + code + แผนก
- แถบสถิติ 5 ช่อง: มูลค่ารวม · รายการทั้งหมด · ค้างส่ง(ส้ม) · เกินกำหนด(แดง) · รับของครบ %(เขียว) — แต่ละช่องพื้นพาสเทลตามความหมาย
- ตาราง "รายการ PO ของ Supplier นี้": PO No. · กำหนดส่ง · สถานะ(badge) · รายการสินค้า · มูลค่า ; คลิก → modal

### 5.4 PO Detail Modal (เปิดจากทุกตาราง)
- overlay `rgba(20,26,46,.45)` + `backdrop-filter:blur(3px)`, คลิกนอก/ปุ่ม ✕ ปิด
- การ์ด 760px, radius 20, เงา `0 30px 80px rgba(0,0,0,.3)`, header sticky
- header: chip "PO {poNo}" + badge สถานะ + ชื่อสินค้า (17/700) + ชื่อ supplier
- เนื้อหา: grid ข้อมูล (Line, วันออก PO, สถานะ PO / Supplier, รหัสผู้ขาย, รหัสสินค้า, แผนก, ผู้ประสงค์ใช้)
  - กล่องเทา `#F8F9FD`: จำนวน · ราคา/หน่วย · มูลค่า PO(Sora 18 accent) · ค้างรับ
  - 2 การ์ด: "กำหนดส่ง" (วันที่ Sora 20 + คำบรรยาย เช่น "เกินกำหนดมาแล้ว N วัน") และ "การรับของ (GRPO)" (สถานะ/วันที่รับ/เลขที่ GRPO/ปริมาณรับ)
  - บรรทัดล่าง: "ผู้สร้าง PO: {createdBy}"

---

## 6. Interactions & Behavior
- **นำทาง**: คลิกเมนู sidebar สลับหน้า ; คลิก KPI card หรือ alert banner → ไปหน้า PO พร้อม filter ; คลิกแถว → modal
- **Filter/Sort**: เปลี่ยน filter ใด ๆ รีเซ็ต page=1 ; คลิกหัวคอลัมน์สลับ asc/desc (คลิกซ้ำ toggle ทิศทาง) ; แนะนำเก็บ filter ใน URL search params (`?status=ov&dept=...&q=...`) เพื่อ shareable + back/forward
- **Hover**: KPI card ยกขึ้น `translateY(-2px)` + เงาเข้ม ; แถวตาราง/list เปลี่ยนพื้น `#FAFBFE` ; ปุ่ม outline border เข้มขึ้น
- **Animation**: alert icon `pulse` (opacity 1↔.55, 2.4s ease-in-out infinite) ; transition ทั่วไป .12–.15s
- **Toast**: หลัง import/export แสดง toast กลางล่าง พื้น `#171A2B` ขาว ~3.2s
- **Empty state**: ถ้า filter แล้วไม่พบ → "ไม่พบรายการตามตัวกรอง"
- **Loading**: ระหว่างดึงข้อมูล/parse Excel แสดง skeleton/spinner (mock ใช้ hint placeholder)

## 7. State Management
ค่าที่ระบบต้องจำ:
- `screen` (route) · `search` · `status` (filter สถานะ) · `dept` · `from`/`to` (date range)
- `sortKey` (default `dueDate`) · `sortDir` (1/-1) · `page` (40/หน้า)
- `selectedPO` (modal) · `selectedSupplier`
- **แนะนำ**: filter/sort/page → URL search params (server component อ่านแล้ว query DB) ; modal/selection → client state
- การคำนวณ KPI, donut, bar, supplier aggregate, ควรทำฝั่ง server (SQL aggregate) เพื่อรองรับข้อมูลจริง 4,900+ แถว

## 8. Design Tokens

### สี
```
--bg:        #F3F4FA   /* พื้นแอป */
--surface:   #FFFFFF   /* การ์ด/ตาราง */
--border:    #ECEDF4   /* เส้นขอบการ์ด */
--border-in: #E2E4EF   /* ขอบ input/ปุ่ม */
--divider:   #F2F3F8   /* เส้นคั่นแถว */
--ink:       #171A2B   /* ตัวอักษรหลัก */
--muted:     #6B7186   /* รอง */
--faint:     #8A90A2   /* จาง */
--faint-2:   #9AA0B4   /* จางมาก */
--faint-3:   #A0A6B6   /* จางสุด/placeholder */
--accent:        #5B5BF5            /* indigo (ปรับได้) */
--accent-soft:   rgba(91,91,245,.10)
--accent-glow:   rgba(91,91,245,.32)

/* สถานะ: text / bg(badge) / card-bg / card-border / dot */
ov เกินกำหนด:  #E5364B / #FFF0F2 / #FFF4F5 / #FBDEE2 / #F43F5E
du ถึงกำหนด:   #DA6B16 / #FFF3E6 / #FFF7EF / #FBE6CF / #FB923C
ne ใกล้กำหนด:  #B5860B / #FBF4DE / #FCF8E8 / #F1E6BC / #EAB308
ok ยังมีเวลา:  #0E9E6E / #E7F9F1 / #EDFAF3 / #CCEFDD / #10B981
dn รับแล้ว:    #3A6FF0 / #EBF1FE / #EFF3FE / #D6E1FB / #3B82F6
ca ยกเลิก:     #7E8497 / #F1F2F6 /   —    /   —    / #A0A6B6
progress on-time: ≥85% #10B981 · ≥60% #EAB308 · <60% #F43F5E
```

### Typography
```
ภาษาไทย/UI:  'Noto Sans Thai'  weights 300/400/500/600/700
Display/ตัวเลข: 'Sora'          weights 500/600/700  (page title, KPI, ตัวเลขเด่น)
Mono (รหัส/วันที่/ตัวเลขตาราง): 'DM Mono'  weights 400/500
```
| บทบาท | ฟอนต์ | ขนาด/น้ำหนัก |
|------|------|------|
| Page title | Sora | 22–24px / 700, letter-spacing -.4 ถึง -.5px |
| Section title | Noto Sans Thai | 15px / 700 |
| KPI number | Sora | 30px / 700, ls -1px |
| Stat number (detail) | Sora | 18–20px / 700 |
| Body | Noto Sans Thai | 13px / 400–500 |
| Table cell | Noto/DM Mono | 12.5px |
| Label เล็ก/uppercase | Noto Sans Thai | 10–11px / 600–700, ls .4px |
| PO No./code/วันที่ | DM Mono | 11–12px |

### Radius / Shadow / Spacing
```
radius: การ์ด 16–18 · input/ปุ่ม 10–11 · chip 10 · badge 20(pill) · KPI dot 50%
shadow-card:  0 1px 2px rgba(16,24,40,.04), 0 6px 20px rgba(16,24,40,.03)
shadow-hover: 0 10px 24px rgba(16,24,40,.08)
shadow-modal: 0 30px 80px rgba(0,0,0,.3)
shadow-btn:   0 4px 12px {accent@32%}
spacing: page padding 24–32 · card padding 16–22 · gap 14–18
sidebar width: 248px
table: 40 rows/page, header sticky
```

## 9. สถาปัตยกรรมที่แนะนำ (production)
- **Next.js (App Router) + TypeScript**
- **PostgreSQL + Prisma** (หรือ Drizzle) — managed: Neon / Supabase / Vercel Postgres
- **Auth หลายผู้ใช้**: NextAuth (Email/Credentials หรือ SSO องค์กร) + role (เช่น `viewer`, `purchasing`, `admin`)
- **Excel**: ใช้ SheetJS (`xlsx`) parse ฝั่ง server ใน Route Handler / Server Action (`/api/import`)
- **Export**: สร้าง .xlsx/.csv จาก filter ปัจจุบัน (`/api/export`) — header ภาษาไทยตามรายงานเดิม
- **Charts**: Recharts/visx หรือ CSS ล้วน (donut = conic-gradient, bar = div %) ตาม mock
- **Styling**: Tailwind (map tokens ข้อ 8 เป็น theme) หรือ CSS variables
- Deploy: Vercel + Vercel Cron สำหรับงานแจ้งเตือน

### Schema (ร่าง Prisma)
```prisma
model Import {
  id          String   @id @default(cuid())
  filename    String
  importedAt  DateTime @default(now())
  importedById String?
  rowCount    Int
  lines       PoLine[]
}

model PoLine {
  id           String    @id @default(cuid())
  importId     String
  import       Import    @relation(fields: [importId], references: [id])
  poNo         String
  lineItem     Int?
  poDate       DateTime?
  poStatus     String?           // เปิด / เสร็จสิ้น / ยกเลิก
  requiredDate DateTime?
  prNo         String?
  approveAVL   String?
  vendorCode   String?
  vendorName   String?
  dueDate      DateTime?
  department   String?
  requester    String?
  itemCode     String?
  itemName     String?
  itemDesc     String?
  qty          Float?
  unitPrice    Float?
  amount       Float?
  unit         String?
  pendingQty   Float?
  grpoStatus   String?           // รับ / ค้างรับ
  receiveDate  DateTime?
  grpoNo       String?
  receiveQty   Float?
  receiveAmount Float?
  createdBy    String?
  workOrderNo  String?
  @@index([poNo]); @@index([vendorCode]); @@index([dueDate]); @@index([department])
}

model User { id String @id @default(cuid()); email String @unique; name String?; role String @default("viewer") }
```
> `deliveryStatus` ไม่เก็บใน DB — คำนวณตอน query (ดูข้อ 4.2). สถิติ Supplier/dept/monthly ทำด้วย SQL `GROUP BY`.

## 10. ฟีเจอร์ใหม่: แจ้งเตือนของเกินกำหนด
- **ในแอป**: alert banner บน Dashboard (ออกแบบแล้ว) แสดงจำนวน + มูลค่ารายการ status `ov`, คลิกไปหน้า PO filter `ov`
- **เชิงรุก (แนะนำ)**: Vercel Cron รายวัน → query รายการ `ov` (และ `du` ที่จะครบใน 0–3 วัน) → ส่งสรุปทาง **อีเมล** หรือ **LINE Notify** ให้ฝ่ายจัดซื้อ
- ตั้งค่า threshold ได้: du ≤ 3 วัน, ne ≤ 7 วัน (ค่า default ตามข้อ 4.2)
- (อนาคต) ระฆังแจ้งเตือนในแอป + mark-as-read ต่อผู้ใช้

## 11. Assets
- ไม่มีรูปภาพ — ไอคอนทั้งหมดเป็น inline SVG (line, stroke-width 2, currentColor) วาดในดีไซน์ ใช้ icon set ใดก็ได้ที่สไตล์ใกล้เคียง (เช่น Lucide)
- ฟอนต์: Google Fonts — Noto Sans Thai, Sora, DM Mono
- โลโก้: ตัวอักษร "KST" บนกล่องสี accent (ไม่มีไฟล์โลโก้จริง — หากมี ให้แทนที่)

## 12. Files
- `mockup/KST_Delivery_Tracker_mockup.html` — mock standalone (เปิดดูได้ทันที) ← เริ่มที่นี่
- `source/KST Delivery Tracker.dc.html` — ซอร์สดีไซน์ (อ้างอิงค่า/logic ที่แม่นยำ)
- `source/kst-data.js` — ข้อมูลตัวอย่างจากของจริง (โครงสร้าง field ตรงกับ DB)
- `source/support.js` — runtime prototype (ข้ามได้)
- ระบบเดิมอ้างอิง: `uploads/KST_Delivery_Tracker.html` (มี logic import/export/status ดั้งเดิมครบ)
