import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KST Delivery Tracker",
  description: "ติดตามสถานะการส่งของจาก Supplier ตามใบสั่งซื้อ — ฝ่ายจัดซื้อ ห้องเย็นโชติวัฒน์",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@300;400;500;600;700&family=Sora:wght@500;600;700&family=DM+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
