import { prisma } from "@/lib/prisma";
import { jsonErr, jsonOk } from "@/lib/api";
import { isAdminAuthenticated } from "@/lib/auth";
import { z } from "zod";

export const runtime = "nodejs";

export async function GET(req: Request) {
  if (!(await isAdminAuthenticated())) return jsonErr("غیرمجاز", 401);

  const url = new URL(req.url);
  const licenseId = url.searchParams.get("licenseId");
  const view = url.searchParams.get("view"); // support | direct | all

  if (view === "direct") {
    // همه گفتگوهای peer-to-peer
    const msgs = await prisma.chatMessage.findMany({
      where: { kind: "direct" },
      orderBy: { createdAt: "desc" },
      take: 1000,
      include: {
        license: { select: { id: true, username: true, adminNote: true, licenseKey: true } },
      },
    });
    // group by pair
    const pairs = new Map<string, { a: string; b: string; last: string; lastAt: Date; count: number }>();
    for (const m of msgs) {
      const a = m.licenseId;
      const b = m.peerId || "";
      if (!b) continue;
      const key = [a, b].sort().join(":");
      if (!pairs.has(key)) {
        pairs.set(key, {
          a,
          b,
          last: m.body,
          lastAt: m.createdAt,
          count: 1,
        });
      } else {
        pairs.get(key)!.count += 1;
      }
    }
    const ids = [...new Set([...pairs.values()].flatMap((p) => [p.a, p.b]))];
    const licenses = await prisma.license.findMany({
      where: { id: { in: ids } },
      select: { id: true, username: true, adminNote: true, licenseKey: true },
    });
    const name = (id: string) => {
      const l = licenses.find((x) => x.id === id);
      return l?.username || l?.adminNote || l?.licenseKey?.slice(0, 8) || id;
    };
    return jsonOk({
      directThreads: [...pairs.entries()].map(([key, v]) => ({
        id: key,
        userA: { id: v.a, name: name(v.a) },
        userB: { id: v.b, name: name(v.b) },
        lastMessage: v.last,
        lastAt: v.lastAt,
        count: v.count,
      })),
    });
  }

  if (licenseId) {
    const pair = url.searchParams.get("peerId");
    let messages;
    if (pair) {
      messages = await prisma.chatMessage.findMany({
        where: {
          kind: "direct",
          OR: [
            { licenseId, peerId: pair },
            { licenseId: pair, peerId: licenseId },
          ],
        },
        orderBy: { createdAt: "asc" },
        take: 500,
      });
    } else {
      messages = await prisma.chatMessage.findMany({
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
    }
    return jsonOk({ messages });
  }

  const licenses = await prisma.license.findMany({
    where: { active: true },
    select: {
      id: true,
      username: true,
      adminNote: true,
      licenseKey: true,
      deviceModel: true,
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
      licenseId: l.id,
      username: l.username,
      deviceModel: l.deviceModel,
      name: l.username || l.adminNote || l.licenseKey.slice(0, 8),
      lastMessage: l.messages[0]?.body || null,
      lastAt: l.messages[0]?.createdAt || null,
      unread: l._count.messages,
    })),
  });
}

export async function POST(req: Request) {
  if (!(await isAdminAuthenticated())) return jsonErr("غیرمجاز", 401);
  const body = await req.json();
  const schema = z.object({
    body: z.string().min(1).max(4000),
    licenseId: z.string().optional(),
    broadcast: z.boolean().optional(),
  });
  const parsed = schema.safeParse(body);
  if (!parsed.success) return jsonErr("داده نامعتبر", 400);

  if (parsed.data.broadcast) {
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
  if (!(await isAdminAuthenticated())) return jsonErr("غیرمجاز", 401);
  const body = await req.json();
  if (body.messageId) {
    await prisma.chatMessage.delete({ where: { id: body.messageId } });
    return jsonOk({ deleted: true });
  }
  if (body.all) {
    await prisma.chatMessage.deleteMany({});
    return jsonOk({ cleared: true });
  }
  if (body.licenseId && body.peerId) {
    await prisma.chatMessage.deleteMany({
      where: {
        kind: "direct",
        OR: [
          { licenseId: body.licenseId, peerId: body.peerId },
          { licenseId: body.peerId, peerId: body.licenseId },
        ],
      },
    });
    return jsonOk({ cleared: true });
  }
  if (body.licenseId) {
    await prisma.chatMessage.deleteMany({
      where: { licenseId: body.licenseId, kind: "support" },
    });
    return jsonOk({ cleared: true });
  }
  return jsonErr("پارامتر نامعتبر", 400);
}


export async function PATCH(req: Request) {
  if (!(await isAdminAuthenticated())) return jsonErr("غیرمجاز", 401);
  try {
    const body = await req.json();
    const id = body?.id as string | undefined;
    const text = body?.body as string | undefined;
    if (!id || !text?.trim()) return jsonErr("id و body لازم است", 400);
    const msg = await prisma.chatMessage.update({
      where: { id },
      data: { body: text.trim() },
    });
    return jsonOk({ message: msg });
  } catch {
    return jsonErr("ویرایش ناموفق", 400);
  }
}
