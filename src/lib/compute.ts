// Shared status-classification and aggregation logic.
// Ported 1:1 from the verified phase-1 standalone build, used by:
//  - /api/import  (when ingesting CSV/XLSX rows)
//  - /api/data    (to build the dashboard dataset from DB rows)
//  - prisma/seed.ts

export type Status = "ov" | "du" | "ne" | "ok" | "dn" | "ca";

export interface PoRow {
  id?: number;
  poNo?: string;
  lineItem?: number | null;
  poDate?: string | null;
  poStatus?: string | null;
  dueDate?: string | null;
  days?: number | null;
  status?: Status | string | null;
  vendorCode?: string | null;
  vendorName?: string | null;
  department?: string | null;
  requester?: string | null;
  itemCode?: string | null;
  itemName?: string | null;
  qty?: number | null;
  unit?: string | null;
  unitPrice?: number | null;
  amount?: number | null;
  pendingQty?: number | null;
  grpoStatus?: string | null;
  receiveDate?: string | null;
  grpoNo?: string | null;
  receiveQty?: number | null;
  receiveAmount?: number | null;
  createdBy?: string | null;
  prNo?: string | null;
  approveAVL?: string | null;
  [k: string]: unknown;
}

const VALID: Record<string, true> = { ov: true, du: true, ne: true, ok: true, dn: true, ca: true };
const OPEN: Record<string, true> = { ov: true, du: true, ne: true, ok: true };

function toNum(v: unknown): number {
  if (v == null || v === "") return 0;
  const n = Number(String(v).replace(/,/g, ""));
  return isNaN(n) ? 0 : n;
}

/** Classify a raw row's status + days remaining against the snapshot date. */
export function classify(o: PoRow, today: string): { status: Status; days: number | null } {
  if (o.status && VALID[o.status as string]) {
    const d = o.days == null || o.days === undefined ? null : Number(o.days);
    return { status: o.status as Status, days: isNaN(d as number) ? null : d };
  }
  const grpo = String(o.grpoStatus || "");
  const received =
    (o.receiveDate && String(o.receiveDate).trim()) ||
    (toNum(o.receiveQty) > 0 && toNum(o.qty) > 0 && toNum(o.receiveQty) >= toNum(o.qty)) ||
    /รับครบ|รับแล้ว|complete|closed/i.test(grpo);
  const cancelled = /ยกเลิก|cancel/i.test(String(o.poStatus || "") + "|" + grpo);

  if (cancelled) return { status: "ca", days: null };
  if (received) return { status: "dn", days: o.days == null ? null : Number(o.days) };

  const dd = o.dueDate ? new Date(o.dueDate) : null;
  const dnum = dd && !isNaN(dd.getTime()) ? Math.round((dd.getTime() - new Date(today).getTime()) / 86400000) : null;
  let status: Status;
  if (dnum == null) status = "ok";
  else if (dnum < 0) status = "ov";
  else if (dnum <= 3) status = "du";
  else if (dnum <= 7) status = "ne";
  else status = "ok";
  return { status, days: dnum };
}

/** Normalize raw rows: coerce numerics, fill amount, compute status/days. */
export function normalizeRows(rawRows: PoRow[], today: string): PoRow[] {
  const numKeys = ["lineItem", "qty", "unitPrice", "amount", "pendingQty", "receiveQty", "receiveAmount", "days"];
  return rawRows.map((r, idx) => {
    const o: PoRow = { ...r };
    for (const nk of numKeys) {
      if (o[nk] !== undefined && o[nk] !== "" && o[nk] !== null) {
        const num = Number(String(o[nk]).replace(/,/g, ""));
        o[nk] = isNaN(num) ? o[nk] : (num as never);
      }
    }
    o.id = o.id !== undefined && o.id !== null && (o.id as never) !== "" ? Number(o.id) : idx + 1;
    if (o.amount == null || (o.amount as never) === "" || isNaN(o.amount as number)) {
      o.amount = toNum(o.qty) * toNum(o.unitPrice);
    }
    const c = classify(o, today);
    o.status = c.status;
    o.days = c.days;
    return o;
  });
}

export interface Dataset {
  today: string;
  kpi: Record<string, number>;
  openVal: number;
  overdueVal: number;
  totalSuppliers: number;
  pos: PoRow[];
  suppliers: any[];
  depts: any[];
  monthly: any[];
}

/** Build the full dashboard dataset (KPIs, suppliers, depts, monthly) from rows. */
export function buildDataset(rows: PoRow[], today: string): Dataset {
  const pos = normalizeRows(rows, today);

  const kpi: Record<string, number> = { all: pos.length, ov: 0, du: 0, ne: 0, ok: 0, dn: 0, ca: 0 };
  let openVal = 0;
  let overdueVal = 0;
  for (const r of pos) {
    const s = r.status as string;
    if (kpi[s] !== undefined) kpi[s]++;
    if (OPEN[s]) openVal += toNum(r.amount);
    if (s === "ov") overdueVal += toNum(r.amount);
  }

  const sMap: Record<string, any> = {};
  for (const r of pos) {
    const key = r.vendorName || "(ไม่ระบุผู้ขาย)";
    const s = (sMap[key] ||= { name: key, code: r.vendorCode || "", lines: 0, amount: 0, open: 0, ov: 0, du: 0, ne: 0, received: 0, depts: {} as Record<string, true> });
    s.lines++;
    s.amount += toNum(r.amount);
    const st = r.status as string;
    if (OPEN[st]) s.open++;
    if (st === "ov") s.ov++;
    if (st === "du") s.du++;
    if (st === "ne") s.ne++;
    if (st === "dn") s.received++;
    if (r.department) s.depts[r.department] = true;
    if (!s.code && r.vendorCode) s.code = r.vendorCode;
  }
  const suppliers = Object.values(sMap)
    .map((s: any) => ({
      name: s.name, code: s.code, lines: s.lines, amount: Math.round(s.amount),
      open: s.open, ov: s.ov, du: s.du, ne: s.ne, received: s.received,
      onTime: s.lines ? Math.round((s.received / s.lines) * 100) : 0,
      depts: Object.keys(s.depts),
    }))
    .sort((a, b) => b.amount - a.amount);

  const dMap: Record<string, any> = {};
  for (const r of pos) {
    const key = r.department || "(ไม่ระบุแผนก)";
    const x = (dMap[key] ||= { dept: key, lines: 0, amount: 0, open: 0, ov: 0 });
    x.lines++;
    x.amount += toNum(r.amount);
    const st = r.status as string;
    if (OPEN[st]) x.open++;
    if (st === "ov") x.ov++;
  }
  const depts = Object.values(dMap)
    .map((x: any) => ({ dept: x.dept, lines: x.lines, amount: Math.round(x.amount), open: x.open, ov: x.ov }))
    .sort((a, b) => b.amount - a.amount);

  const mMap: Record<string, any> = {};
  for (const r of pos) {
    if (!OPEN[r.status as string] || !r.dueDate) continue;
    const mo = String(r.dueDate).slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(mo)) continue;
    const m = (mMap[mo] ||= { mo, count: 0, amount: 0 });
    m.count++;
    m.amount += toNum(r.amount);
  }
  const monthly = Object.keys(mMap)
    .sort()
    .map((k) => ({ mo: k, count: mMap[k].count, amount: Math.round(mMap[k].amount) }));

  return {
    today,
    kpi,
    openVal: Math.round(openVal),
    overdueVal: Math.round(overdueVal),
    totalSuppliers: suppliers.length,
    pos,
    suppliers,
    depts,
    monthly,
  };
}

// Column map: import header aliases <-> canonical keys (round-trips with export).
export const COLS: { k: string; label: string }[] = [
  { k: "poNo", label: "เลขที่ PO" }, { k: "lineItem", label: "Line" }, { k: "poDate", label: "วันที่ออก PO" },
  { k: "dueDate", label: "กำหนดส่ง" }, { k: "vendorCode", label: "รหัสผู้ขาย" }, { k: "vendorName", label: "ผู้ขาย" },
  { k: "itemCode", label: "รหัสสินค้า" }, { k: "itemName", label: "รายการสินค้า" }, { k: "qty", label: "จำนวน" },
  { k: "unit", label: "หน่วย" }, { k: "unitPrice", label: "ราคา/หน่วย" }, { k: "amount", label: "มูลค่า" },
  { k: "pendingQty", label: "ค้างรับ" }, { k: "department", label: "แผนก" }, { k: "requester", label: "ผู้ประสงค์ใช้" },
  { k: "grpoStatus", label: "สถานะ GRPO" }, { k: "receiveDate", label: "วันที่รับ" }, { k: "grpoNo", label: "เลขที่ GRPO" },
  { k: "receiveQty", label: "ปริมาณรับ" }, { k: "createdBy", label: "ผู้สร้าง PO" }, { k: "poStatus", label: "สถานะใบสั่งซื้อ" },
  { k: "prNo", label: "เลขที่ PR" }, { k: "status", label: "รหัสสถานะ" }, { k: "days", label: "วันคงเหลือ" },
];

const CANON: Record<string, string> = {
  id: "id", pono: "poNo", lineitem: "lineItem", line: "lineItem", podate: "poDate", postatus: "poStatus",
  duedate: "dueDate", days: "days", status: "status", vendorcode: "vendorCode", vendorname: "vendorName",
  supplier: "vendorName", department: "department", dept: "department", requester: "requester", itemcode: "itemCode",
  itemname: "itemName", qty: "qty", quantity: "qty", unit: "unit", unitprice: "unitPrice", amount: "amount",
  pendingqty: "pendingQty", grpostatus: "grpoStatus", receivedate: "receiveDate", grpono: "grpoNo",
  receiveqty: "receiveQty", receiveamount: "receiveAmount", createdby: "createdBy", prno: "prNo",
};

export function mapHeader(h: string): string | null {
  const t = (h || "").trim();
  for (const c of COLS) if (c.label === t) return c.k;
  const k = t.toLowerCase().replace(/\s+/g, "");
  return CANON[k] || null;
}
