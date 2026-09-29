import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PTT License Admin",
  description: "مدیریت فعال‌سازی Personal Time Tracker",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
