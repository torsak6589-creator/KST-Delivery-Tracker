#!/usr/bin/env bash
# KST Delivery Tracker — ตัวเริ่มระบบสำหรับ Linux/Mac
# รันบนเครื่อง/เซิร์ฟเวอร์ที่จะเป็นตัวให้บริการในบริษัท:  ./start.sh
set -e

echo "========================================"
echo "  KST Delivery Tracker - กำลังเริ่มระบบ"
echo "========================================"

if ! command -v docker >/dev/null 2>&1; then
  echo "[ERROR] ยังไม่ได้ติดตั้ง Docker — ดู https://docs.docker.com/engine/install/"
  exit 1
fi

echo "กำลัง build และเริ่มระบบ (ครั้งแรกใช้เวลา ~3-5 นาที)…"
docker compose up -d --build

IP=$(hostname -I 2>/dev/null | awk '{print $1}')
echo
echo "========================================"
echo "  เริ่มระบบสำเร็จ! ให้ทุกคนในบริษัทเปิด:"
echo "      http://${IP:-<server-ip>}:3000"
echo "========================================"
echo "เครื่องนี้เองเปิดได้ที่ http://localhost:3000"
echo "หยุดระบบ: docker compose down   |   อัปเดต: git pull แล้ว ./start.sh อีกครั้ง"
