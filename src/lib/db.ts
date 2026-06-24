import { PrismaClient } from "@prisma/client";

// Reuse a single client across hot-reloads in dev.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ?? new PrismaClient({ log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"] });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

/** Snapshot date used for status/days. Falls back to env, then a fixed default. */
export async function getToday(): Promise<string> {
  try {
    const meta = await prisma.appMeta.findUnique({ where: { id: 1 } });
    if (meta?.today) return meta.today;
  } catch {
    /* table may not exist yet */
  }
  return process.env.NEXT_PUBLIC_SNAPSHOT_DATE || "2026-06-24";
}

function isoDate(d: Date | null | undefined): string | null {
  if (!d) return null;
  const dt = d instanceof Date ? d : new Date(d);
  return isNaN(dt.getTime()) ? null : dt.toISOString().slice(0, 10);
}

/** Read every PO row from the DB as plain JSON rows for buildDataset(). */
export async function readRows() {
  const rows = await prisma.purchaseOrder.findMany();
  return rows.map((r) => ({
    ...r,
    poDate: isoDate(r.poDate),
    dueDate: isoDate(r.dueDate),
    receiveDate: isoDate(r.receiveDate),
  }));
}
