import { prisma } from "@/lib/prisma";
import { jsonErr, jsonOk } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { z } from "zod";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const admin = await requireAdmin(req);
  if (!admin) return jsonErr("غیرمجاز", 401);

  const url = new URL(req.url);
  const licenseId = url.searchParams.get("licenseId");

  if (licenseId) {
    const messages = await prisma.chatMessage.findMany({
      where: {
        OR: [
          { licenseId, kind: "support" },
          { kind: "broadcast" },
        ],
      },
      orderBy: { createdAt: "asc" },
      take: 500,
    });
    await prisma.chatMessage.updateMany({
      where: { licenseId, sender: "user", readByAdmin: false },
      data: { readByAdmin: true },
    });
    return jsonOk({ messages });
  }

  // لیست ترددهای پشتیبانی با آخرین پیام
  const licenses = await prisma.license.findMany({
    where: { active: true },
    select: {
      id: true,
      username: true,
      adminNote: true,
      licenseKey: true,
      messages: {
        where: { kind: "support" },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      _count: {
        select: {
          messages: {
            where: { kind: "support", sender: "user", readByAdmin: false },
          },
        },
      },
    },
    orderBy: { lastSeenAt: "desc" },
    take: 100,
  });

  return jsonOk({
    threads: licenses.map((l) => ({
      id: l.id,
      name: l.username || l.adminNote || l.licenseKey.slice(0, 8),
      lastMessage: l.messages[0]?.body || null,
      lastAt: l.messages[0]?.createdAt || null,
      unread: l._count.messages,
    })),
  });
}

export async function POST(req: Request) {
  const admin = await requireAdmin(req);
  if (!admin) return jsonErr("غیرمجاز", 401);

  const body = await req.json();
  const schema = z.object({
    body: z.string().min(1).max(4000),
    licenseId: z.string().optional(),
    broadcast: z.boolean().optional(),
  });
  const parsed = schema.safeParse(body);
  if (!parsed.success) return jsonErr("داده نامعتبر", 400);

  if (parsed.data.broadcast) {
    // یک پیام broadcast برای همه
    // از اولین لایسنس فعال به‌عنوان anchor استفاده می‌کنیم یا پیام بدون وابستگی
    const any = await prisma.license.findFirst({ where: { active: true } });
    if (!any) return jsonErr("هیچ کاربری نیست", 400);
    const msg = await prisma.chatMessage.create({
      data: {
        licenseId: any.id,
        sender: "admin",
        body: parsed.data.body.trim(),
        kind: "broadcast",
        readByAdmin: true,
        readByUser: false,
      },
    });
    return jsonOk({ message: msg, broadcast: true });
  }

  if (!parsed.data.licenseId) return jsonErr("licenseId لازم است", 400);
  const msg = await prisma.chatMessage.create({
    data: {
      licenseId: parsed.data.licenseId,
      sender: "admin",
      body: parsed.data.body.trim(),
      kind: "support",
      readByAdmin: true,
      readByUser: false,
    },
  });
  return jsonOk({ message: msg });
}

export async function DELETE(req: Request) {
  const admin = await requireAdmin(req);
  if (!admin) return jsonErr("غیرمجاز", 401);
  const body = await req.json();
  if (body.all) {
    await prisma.chatMessage.deleteMany({});
    return jsonOk({ cleared: true });
  }
  if (body.licenseId) {
    await prisma.chatMessage.deleteMany({
      where: { licenseId: body.licenseId, kind: "support" },
    });
    return jsonOk({ cleared: true });
  }
  if (body.id) {
    await prisma.chatMessage.delete({ where: { id: body.id } });
    return jsonOk({ deleted: true });
  }
  return jsonErr("پارامتر نامعتبر", 400);
}
