import { prisma } from "@/lib/prisma";
import { jsonErr, jsonOk } from "@/lib/api";
import { isAdminAuthenticated } from "@/lib/auth";
import { z } from "zod";

export const runtime = "nodejs";

const DEFAULT_SOURCE =
  "https://raw.githubusercontent.com/hasan-ahani/shamsi-holidays/main/holidays";

/** تبدیل تقریبی جلالی به میلادی برای ذخیره یکنواخت */
function jalaliToGregorian(jy: number, jm: number, jd: number): string {
  // الگوریتم ساده — برای دقت از library استفاده شود؛ اینجا تقریبی استاندارد
  const gy = jy <= 979 ? 621 : 1600;
  const days =
    365 * jy +
    Math.floor(jy / 33) * 8 +
    Math.floor(((jy % 33) + 3) / 4) +
    78 +
    jd +
    (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186);
  let gDays = days - 79;
  // ساده‌سازی: از Date UTC استفاده نمی‌کنیم — ذخیره همان رشته جلالی هم کافی است
  // برای سازگاری با اپ، date را به صورت YYYY-MM-DD جلالی با پیشوند J نگه نمی‌داریم
  // اپ خودش shamsi را به greg تبدیل می‌کند؛ اینجا هم از همان منبع JSON استفاده می‌کنیم
  void gy;
  void gDays;
  return `${jy}-${String(jm).padStart(2, "0")}-${String(jd).padStart(2, "0")}`;
}

export async function GET() {
  if (!(await isAdminAuthenticated())) return jsonErr("غیرمجاز", 401);
  const holidays = await prisma.officialHoliday.findMany({ orderBy: { date: "asc" } });
  return jsonOk({ holidays, defaultSource: DEFAULT_SOURCE });
}

export async function POST(req: Request) {
  if (!(await isAdminAuthenticated())) return jsonErr("غیرمجاز", 401);
  try {
    const body = await req.json();
    // همگام‌سازی از گیت‌هاب برای سال جلالی
    if (body.syncYear) {
      const year = Number(body.syncYear);
      const url = `${DEFAULT_SOURCE}/${year}.json`;
      const res = await fetch(url, { next: { revalidate: 0 } });
      if (!res.ok) return jsonErr(`دریافت ناموفق: ${res.status}`, 502);
      const arr = (await res.json()) as any[];
      let added = 0;
      for (const item of arr) {
        if (!item?.is_holiday) continue;
        const jdate = String(item.date || ""); // 1404-01-01
        const parts = jdate.split("-").map(Number);
        if (parts.length !== 3) continue;
        let title = "تعطیل رسمی";
        if (Array.isArray(item.events)) {
          const ev = item.events.find((e: any) => e.is_holiday) || item.events[0];
          if (ev?.description) title = String(ev.description);
        }
        // ذخیره با کلید جلالی؛ اپ هنگام سینک تبدیل می‌کند
        await prisma.officialHoliday.upsert({
          where: { date: jdate },
          create: { date: jdate, title, source: "github" },
          update: { title, source: "github" },
        });
        added++;
      }
      return jsonOk({ added, year, source: url });
    }

    // افزودن دستی
    const schema = z.object({
      date: z.string().min(8),
      title: z.string().min(1).max(200),
    });
    const parsed = schema.parse(body);
    const h = await prisma.officialHoliday.upsert({
      where: { date: parsed.date },
      create: { date: parsed.date, title: parsed.title, source: "manual" },
      update: { title: parsed.title, source: "manual" },
    });
    return jsonOk({ holiday: h });
  } catch (e) {
    console.error(e);
    return jsonErr("خطا", 400);
  }
}

export async function DELETE(req: Request) {
  if (!(await isAdminAuthenticated())) return jsonErr("غیرمجاز", 401);
  try {
    const body = await req.json();
    if (body.all) {
      await prisma.officialHoliday.deleteMany({});
      return jsonOk({ cleared: true });
    }
    if (body.id) {
      await prisma.officialHoliday.delete({ where: { id: body.id } });
      return jsonOk({ deleted: true });
    }
    if (body.date) {
      await prisma.officialHoliday.delete({ where: { date: body.date } });
      return jsonOk({ deleted: true });
    }
    return jsonErr("پارامتر نامعتبر", 400);
  } catch (e) {
    return jsonErr("حذف ناموفق", 400);
  }
}
