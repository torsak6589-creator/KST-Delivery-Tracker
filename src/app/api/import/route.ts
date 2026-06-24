import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { prisma, getToday, readRows } from "@/lib/db";
import { buildDataset, normalizeRows, mapHeader, type PoRow } from "@/lib/compute";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function d(v: unknown): Date | null {
  if (!v) return null;
  const dt = new Date(String(v));
  return isNaN(dt.getTime()) ? null : dt;
}

// Remap arbitrary spreadsheet headers to our canonical keys.
function remap(rows: Record<string, unknown>[]): PoRow[] {
  return rows.map((row) => {
    const o: PoRow = {};
    for (const h of Object.keys(row)) {
      const key = mapHeader(h);
      if (key) (o as any)[key] = row[h];
    }
    return o;
  });
}

// POST /api/import  (multipart form-data, field "file": .xlsx/.xls/.csv/.json)
// Replaces the PO table with the uploaded rows, recomputing status + aggregates.
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "ไม่พบไฟล์ที่อัปโหลด" }, { status: 400 });

    const name = file.name.toLowerCase();
    const buf = Buffer.from(await file.arrayBuffer());
    let raw: PoRow[];

    if (name.endsWith(".json")) {
      const obj = JSON.parse(buf.toString("utf-8"));
      raw = Array.isArray(obj) ? obj : obj.pos || obj.rows || [];
    } else {
      // xlsx handles .xlsx, .xls AND .csv
      const wb = XLSX.read(buf, { type: "buffer", cellDates: false });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false });
      raw = remap(json);
    }

    if (!raw.length) {
      return NextResponse.json(
        { error: "ไม่พบรายการในไฟล์ — ตรวจสอบหัวคอลัมน์ (ต้องมีอย่างน้อย เลขที่ PO, กำหนดส่ง, ผู้ขาย, มูลค่า)" },
        { status: 400 }
      );
    }

    const today = await getToday();
    const rows = normalizeRows(raw, today);

    // Replace dataset transactionally.
    await prisma.$transaction([
      prisma.purchaseOrder.deleteMany({}),
      ...rows.map((r) =>
        prisma.purchaseOrder.create({
          data: {
            poNo: String(r.poNo ?? ""),
            lineItem: r.lineItem == null ? null : Number(r.lineItem),
            poDate: d(r.poDate),
            poStatus: r.poStatus ?? null,
            dueDate: d(r.dueDate),
            days: r.days == null ? null : Number(r.days),
            status: (r.status as string) ?? null,
            vendorCode: r.vendorCode ?? null,
            vendorName: r.vendorName ?? null,
            department: r.department ?? null,
            requester: r.requester ?? null,
            itemCode: r.itemCode ?? null,
            itemName: r.itemName ?? null,
            qty: r.qty == null ? null : Number(r.qty),
            unit: r.unit ?? null,
            unitPrice: r.unitPrice == null ? null : Number(r.unitPrice),
            amount: r.amount == null ? null : Number(r.amount),
            pendingQty: r.pendingQty == null ? null : Number(r.pendingQty),
            grpoStatus: r.grpoStatus ?? null,
            receiveDate: d(r.receiveDate),
            grpoNo: r.grpoNo ?? null,
            receiveQty: r.receiveQty == null ? null : Number(r.receiveQty),
            receiveAmount: r.receiveAmount == null ? null : Number(r.receiveAmount),
            createdBy: r.createdBy ?? null,
            prNo: r.prNo ?? null,
            approveAVL: (r as any).approveAVL ?? null,
          },
        })
      ),
    ]);

    const data = buildDataset(await readRows() as any, today);
    return NextResponse.json({ imported: rows.length, data });
  } catch (e: any) {
    return NextResponse.json({ error: "นำเข้าไม่สำเร็จ", detail: String(e?.message || e) }, { status: 500 });
  }
}
