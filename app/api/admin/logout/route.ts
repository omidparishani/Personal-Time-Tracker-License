import { ADMIN_COOKIE } from "@/lib/auth";
import { jsonOk } from "@/lib/api";
import { cookies } from "next/headers";

export const runtime = "nodejs";

export async function POST() {
  const jar = await cookies();
  jar.set(ADMIN_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return jsonOk({ message: "خروج" });
}
