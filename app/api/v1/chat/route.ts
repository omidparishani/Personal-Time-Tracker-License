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

    const mode = url.searchParams.get("mode") || "messages"; // conversations | messages
    const peerId = url.searchParams.get("peerId");
    const kind = url.searchParams.get("kind") || (peerId ? "direct" : "support");

    if (mode === "conversations") {
      // لیست گفتگوها: پشتیبانی + هر peer با آخرین پیام
      const supportLast = await prisma.chatMessage.findFirst({
        where: { licenseId: license.id, kind: "support" },
        orderBy: { createdAt: "desc" },
      });
      const supportUnread = await prisma.chatMessage.count({
        where: {
          licenseId: license.id,
          kind: "support",
          sender: "admin",
          readByUser: false,
        },
      });
      const broadcastLast = await prisma.chatMessage.findFirst({
        where: { kind: "broadcast" },
        orderBy: { createdAt: "desc" },
      });

      // peers from messages
      const directMsgs = await prisma.chatMessage.findMany({
        where: {
          kind: "direct",
          OR: [{ licenseId: license.id }, { peerId: license.id }],
        },
        orderBy: { createdAt: "desc" },
        take: 500,
      });
      const peerMap = new Map<string, { last: string; lastAt: Date; unread: number }>();
      for (const m of directMsgs) {
        const other =
          m.licenseId === license.id ? m.peerId || "" : m.licenseId;
        if (!other) continue;
        if (!peerMap.has(other)) {
          peerMap.set(other, {
            last: m.body,
            lastAt: m.createdAt,
            unread: 0,
          });
        }
        if (
          m.licenseId !== license.id &&
          !m.readByUser
        ) {
          const cur = peerMap.get(other)!;
          cur.unread += 1;
        }
      }
      const peerIds = [...peerMap.keys()];
      const peers = peerIds.length
        ? await prisma.license.findMany({
            where: { id: { in: peerIds } },
            select: { id: true, username: true, adminNote: true, deviceModel: true },
          })
        : [];
      const peerName = (id: string) => {
        const p = peers.find((x) => x.id === id);
        return p?.username || p?.adminNote || p?.deviceModel || "همکار";
      };

      const conversations = [
        {
          id: "support",
          type: "support",
          title: "پشتیبانی",
          lastMessage: supportLast?.body || broadcastLast?.body || null,
          lastAt: supportLast?.createdAt || broadcastLast?.createdAt || null,
          unread: supportUnread,
        },
        ...[...peerMap.entries()].map(([id, v]) => ({
          id,
          type: "direct",
          title: peerName(id),
          lastMessage: v.last,
          lastAt: v.lastAt,
          unread: v.unread,
        })),
      ].sort((a, b) => {
        const ta = a.lastAt ? new Date(a.lastAt).getTime() : 0;
        const tb = b.lastAt ? new Date(b.lastAt).getTime() : 0;
        return tb - ta;
      });

      return jsonOk({ conversations, myId: license.id });
    }

    // messages in a thread
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
        take: 400,
      });
      await prisma.chatMessage.updateMany({
        where: {
          kind: "direct",
          licenseId: peerId,
          peerId: license.id,
          readByUser: false,
        },
        data: { readByUser: true },
      });
    } else {
      messages = await prisma.chatMessage.findMany({
        where: {
          OR: [
            { licenseId: license.id, kind: "support" },
            { kind: "broadcast" },
          ],
        },
        orderBy: { createdAt: "asc" },
        take: 400,
      });
      await prisma.chatMessage.updateMany({
        where: {
          OR: [
            { licenseId: license.id, kind: "support", sender: "admin", readByUser: false },
            { kind: "broadcast", readByUser: false },
          ],
        },
        data: { readByUser: true },
      });
    }

    return jsonOk({
      myId: license.id,
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
    if (!license) return jsonErr("غیرمجاز", 403);

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

/** حذف: messageId | peerId (گفتگو) | all=true */
export async function DELETE(req: Request) {
  try {
    const body = await req.json();
    const parsed = authSchema
      .extend({
        messageId: z.string().optional(),
        peerId: z.string().optional().nullable(),
        all: z.boolean().optional(),
        kind: z.string().optional(),
      })
      .safeParse(body);
    if (!parsed.success) return jsonErr("داده نامعتبر", 400);
    const license = await getLicense(parsed.data.licenseKey, parsed.data.deviceId);
    if (!license) return jsonErr("غیرمجاز", 403);

    if (parsed.data.messageId) {
      const msg = await prisma.chatMessage.findUnique({ where: { id: parsed.data.messageId } });
      if (!msg) return jsonErr("پیام یافت نشد", 404);
      // فقط پیام خود کاربر یا پیام‌های گفتگوی خودش
      const can =
        msg.licenseId === license.id ||
        msg.peerId === license.id ||
        (msg.kind === "support" && msg.licenseId === license.id);
      if (!can) return jsonErr("اجازه ندارید", 403);
      await prisma.chatMessage.delete({ where: { id: msg.id } });
      return jsonOk({ deleted: true });
    }

    if (parsed.data.all) {
      await prisma.chatMessage.deleteMany({
        where: {
          OR: [
            { licenseId: license.id },
            { peerId: license.id },
          ],
        },
      });
      return jsonOk({ cleared: true });
    }

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
      return jsonOk({ cleared: true });
    }

    // clear support thread
    await prisma.chatMessage.deleteMany({
      where: { licenseId: license.id, kind: "support" },
    });
    return jsonOk({ cleared: true });
  } catch (e) {
    console.error(e);
    return jsonErr("خطا", 500);
  }
}
