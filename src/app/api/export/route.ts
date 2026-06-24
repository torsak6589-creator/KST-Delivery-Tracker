import * as XLSX from "xlsx";
import { readRows, getToday } from "@/lib/db";
import { buildDataset, COLS, type PoRow } from "@/lib/compute";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/export?format=csv|xlsx&status=&dept=&from=&to=&q=
// Exports the filtered PO list. Filtering mirrors the client table.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const format = (url.searchParams.get("format") || "csv").toLowerCase();
  const status = url.searchParams.get("status") || "all";
  const dept = url.searchParams.get("dept") || "";
  const from = url.searchParams.get("from") || "";
  const to = url.searchParams.get("to") || "";
  const q = (url.searchParams.get("q") || "").trim().toLowerCase();

  const today = await getToday();
  const data = buildDataset((await readRows()) as any, today);
  let rows: PoRow[] = data.pos;

  if (status !== "all") rows = rows.filter((r) => r.status === status);
  if (dept) rows = rows.filter((r) => r.department === dept);
  if (from) rows = rows.filter((r) => r.dueDate && String(r.dueDate) >= from);
  if (to) rows = rows.filter((r) => r.dueDate && String(r.dueDate) <= to);
  if (q)
    rows = rows.filter((r) =>
      ((r.vendorName || "") + (r.poNo || "") + (r.itemName || "") + (r.itemCode || "") + (r.prNo || ""))
        .toLowerCase()
        .includes(q)
    );

  const aoa = [COLS.map((c) => c.label), ...rows.map((r) => COLS.map((c) => (r[c.k] == null ? "" : r[c.k])))];

  if (format === "xlsx") {
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "PO");
    const out = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    return new Response(out, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="KST_PO_report.xlsx"`,
      },
    });
  }

  // CSV with UTF-8 BOM so Excel reads Thai correctly.
  const csv = aoa
    .map((row) =>
      row
        .map((cell) => {
          const s = String(cell);
          return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
        })
        .join(",")
    )
    .join("\r\n");
  return new Response("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv;charset=utf-8",
      "Content-Disposition": `attachment; filename="KST_PO_report.csv"`,
    },
  });
}
