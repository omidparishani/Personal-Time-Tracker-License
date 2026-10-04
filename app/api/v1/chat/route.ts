import { prisma } from "@/lib/prisma";
import { jsonErr, jsonOk } from "@/lib/api";
import { z } from "zod";

export const runtime = "nodejs";

const listSchema = z.object({
  licenseKey: z.string().min(8),
  deviceId: z.string().min(4),
});

const sendSchema = listSchema.extend({
  body: z.string().min(1).max(2000),
});

async function getLicense(licenseKey: string, deviceId: string) {
  const license = await prisma.license.findUnique({ where: { licenseKey } });
  if (!license || license.deviceId !== deviceId || !license.active) return null;
  if (!license.canSupport) return null;
  return license;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const parsed = listSchema.safeParse({
      licenseKey: url.searchParams.get("licenseKey"),
      deviceId: url.searchParams.get("deviceId"),
    });
    if (!parsed.success) return jsonErr("داده نامعتبر", 400);

    const license = await getLicense(parsed.data.licenseKey, parsed.data.deviceId);
    if (!license) return jsonErr("غیرمجاز", 403);

    const messages = await prisma.chatMessage.findMany({
      where: { licenseId: license.id },
      orderBy: { createdAt: "asc" },
      take: 200,
    });

    await prisma.chatMessage.updateMany({
      where: { licenseId: license.id, sender: "admin", readByUser: false },
      data: { readByUser: true },
    });

    return jsonOk({
      messages: messages.map((m) => ({
        id: m.id,
        sender: m.sender,
        body: m.body,
        createdAt: m.createdAt,
      })),
    });
  } catch (e) {
    console.error(e);
    return jsonErr("خطا", 500);
  }
}

export async function POST(req: Request) {
  try {
    const parsed = sendSchema.safeParse(await req.json());
    if (!parsed.success) return jsonErr("داده نامعتبر", 400);

    const license = await getLicense(parsed.data.licenseKey, parsed.data.deviceId);
    if (!license) return jsonErr("غیرمجاز یا پشتیبانی غیرفعال", 403);

    const msg = await prisma.chatMessage.create({
      data: {
        licenseId: license.id,
        sender: "user",
        body: parsed.data.body.trim(),
        readByUser: true,
        readByAdmin: false,
      },
    });

    return jsonOk({
      message: {
        id: msg.id,
        sender: msg.sender,
        body: msg.body,
        createdAt: msg.createdAt,
      },
    });
  } catch (e) {
    console.error(e);
    return jsonErr("خطا", 500);
  }
}

/** پاک کردن تاریخچه چت کاربر */
export async function DELETE(req: Request) {
  try {
    const parsed = listSchema.safeParse(await req.json());
    if (!parsed.success) return jsonErr("داده نامعتبر", 400);
    const license = await getLicense(parsed.data.licenseKey, parsed.data.deviceId);
    if (!license) return jsonErr("غیرمجاز", 403);
    await prisma.chatMessage.deleteMany({ where: { licenseId: license.id } });
    return jsonOk({ cleared: true });
  } catch (e) {
    console.error(e);
    return jsonErr("خطا", 500);
  }
}
