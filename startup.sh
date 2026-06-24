#!/usr/bin/env bash
# Azure App Service (Linux/Node) startup command.
# Set in: App Service → Configuration → General settings → Startup Command:
#   bash /home/site/wwwroot/startup.sh
set -e

# /home is the only persistent, writable path on App Service. Keep the SQLite
# file there so data survives restarts/redeploys. (Ignored when DATABASE_URL
# points at SQL Server/Postgres — db push just targets that instead.)
mkdir -p /home/data

echo "[startup] applying schema (prisma db push)…"
npx prisma db push --skip-generate --accept-data-loss

# Seed the bundled 263-row snapshot only on a fresh/empty database.
COUNT=$(node -e "const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.purchaseOrder.count().then(c=>{console.log(c);process.exit(0)}).catch(()=>{console.log(0);process.exit(0)})")
if [ "$COUNT" = "0" ]; then
  echo "[startup] empty DB → seeding snapshot…"
  npm run seed || echo "[startup] seed skipped/failed (non-fatal)"
else
  echo "[startup] DB already has $COUNT rows → skip seed"
fi

echo "[startup] starting Next.js…"
npm run start
