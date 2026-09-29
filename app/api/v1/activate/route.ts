import { prisma } from "@/lib/prisma";
import { generateLicenseKey, normalizeCode } from "@/lib/codes";
import { clientIp, jsonErr, jsonOk } from "@/lib/api";
import { z } from "zod";

export const runtime = "nodejs";

const bodySchema = z.object({
  code: z.string().min(4).max(64),
  deviceId: z.string().min(4).max(128),
  deviceModel: z.string().max(128).optional(),
  deviceBrand: z.string().max(64).optional(),
  androidVersion: z.string().max(32).optional(),
  appVersion: z.string().max(32).optional(),
  username: z.string().max(128).optional(),
});

/**
 * فعال‌سازی اپ با کد یک‌بارمصرف
 * POST { code, deviceId, deviceModel?, username?, ... }
 */
export async function POST(req: Request) {
  try {
    const json = await req.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return jsonErr("داده نامعتبر است", 400, { details: parsed.error.flatten() });
    }

    const data = parsed.data;
    const code = normalizeCode(data.code);
    const ip = clientIp(req);

    const activation = await prisma.activationCode.findUnique({ where: { code } });
    if (!activation) {
      await prisma.auditLog.create({
        data: { action: "activate_fail", detail: `code_not_found:${code}`, ip },
      });
      return jsonErr("کد فعال‌سازی نامعتبر است", 404);
    }

    if (!activation.enabled) {
      return jsonErr("این کد توسط مدیر غیرفعال شده است", 403, { reason: "code_disabled" });
    }

    if (activation.expiresAt && activation.expiresAt < new Date()) {
      return jsonErr("مهلت استفاده از این کد گذشته است", 403, { reason: "code_expired" });
    }

    // اگر همین دستگاه قبلاً با همین کد فعال شده
    const existing = await prisma.license.findUnique({
      where: { codeId_deviceId: { codeId: activation.id, deviceId: data.deviceId } },
    });
    if (existing) {
      if (!existing.active) {
        return jsonErr("لایسنس این دستگاه غیرفعال شده است. با مدیر تماس بگیرید.", 403, {
          reason: "license_disabled",
        });
      }
      await prisma.license.update({
        where: { id: existing.id },
        data: {
          lastSeenAt: new Date(),
          username: data.username ?? existing.username,
          deviceModel: data.deviceModel ?? existing.deviceModel,
          appVersion: data.appVersion ?? existing.appVersion,
        },
      });
      return jsonOk({
        licenseKey: existing.licenseKey,
        message: "قبلاً فعال شده بود",
        reactivated: true,
      });
    }

    if (activation.usedCount >= activation.maxUses) {
      return jsonErr("ظرفیت این کد تکمیل شده است", 403, { reason: "code_exhausted" });
    }

    const licenseKey = generateLicenseKey();

    const license = await prisma.$transaction(async (tx) => {
      const lic = await tx.license.create({
        data: {
          licenseKey,
          codeId: activation.id,
          deviceId: data.deviceId,
          deviceModel: data.deviceModel,
          deviceBrand: data.deviceBrand,
          androidVersion: data.androidVersion,
          appVersion: data.appVersion,
          username: data.username,
          active: true,
        },
      });
      await tx.activationCode.update({
        where: { id: activation.id },
        data: { usedCount: { increment: 1 } },
      });
      await tx.auditLog.create({
        data: {
          action: "activate_ok",
          detail: `${code} → ${data.deviceId} (${data.username || "-"})`,
          ip,
        },
      });
      return lic;
    });

    return jsonOk({
      licenseKey: license.licenseKey,
      message: "فعال‌سازی موفق",
      reactivated: false,
    });
  } catch (e) {
    console.error(e);
    return jsonErr("خطای سرور", 500);
  }
}
