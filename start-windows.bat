@echo off
REM ============================================================
REM  KST Delivery Tracker - ตัวเริ่มระบบสำหรับ Windows (ดับเบิลคลิกได้)
REM  รันบนเครื่อง/เซิร์ฟเวอร์ที่จะเป็นตัวให้บริการในบริษัท
REM ============================================================
setlocal enabledelayedexpansion
echo.
echo ========================================
echo   KST Delivery Tracker - กำลังเริ่มระบบ
echo ========================================
echo.

where docker >nul 2>nul
if errorlevel 1 (
  echo [ERROR] ยังไม่ได้ติดตั้ง Docker Desktop
  echo         ดาวน์โหลดที่: https://www.docker.com/products/docker-desktop/
  echo         ติดตั้งแล้วเปิดโปรแกรม Docker Desktop ค้างไว้ แล้วรันไฟล์นี้อีกครั้ง
  pause
  exit /b 1
)

echo กำลัง build และเริ่มระบบ (ครั้งแรกใช้เวลา ~3-5 นาที)...
docker compose up -d --build
if errorlevel 1 (
  echo [ERROR] เริ่มระบบไม่สำเร็จ - ตรวจว่าเปิด Docker Desktop อยู่หรือไม่
  pause
  exit /b 1
)

echo.
echo ========================================
echo   เริ่มระบบสำเร็จ!  ให้ทุกคนในบริษัทเปิด:
echo ========================================
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
  set ip=%%a
  set ip=!ip: =!
  echo      http://!ip!:3000
)
echo.
echo (เลือก IP วงเดียวกับเครื่องอื่นในออฟฟิศ มักขึ้นต้น 192.168.x.x หรือ 10.x.x.x)
echo เครื่องนี้เองเปิดได้ที่ http://localhost:3000
echo.
echo หยุดระบบ: รัน  docker compose down
echo อัปเดตเวอร์ชันใหม่: รัน  git pull  แล้วรันไฟล์นี้อีกครั้ง
echo.
pause
