// Seed the database from the original snapshot (prisma/seed-data.json).
// Run with: npm run seed   (after prisma:push)
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { normalizeRows, type PoRow } from "../src/lib/compute";

const prisma = new PrismaClient();

function d(v: unknown): Date | null {
  if (!v) return null;
  const dt = new Date(String(v));
  return isNaN(dt.getTime()) ? null : dt;
}

async function main() {
  const raw = JSON.parse(readFileSync(join(__dirname, "seed-data.json"), "utf-8")) as { today: string; pos: PoRow[] };
  const today = raw.today || "2026-06-24";
  const rows = normalizeRows(raw.pos, today);

  await prisma.appMeta.upsert({ where: { id: 1 }, update: { today }, create: { id: 1, today } });

  // Clear then bulk insert (idempotent seed).
  await prisma.purchaseOrder.deleteMany({});
  let n = 0;
  for (const r of rows) {
    await prisma.purchaseOrder.create({
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
    });
    n++;
  }
  console.log(`Seeded ${n} PO rows (snapshot ${today}).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
