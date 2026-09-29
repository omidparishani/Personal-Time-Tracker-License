import { checkAdminPassword, createAdminSession, ADMIN_COOKIE } from "@/lib/auth";
import { jsonErr, jsonOk, clientIp } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { password } = await req.json();
    if (!password || !checkAdminPassword(String(password))) {
      return jsonErr("رمز اشتباه است", 401);
    }
    const token = await createAdminSession();
    const jar = await cookies();
    jar.set(ADMIN_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
    await prisma.auditLog.create({
      data: { action: "admin_login", ip: clientIp(req) },
    });
    return jsonOk({ message: "ورود موفق" });
  } catch {
    return jsonErr("خطا", 500);
  }
}
