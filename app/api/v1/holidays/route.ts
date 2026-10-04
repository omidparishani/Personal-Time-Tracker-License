import { prisma } from "@/lib/prisma";
import { jsonErr, jsonOk } from "@/lib/api";

export const runtime = "nodejs";

/** تعطیلات رسمی برای اپ — بدون احراز سخت (لایسنس اختیاری) */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const year = url.searchParams.get("year"); // جلالی مثل 1404
    let holidays = await prisma.officialHoliday.findMany({ orderBy: { date: "asc" } });
    if (year) {
      holidays = holidays.filter((h) => h.date.startsWith(String(year)));
    }
    return jsonOk({
      holidays: holidays.map((h) => ({
        date: h.date,
        title: h.title,
        source: h.source,
      })),
      defaultSource:
        "https://raw.githubusercontent.com/hasan-ahani/shamsi-holidays/main/holidays",
    });
  } catch (e) {
    console.error(e);
    return jsonErr("خطا", 500);
  }
}
