import KstApp from "@/components/KstApp";
import { readRows, getToday } from "@/lib/db";
import { buildDataset } from "@/lib/compute";

export const dynamic = "force-dynamic";

// Server component: load the snapshot from the DB on the server and hand it to
// the client renderer. If the DB isn't reachable yet (first-time setup), fall
// back to the bundled seed snapshot so the UI still renders.
async function loadInitialData() {
  try {
    const today = await getToday();
    const rows = await readRows();
    if (rows.length) return buildDataset(rows as any, today);
  } catch {
    /* DB not ready — fall through to seed */
  }
  try {
    const seed = (await import("../../prisma/seed-data.json")).default as any;
    return buildDataset(seed.pos, seed.today || "2026-06-24");
  } catch {
    return { today: "2026-06-24", kpi: {}, openVal: 0, overdueVal: 0, totalSuppliers: 0, pos: [], suppliers: [], depts: [], monthly: [] };
  }
}

export default async function Page() {
  const data = await loadInitialData();
  return <KstApp initialData={data} />;
}
