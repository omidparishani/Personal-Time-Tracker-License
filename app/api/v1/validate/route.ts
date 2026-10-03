import { prisma } from "@/lib/prisma";
import { clientIp, jsonErr, jsonOk } from "@/lib/api";
import { z } from "zod";

export const runtime = "nodejs";

const bodySchema = z.object({
  licenseKey: z.string().min(8).max(128),
  deviceId: z.string().min(4).max(128),
  username: z.string().max(128).optional(),
  appVersion: z.string().max(32).optional(),
});

function parseHolidays(raw: string | null | undefined): string[] {
  try {
    const a = JSON.parse(raw || "[]");
    return Array.isArray(a) ? a : [];
  } catch {
    return [];
  }
}

function workFrom(source: {
  startWorkTime: string;
  endWorkTime: string;
  flexibleMinutes: number;
  minimumWorkMinutes: number;
  weeklyRequiredMinutes: number;
  thursdayWorking: boolean;
  thursdayMinutes: number;
  holidaysJson: string;
  name?: string;
}) {
  return {
    shiftName: source.name || null,
    startWorkTime: source.startWorkTime || "09:00",
    endWorkTime: source.endWorkTime || "17:00",
    flexibleMinutes: source.flexibleMinutes ?? 30,
    minimumWorkMinutes: source.minimumWorkMinutes ?? 480,
    weeklyRequiredMinutes: source.weeklyRequiredMinutes ?? 2775,
    thursdayWorking: !!source.thursdayWorking,
    thursdayMinutes: source.thursdayMinutes ?? 300,
    holidays: parseHolidays(source.holidaysJson),
  };
}

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) return jsonErr("داده نامعتبر است", 400);

    const { licenseKey, deviceId, username, appVersion } = parsed.data;
    const ip = clientIp(req);

    const license = await prisma.license.findUnique({
      where: { licenseKey },
      include: { activationCode: true, shift: true },
    });

    if (!license) return jsonOk({ active: false, reason: "not_found" });

    if (license.deviceId !== deviceId) {
      await prisma.auditLog.create({
        data: { action: "validate_device_mismatch", detail: licenseKey.slice(0, 12), ip },
      });
      return jsonOk({ active: false, reason: "device_mismatch" });
    }

    if (!license.active) {
      return jsonOk({
        active: false,
        reason: "disabled",
        message: license.disabledReason || "لایسنس توسط مدیر غیرفعال شده است",
      });
    }

    if (!license.activationCode.enabled) {
      return jsonOk({ active: false, reason: "code_disabled" });
    }

    await prisma.license.update({
      where: { id: license.id },
      data: {
        lastSeenAt: new Date(),
        username: username ?? license.username,
        appVersion: appVersion ?? license.appVersion,
      },
    });

    const unread = await prisma.chatMessage.count({
      where: { licenseId: license.id, sender: "admin", readByUser: false },
    });

    const workSource = license.shift
      ? { ...license.shift, name: license.shift.name }
      : {
          startWorkTime: license.startWorkTime,
          endWorkTime: license.endWorkTime,
          flexibleMinutes: license.flexibleMinutes,
          minimumWorkMinutes: license.minimumWorkMinutes,
          weeklyRequiredMinutes: license.weeklyRequiredMinutes,
          thursdayWorking: license.thursdayWorking,
          thursdayMinutes: license.thursdayMinutes,
          holidaysJson: license.holidaysJson,
          name: undefined,
        };

    return jsonOk({
      active: true,
      config: {
        permissions: {
          jira: !!license.canJira,
          attendance: !!license.canAttendance,
          reports: !!license.canReports,
          support: !!license.canSupport,
        },
        work: workFrom(workSource),
        username: license.username,
        shiftId: license.shiftId,
      },
      unreadSupport: unread,
    });
  } catch (e) {
    console.error(e);
    return jsonErr("خطای سرور", 500);
  }
}
