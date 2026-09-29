import { isAdminAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { clientIp, jsonErr, jsonOk } from "@/lib/api";
import { z } from "zod";

export const runtime = "nodejs";

export async function GET() {
  if (!(await isAdminAuthenticated())) return jsonErr("غیرمجاز", 401);
  const licenses = await prisma.license.findMany({
    orderBy: { activatedAt: "desc" },
    include: {
      activationCode: { select: { code: true, note: true } },
    },
  });
  return jsonOk({ licenses });
}

const patchSchema = z.object({
  id: z.string(),
  active: z.boolean(),
  disabledReason: z.string().max(300).optional(),
  adminNote: z.string().max(200).optional(),
});

/** فعال / غیرفعال کردن لایسنس یک کاربر */
export async function PATCH(req: Request) {
  if (!(await isAdminAuthenticated())) return jsonErr("غیرمجاز", 401);
  try {
    const body = patchSchema.parse(await req.json());
    const updated = await prisma.license.update({
      where: { id: body.id },
      data: {
        active: body.active,
        disabledAt: body.active ? null : new Date(),
        disabledReason: body.active ? null : body.disabledReason || "غیرفعال توسط مدیر",
        adminNote: body.adminNote,
      },
    });
    await prisma.auditLog.create({
      data: {
        action: body.active ? "license_enable" : "license_disable",
        detail: `${updated.licenseKey.slice(0, 12)}… ${updated.username || updated.deviceId}`,
        ip: clientIp(req),
      },
    });
    return jsonOk({ license: updated });
  } catch {
    return jsonErr("به‌روزرسانی ناموفق", 400);
  }
}
