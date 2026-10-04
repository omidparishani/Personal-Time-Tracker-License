import { prisma } from "@/lib/prisma";
import { jsonErr, jsonOk } from "@/lib/api";
import { z } from "zod";

export const runtime = "nodejs";

const authSchema = z.object({
  licenseKey: z.string().min(8),
  deviceId: z.string().min(4),
});

async function getLicense(licenseKey: string, deviceId: string) {
  const license = await prisma.license.findUnique({ where: { licenseKey } });
  if (!license || license.deviceId !== deviceId || !license.active) return null;
  if (!license.canSupport) return null;
  return license;
}

/** لیست پیام‌ها — support / direct / broadcast */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const parsed = authSchema.safeParse({
      licenseKey: url.searchParams.get("licenseKey"),
      deviceId: url.searchParams.get("deviceId"),
    });
    if (!parsed.success) return jsonErr("داده نامعتبر", 400);

    const license = await getLicense(parsed.data.licenseKey, parsed.data.deviceId);
    if (!license) return jsonErr("غیرمجاز", 403);

    const peerId = url.searchParams.get("peerId"); // null = support + broadcast
    const kind = url.searchParams.get("kind") || (peerId ? "direct" : "support");

    let messages;
    if (kind === "direct" && peerId) {
      messages = await prisma.chatMessage.findMany({
        where: {
          kind: "direct",
          OR: [
            { licenseId: license.id, peerId },
            { licenseId: peerId, peerId: license.id },
          ],
        },
        orderBy: { createdAt: "asc" },
        take: 300,
      });
    } else if (kind === "broadcast") {
      messages = await prisma.chatMessage.findMany({
        where: { kind: "broadcast" },
        orderBy: { createdAt: "asc" },
        take: 100,
      });
    } else {
      // support + recent broadcasts
      messages = await prisma.chatMessage.findMany({
        where: {
          OR: [
            { licenseId: license.id, kind: "support" },
            { kind: "broadcast" },
          ],
        },
        orderBy: { createdAt: "asc" },
        take: 300,
      });
      await prisma.chatMessage.updateMany({
        where: {
          OR: [
            { licenseId: license.id, sender: "admin", readByUser: false },
            { kind: "broadcast", readByUser: false },
          ],
        },
        data: { readByUser: true },
      });
    }

    return jsonOk({
      messages: messages.map((m) => ({
        id: m.id,
        sender: m.sender,
        body: m.body,
        kind: m.kind,
        peerId: m.peerId,
        licenseId: m.licenseId,
        mine: m.licenseId === license.id && m.sender === "user",
        createdAt: m.createdAt,
      })),
    });
  } catch (e) {
    console.error(e);
    return jsonErr("خطا", 500);
  }
}

/** ارسال پیام support یا direct */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = authSchema
      .extend({
        body: z.string().min(1).max(4000),
        peerId: z.string().optional().nullable(),
        kind: z.enum(["support", "direct"]).optional(),
      })
      .safeParse(body);
    if (!parsed.success) return jsonErr("داده نامعتبر", 400);

    const license = await getLicense(parsed.data.licenseKey, parsed.data.deviceId);
    if (!license) return jsonErr("غیرمجاز یا پشتیبانی غیرفعال", 403);

    const kind = parsed.data.peerId ? "direct" : parsed.data.kind || "support";
    if (kind === "direct") {
      if (!parsed.data.peerId) return jsonErr("peerId لازم است", 400);
      const peer = await prisma.license.findUnique({ where: { id: parsed.data.peerId } });
      if (!peer || !peer.active) return jsonErr("همکار یافت نشد", 404);
    }

    const msg = await prisma.chatMessage.create({
      data: {
        licenseId: license.id,
        sender: "user",
        body: parsed.data.body.trim(),
        kind,
        peerId: kind === "direct" ? parsed.data.peerId! : null,
        readByUser: true,
        readByAdmin: false,
      },
    });

    return jsonOk({
      message: {
        id: msg.id,
        sender: msg.sender,
        body: msg.body,
        kind: msg.kind,
        peerId: msg.peerId,
        createdAt: msg.createdAt,
        mine: true,
      },
    });
  } catch (e) {
    console.error(e);
    return jsonErr("خطا", 500);
  }
}

export async function DELETE(req: Request) {
  try {
    const parsed = authSchema
      .extend({ peerId: z.string().optional().nullable() })
      .safeParse(await req.json());
    if (!parsed.success) return jsonErr("داده نامعتبر", 400);
    const license = await getLicense(parsed.data.licenseKey, parsed.data.deviceId);
    if (!license) return jsonErr("غیرمجاز", 403);

    if (parsed.data.peerId) {
      await prisma.chatMessage.deleteMany({
        where: {
          kind: "direct",
          OR: [
            { licenseId: license.id, peerId: parsed.data.peerId },
            { licenseId: parsed.data.peerId, peerId: license.id },
          ],
        },
      });
    } else {
      await prisma.chatMessage.deleteMany({
        where: { licenseId: license.id, kind: "support" },
      });
    }
    return jsonOk({ cleared: true });
  } catch (e) {
    console.error(e);
    return jsonErr("خطا", 500);
  }
}
