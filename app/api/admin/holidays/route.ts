import { prisma } from "@/lib/prisma";
import { jsonErr, jsonOk } from "@/lib/api";
import { isAdminAuthenticated } from "@/lib/auth";
import { z } from "zod";

export const runtime = "nodejs";

const DEFAULT_SOURCE =
  "https://raw.githubusercontent.com/hasan-ahani/shamsi-holidays/main/holidays";

export async function GET() {
  if (!(await isAdminAuthenticated())) return jsonErr("غیرمجاز", 401);
  const holidays = await prisma.officialHoliday.findMany({ orderBy: { date: "asc" } });
  return jsonOk({ holidays, defaultSource: DEFAULT_SOURCE });
}

export async function POST(req: Request) {
  if (!(await isAdminAuthenticated())) return jsonErr("غیرمجاز", 401);
  try {
    const body = await req.json();

    // همگام‌سازی از URL دلخواه یا پیش‌فرض
    if (body.syncYear || body.endpointUrl) {
      const year = Number(body.syncYear || new Date().getFullYear() - 621);
      // endpointUrl می‌تواند:
      // 1) پایه پوشه: .../holidays  →  .../holidays/1404.json
      // 2) آدرس کامل فایل JSON یک سال
      let url = (body.endpointUrl as string | undefined)?.trim() || "";
      if (!url) {
        url = `${DEFAULT_SOURCE}/${year}.json`;
      } else if (!url.endsWith(".json")) {
        url = `${url.replace(/\/$/, "")}/${year}.json`;
      }

      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) return jsonErr(`دریافت ناموفق (${res.status}): ${url}`, 502);
      const data = await res.json();
      const arr = Array.isArray(data) ? data : data.holidays || data.data || [];
      if (!Array.isArray(arr)) return jsonErr("فرمت JSON آرایه نیست", 400);

      let added = 0;
      for (const item of arr) {
        // پشتیبانی از چند فرمت رایج
        const isHol =
          item?.is_holiday === true ||
          item?.isHoliday === true ||
          item?.holiday === true ||
          item?.type === "holiday";
        if (!isHol && item?.is_holiday === false) continue;
        // اگر فیلد is_holiday نبود ولی title/date داشت، قبول کن
        const jdate = String(item.date || item.day || item.jdate || "");
        if (!jdate || jdate.length < 8) continue;
        if (item?.is_holiday === false) continue;

        let title =
          item.title ||
          item.description ||
          item.name ||
          "تعطیل رسمی";
        if (Array.isArray(item.events)) {
          const ev =
            item.events.find((e: any) => e.is_holiday) || item.events[0];
          if (ev?.description) title = String(ev.description);
          if (ev?.title) title = String(ev.title);
        }
        // اگر is_holiday مشخص نبود ولی events خالی بود، skip
        if (item?.is_holiday === undefined && item?.isHoliday === undefined) {
          if (Array.isArray(item.events)) {
            const anyHol = item.events.some((e: any) => e.is_holiday);
            if (!anyHol && item.events.length === 0) continue;
          }
        }

        await prisma.officialHoliday.upsert({
          where: { date: jdate },
          create: { date: jdate, title: String(title), source: url },
          update: { title: String(title), source: url },
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
    return jsonErr("خطا: " + (e as Error).message, 400);
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
  } catch {
    return jsonErr("حذف ناموفق", 400);
  }
}
