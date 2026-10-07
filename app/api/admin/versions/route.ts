import { isAdminAuthenticated } from "@/lib/auth";
import { jsonErr, jsonOk } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { suggestNextCodes } from "@/lib/bazaar";
import { z } from "zod";

export const runtime = "nodejs";

export async function GET() {
  if (!(await isAdminAuthenticated())) return jsonErr("غیرمجاز", 401);
  const versions = await prisma.appVersion.findMany({
    orderBy: [{ versionCode: "desc" }, { architecture: "asc" }],
  });
  const suggested = suggestNextCodes(
    versions.map((v) => ({ versionCode: v.versionCode, architecture: v.architecture }))
  );
  return jsonOk({
    versions,
    suggested,
    rules: {
      fa: [
        "هر بسته در یک رهانش باید versionCode یکتا داشته باشد.",
        "برای همان معماری، versionCode باید از نسخه قبلی بیشتر باشد.",
        "ترتیب پیشنهادی: arm64-v8a > armeabi-v7a > ALL",
        "معماری ALL معادل armeabi-v7a است؛ همزمان با v7a آپلود نشود.",
        "امضای APK باید با نسخه قبلی بازار یکسان باشد.",
      ],
    },
  });
}

const createSchema = z.object({
  versionCode: z.number().int().positive(),
  versionName: z.string().min(1).max(40),
  architecture: z.enum(["ALL", "armeabi-v7a", "arm64-v8a"]).default("ALL"),
  minSdk: z.number().int().optional(),
  targetSdk: z.number().int().optional(),
  changelogFa: z.string().max(4000).optional(),
  changelogEn: z.string().max(4000).optional(),
  notes: z.string().max(1000).optional(),
  status: z
    .enum(["draft", "ready", "uploaded", "in_review", "published", "rejected"])
    .optional(),
});

export async function POST(req: Request) {
  if (!(await isAdminAuthenticated())) return jsonErr("غیرمجاز", 401);
  try {
    const body = createSchema.parse(await req.json());
    const v = await prisma.appVersion.create({
      data: {
        versionCode: body.versionCode,
        versionName: body.versionName,
        architecture: body.architecture,
        minSdk: body.minSdk ?? 26,
        targetSdk: body.targetSdk ?? 34,
        changelogFa: body.changelogFa || "",
        changelogEn: body.changelogEn || "",
        notes: body.notes,
        status: body.status || "draft",
      },
    });
    return jsonOk({ version: v });
  } catch (e: any) {
    console.error(e);
    if (e?.code === "P2002")
      return jsonErr("این versionCode برای این معماری قبلاً ثبت شده", 400);
    return jsonErr("ثبت ناموفق", 400);
  }
}

export async function PATCH(req: Request) {
  if (!(await isAdminAuthenticated())) return jsonErr("غیرمجاز", 401);
  try {
    const body = await req.json();
    const id = body.id as string;
    if (!id) return jsonErr("id لازم است", 400);
    const data: Record<string, unknown> = {};
    for (const k of [
      "versionName",
      "changelogFa",
      "changelogEn",
      "notes",
      "status",
      "releaseId",
      "packageId",
      "minSdk",
      "targetSdk",
    ]) {
      if (body[k] !== undefined) data[k] = body[k];
    }
    if (body.versionCode !== undefined) data.versionCode = body.versionCode;
    if (body.architecture !== undefined) data.architecture = body.architecture;
    const v = await prisma.appVersion.update({ where: { id }, data });
    return jsonOk({ version: v });
  } catch (e) {
    console.error(e);
    return jsonErr("به‌روزرسانی ناموفق", 400);
  }
}

export async function DELETE(req: Request) {
  if (!(await isAdminAuthenticated())) return jsonErr("غیرمجاز", 401);
  try {
    const body = await req.json();
    if (!body.id) return jsonErr("id لازم است", 400);
    await prisma.appVersion.delete({ where: { id: body.id } });
    return jsonOk({ deleted: true });
  } catch {
    return jsonErr("حذف ناموفق", 400);
  }
}
