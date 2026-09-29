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

/**
 * بررسی فعال بودن لایسنس هنگام ورود به اپ
 * POST { licenseKey, deviceId }
 */
export async function POST(req: Request) {
  try {
    const json = await req.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return jsonErr("داده نامعتبر است", 400);
    }

    const { licenseKey, deviceId, username, appVersion } = parsed.data;
    const ip = clientIp(req);

    const license = await prisma.license.findUnique({
      where: { licenseKey },
      include: { activationCode: true },
    });

    if (!license) {
      return jsonOk({ active: false, reason: "not_found" }, 200);
    }

    if (license.deviceId !== deviceId) {
      await prisma.auditLog.create({
        data: {
          action: "validate_device_mismatch",
          detail: `${licenseKey.slice(0, 12)}… device=${deviceId}`,
          ip,
        },
      });
      return jsonOk({ active: false, reason: "device_mismatch" }, 200);
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

    return jsonOk({
      active: true,
      username: license.username,
      activatedAt: license.activatedAt,
    });
  } catch (e) {
    console.error(e);
    return jsonErr("خطای سرور", 500);
  }
}
