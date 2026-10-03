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
      shift: true,
    },
  });
  return jsonOk({ licenses });
}

const patchSchema = z.object({
  id: z.string(),
  active: z.boolean().optional(),
  disabledReason: z.string().max(300).optional(),
  adminNote: z.string().max(200).optional(),
  canJira: z.boolean().optional(),
  canAttendance: z.boolean().optional(),
  canReports: z.boolean().optional(),
  canSupport: z.boolean().optional(),
  shiftId: z.string().nullable().optional(),
});

export async function PATCH(req: Request) {
  if (!(await isAdminAuthenticated())) return jsonErr("غیرمجاز", 401);
  try {
    const body = patchSchema.parse(await req.json());
    const { id, ...rest } = body;
    const data: Record<string, unknown> = { ...rest };
    if (rest.active === false) {
      data.disabledAt = new Date();
      data.disabledReason = rest.disabledReason || "غیرفعال توسط مدیر";
    }
    if (rest.active === true) {
      data.disabledAt = null;
      data.disabledReason = null;
    }
    const updated = await prisma.license.update({
      where: { id },
      data,
      include: { shift: true },
    });
    await prisma.auditLog.create({
      data: {
        action: "license_update",
        detail: `${updated.licenseKey.slice(0, 12)}…`,
        ip: clientIp(req),
      },
    });
    return jsonOk({ license: updated });
  } catch (e) {
    console.error(e);
    return jsonErr("به‌روزرسانی ناموفق", 400);
  }
}
