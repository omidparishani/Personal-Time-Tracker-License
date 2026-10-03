import { isAdminAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { clientIp, jsonErr, jsonOk } from "@/lib/api";
import { z } from "zod";

export const runtime = "nodejs";

export async function GET() {
  if (!(await isAdminAuthenticated())) return jsonErr("غیرمجاز", 401);
  const shifts = await prisma.shift.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { licenses: true } } },
  });
  return jsonOk({ shifts });
}

const createSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(300).optional(),
  startWorkTime: z.string().max(8).default("09:00"),
  endWorkTime: z.string().max(8).default("17:00"),
  flexibleMinutes: z.number().int().min(0).max(480).default(30),
  minimumWorkMinutes: z.number().int().min(0).max(1440).default(480),
  weeklyRequiredMinutes: z.number().int().min(0).max(10000).default(2775),
  thursdayWorking: z.boolean().default(false),
  thursdayMinutes: z.number().int().min(0).max(1440).default(300),
  holidaysJson: z.string().default("[]"),
});

export async function POST(req: Request) {
  if (!(await isAdminAuthenticated())) return jsonErr("غیرمجاز", 401);
  try {
    const body = createSchema.parse(await req.json());
    const shift = await prisma.shift.create({ data: body });
    await prisma.auditLog.create({
      data: { action: "shift_create", detail: shift.name, ip: clientIp(req) },
    });
    return jsonOk({ shift });
  } catch (e) {
    console.error(e);
    return jsonErr("ساخت شیفت ناموفق", 400);
  }
}

const patchSchema = createSchema.partial().extend({
  id: z.string(),
  enabled: z.boolean().optional(),
});

export async function PATCH(req: Request) {
  if (!(await isAdminAuthenticated())) return jsonErr("غیرمجاز", 401);
  try {
    const body = patchSchema.parse(await req.json());
    const { id, ...data } = body;
    const shift = await prisma.shift.update({ where: { id }, data });
    return jsonOk({ shift });
  } catch (e) {
    console.error(e);
    return jsonErr("به‌روزرسانی ناموفق", 400);
  }
}

export async function DELETE(req: Request) {
  if (!(await isAdminAuthenticated())) return jsonErr("غیرمجاز", 401);
  try {
    const { id } = await req.json();
    if (!id) return jsonErr("id لازم است", 400);
    // جدا کردن لایسنس‌ها از شیفت قبل از حذف
    await prisma.license.updateMany({ where: { shiftId: id }, data: { shiftId: null } });
    await prisma.shift.delete({ where: { id } });
    return jsonOk({ deleted: true });
  } catch (e) {
    console.error(e);
    return jsonErr("حذف ناموفق", 400);
  }
}
