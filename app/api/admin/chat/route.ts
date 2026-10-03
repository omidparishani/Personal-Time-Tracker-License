import { isAdminAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonErr, jsonOk } from "@/lib/api";
import { z } from "zod";

export const runtime = "nodejs";

/** لیست گفتگوها + پیام‌های یک لایسنس */
export async function GET(req: Request) {
  if (!(await isAdminAuthenticated())) return jsonErr("غیرمجاز", 401);
  const url = new URL(req.url);
  const licenseId = url.searchParams.get("licenseId");

  if (!licenseId) {
    // لیست لایسنس‌هایی که پیام دارند + تعداد خوانده‌نشده
    const licenses = await prisma.license.findMany({
      orderBy: { lastSeenAt: "desc" },
      select: {
        id: true,
        username: true,
        deviceModel: true,
        active: true,
        lastSeenAt: true,
        _count: {
          select: {
            messages: { where: { sender: "user", readByAdmin: false } },
          },
        },
      },
    });
    return jsonOk({
      threads: licenses
        .map((l) => ({
          licenseId: l.id,
          username: l.username,
          deviceModel: l.deviceModel,
          active: l.active,
          lastSeenAt: l.lastSeenAt,
          unread: l._count.messages,
        }))
        .filter((t) => t.unread > 0 || true),
    });
  }

  const messages = await prisma.chatMessage.findMany({
    where: { licenseId },
    orderBy: { createdAt: "asc" },
    take: 300,
  });
  await prisma.chatMessage.updateMany({
    where: { licenseId, sender: "user", readByAdmin: false },
    data: { readByAdmin: true },
  });
  return jsonOk({
    messages: messages.map((m) => ({
      id: m.id,
      sender: m.sender,
      body: m.body,
      createdAt: m.createdAt,
    })),
  });
}

const sendSchema = z.object({
  licenseId: z.string(),
  body: z.string().min(1).max(2000),
});

export async function POST(req: Request) {
  if (!(await isAdminAuthenticated())) return jsonErr("غیرمجاز", 401);
  try {
    const body = sendSchema.parse(await req.json());
    const msg = await prisma.chatMessage.create({
      data: {
        licenseId: body.licenseId,
        sender: "admin",
        body: body.body.trim(),
        readByAdmin: true,
        readByUser: false,
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
  } catch {
    return jsonErr("ارسال ناموفق", 400);
  }
}
