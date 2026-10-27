import { prisma } from "@/lib/prisma";
import { clientIp, jsonErr, jsonOk } from "@/lib/api";
import { generateTimesheetWithAi } from "@/lib/ai";
import { z } from "zod";

export const runtime = "nodejs";

const taskSchema = z.object({
  key: z.string(),
  summary: z.string(),
  statusName: z.string().default("Done"),
  originalEstimateMinutes: z.number().int().min(1),
  existingLoggedMinutes: z.number().int().min(0).default(0),
  created: z.string().optional(),
});

const bodySchema = z.object({
  licenseKey: z.string().min(8).max(128),
  deviceId: z.string().min(4).max(128),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  presenceMinutes: z.number().int().min(1),
  startTime: z.string().default("08:00"),
  endTime: z.string().optional(),
  tasks: z.array(taskSchema).min(1, "حداقل یک تسک دارای برآورد زمان برای شارژ نیاز است"),
});

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]?.message || "داده نامعتبر است";
      return jsonErr(issue, 400);
    }

    const { licenseKey, deviceId, date, presenceMinutes, startTime, endTime, tasks } = parsed.data;
    const ip = clientIp(req);

    const license = await prisma.license.findUnique({
      where: { licenseKey },
      include: { activationCode: true },
    });

    if (!license) return jsonErr("لایسنس یافت نشد", 404);

    if (license.deviceId !== deviceId) {
      return jsonErr("دستگاه نامعتبر است", 403);
    }

    if (!license.active || !license.activationCode.enabled) {
      return jsonErr("لایسنس فعال نیست", 403);
    }

    const result = await generateTimesheetWithAi({
      date,
      presenceMinutes,
      startTime,
      endTime,
      tasks,
    });

    await prisma.auditLog.create({
      data: {
        action: "ai_timesheet_generate",
        detail: `${license.username || licenseKey.slice(0, 8)} - ${date} (${result.worklogs.length} logs)`,
        ip,
      },
    });

    return jsonOk({ result });
  } catch (e: any) {
    console.error("Timesheet error:", e);
    return jsonErr(e.message || "خطا در تولید تایم‌شیت با هوش مصنوعی", 500);
  }
}
