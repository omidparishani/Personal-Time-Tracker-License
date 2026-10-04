import { isAdminAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateActivationCode } from "@/lib/codes";
import { clientIp, jsonErr, jsonOk } from "@/lib/api";
import { z } from "zod";

export const runtime = "nodejs";

export async function GET() {
  if (!(await isAdminAuthenticated())) return jsonErr("غیرمجاز", 401);
  const codes = await prisma.activationCode.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { licenses: true } },
      licenses: {
        select: {
          id: true,
          active: true,
          username: true,
          deviceModel: true,
          deviceId: true,
          activatedAt: true,
          lastSeenAt: true,
        },
      },
    },
  });
  return jsonOk({ codes });
}

const createSchema = z.object({
  count: z.number().int().min(1).max(50).default(1),
  maxUses: z.number().int().min(1).max(20).default(1),
  note: z.string().max(200).optional(),
  expiresInDays: z.number().int().min(1).max(3650).optional(),
});

export async function POST(req: Request) {
  if (!(await isAdminAuthenticated())) return jsonErr("غیرمجاز", 401);
  try {
    const body = createSchema.parse(await req.json());
    const expiresAt = body.expiresInDays
      ? new Date(Date.now() + body.expiresInDays * 86400000)
      : null;

    const created: string[] = [];
    for (let i = 0; i < body.count; i++) {
      let code = generateActivationCode();
      // اطمینان از یکتا بودن
      for (let t = 0; t < 5; t++) {
        const exists = await prisma.activationCode.findUnique({ where: { code } });
        if (!exists) break;
        code = generateActivationCode();
      }
      await prisma.activationCode.create({
        data: {
          code,
          maxUses: body.maxUses,
          note: body.note,
          expiresAt,
        },
      });
      created.push(code);
    }

    await prisma.auditLog.create({
      data: {
        action: "codes_created",
        detail: `${created.length} codes: ${created.join(", ")}`,
        ip: clientIp(req),
      },
    });

    return jsonOk({ codes: created });
  } catch (e) {
    console.error(e);
    return jsonErr("خطا در ساخت کد", 400);
  }
}

const patchSchema = z.object({
  id: z.string(),
  enabled: z.boolean().optional(),
  note: z.string().max(200).optional().nullable(),
  maxUses: z.number().int().min(1).max(100).optional(),
  code: z.string().min(4).max(40).optional(),
});

export async function PATCH(req: Request) {
  if (!(await isAdminAuthenticated())) return jsonErr("غیرمجاز", 401);
  try {
    const body = patchSchema.parse(await req.json());
    const data: Record<string, unknown> = {};
    if (body.enabled !== undefined) data.enabled = body.enabled;
    if (body.note !== undefined) data.note = body.note;
    if (body.maxUses !== undefined) data.maxUses = body.maxUses;
    if (body.code !== undefined) data.code = body.code.trim().toUpperCase();
    const updated = await prisma.activationCode.update({
      where: { id: body.id },
      data,
    });
    return jsonOk({ code: updated });
  } catch (e) {
    console.error(e);
    return jsonErr("به‌روزرسانی ناموفق", 400);
  }
}

const deleteSchema = z.object({ id: z.string() });

export async function DELETE(req: Request) {
  if (!(await isAdminAuthenticated())) return jsonErr("غیرمجاز", 401);
  try {
    const body = deleteSchema.parse(await req.json());
    // حذف کد؛ لایسنس‌های وابسته با cascade اگر تعریف شده — وگرنه اول unlink
    await prisma.license.deleteMany({ where: { codeId: body.id } }).catch(() => null);
    await prisma.activationCode.delete({ where: { id: body.id } });
    await prisma.auditLog.create({
      data: { action: "code_delete", detail: body.id, ip: clientIp(req) },
    });
    return jsonOk({ deleted: true });
  } catch (e) {
    console.error(e);
    return jsonErr("حذف ناموفق — ممکن است لایسنس فعال داشته باشد", 400);
  }
}
