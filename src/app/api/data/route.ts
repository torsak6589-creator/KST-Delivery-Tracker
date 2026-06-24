import { NextResponse } from "next/server";
import { readRows, getToday } from "@/lib/db";
import { buildDataset } from "@/lib/compute";

export const dynamic = "force-dynamic";

// GET /api/data -> full dashboard dataset built from the database.
export async function GET() {
  try {
    const today = await getToday();
    const rows = await readRows();
    const data = buildDataset(rows as any, today);
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json(
      { error: "อ่านข้อมูลจากฐานข้อมูลไม่สำเร็จ", detail: String(e?.message || e) },
      { status: 500 }
    );
  }
}
