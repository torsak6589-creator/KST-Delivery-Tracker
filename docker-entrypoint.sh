#!/usr/bin/env bash
# Container start: ensure schema exists, seed once if empty, then run the app.
set -e

# If using SQLite (DATABASE_URL=file:/data/dev.db), make sure the folder exists.
case "$DATABASE_URL" in
  file:*)
    DBPATH="${DATABASE_URL#file:}"
    mkdir -p "$(dirname "$DBPATH")"
    ;;
esac

echo "[entrypoint] applying schema (prisma db push)…"
npx prisma db push --skip-generate --accept-data-loss

# Seed the bundled 263-row snapshot only when the table is empty.
COUNT=$(node -e "const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.purchaseOrder.count().then(c=>{console.log(c);process.exit(0)}).catch(()=>{console.log(0);process.exit(0)})")
if [ "$COUNT" = "0" ]; then
  echo "[entrypoint] empty DB → seeding snapshot…"
  npm run seed || echo "[entrypoint] seed skipped/failed (non-fatal)"
else
  echo "[entrypoint] DB already has $COUNT rows → skip seed"
fi

echo "[entrypoint] starting Next.js on port ${PORT:-3000}…"
exec npm run start
