import { prisma } from "@/lib/prisma";
import { jsonErr, jsonOk } from "@/lib/api";
import { z } from "zod";

export const runtime = "nodejs";

/** لیست همکاران فعال برای چت */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const licenseKey = url.searchParams.get("licenseKey") || "";
    const deviceId = url.searchParams.get("deviceId") || "";
    if (licenseKey.length < 8 || deviceId.length < 4) return jsonErr("داده نامعتبر", 400);

    const me = await prisma.license.findUnique({ where: { licenseKey } });
    if (!me || me.deviceId !== deviceId || !me.active || !me.canSupport) {
      return jsonErr("غیرمجاز", 403);
    }

    const peers = await prisma.license.findMany({
      where: { active: true, id: { not: me.id } },
      select: {
        id: true,
        username: true,
        adminNote: true,
        deviceModel: true,
        lastSeenAt: true,
      },
      orderBy: { username: "asc" },
      take: 200,
    });

    return jsonOk({
      peers: peers.map((p) => ({
        id: p.id,
        name: p.username || p.adminNote || p.deviceModel || "همکار",
        lastSeenAt: p.lastSeenAt,
      })),
    });
  } catch (e) {
    console.error(e);
    return jsonErr("خطا", 500);
  }
}
