import { isAdminAuthenticated } from "@/lib/auth";
import { jsonErr, jsonOk } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import {
  bazaarFetch,
  commitRelease,
  createRelease,
  getBazaarConfig,
  lastUncommitted,
  uploadPackage,
} from "@/lib/bazaar";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET() {
  if (!(await isAdminAuthenticated())) return jsonErr("غیرمجاز", 401);
  const cfg = await getBazaarConfig();
  return jsonOk({
    config: {
      packageName: cfg.packageName,
      apiKeyHeader: cfg.apiKeyHeader,
      baseUrl: cfg.baseUrl,
      appId: cfg.appId,
      hasToken: !!cfg.apiKeyValue,
    },
  });
}

export async function PUT(req: Request) {
  if (!(await isAdminAuthenticated())) return jsonErr("غیرمجاز", 401);
  try {
    const body = z
      .object({
        packageName: z.string().min(3).optional(),
        apiKeyHeader: z.string().min(1).optional(),
        apiKeyValue: z.string().optional(),
        baseUrl: z.string().url().optional(),
        appId: z.string().nullable().optional(),
      })
      .parse(await req.json());

    const data: Record<string, unknown> = {};
    if (body.packageName !== undefined) data.packageName = body.packageName;
    if (body.apiKeyHeader !== undefined) data.apiKeyHeader = body.apiKeyHeader;
    if (body.apiKeyValue !== undefined && body.apiKeyValue !== "")
      data.apiKeyValue = body.apiKeyValue;
    if (body.baseUrl !== undefined) data.baseUrl = body.baseUrl;
    if (body.appId !== undefined) data.appId = body.appId;

    await prisma.bazaarConfig.upsert({
      where: { id: 1 },
      create: { id: 1, ...data } as any,
      update: data,
    });
    return jsonOk({ saved: true });
  } catch (e) {
    console.error(e);
    return jsonErr("ذخیره ناموفق", 400);
  }
}

export async function POST(req: Request) {
  if (!(await isAdminAuthenticated())) return jsonErr("غیرمجاز", 401);
  try {
    const contentType = req.headers.get("content-type") || "";

    // آپلود فایل بسته (multipart)
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("apk") as File | null;
      const architecture = String(form.get("architecture") || "all");
      if (!file) return jsonErr("فایل APK/AAB لازم است", 400);
      const buf = Buffer.from(await file.arrayBuffer());
      const r = await uploadPackage(buf, file.name, architecture);
      return jsonOk({
        upload: r.data,
        status: r.status,
        ok: r.ok,
        message: r.ok
          ? "بسته افزوده شد"
          : r.data?.message || r.data?.error || "آپلود ناموفق",
      });
    }

    const body = await req.json();
    const action = body.action as string;

    if (action === "test") {
      const r = await lastUncommitted();
      return jsonOk({
        connected: r.status > 0,
        status: r.status,
        hint: r.ok
          ? "اتصال برقرار است"
          : r.status === 401 || r.status === 403
          ? "توکن نامعتبر — CAFEBAZAAR-PISHKHAN-API-SECRET را از پیشخان بگیرید"
          : r.data?.error || r.data?.message || `HTTP ${r.status}`,
        data: r.data,
      });
    }

    if (action === "create_release") {
      const r = await createRelease();
      return jsonOk({
        ok: r.ok,
        status: r.status,
        data: r.data,
        message: r.ok ? "رهانش ایجاد شد" : r.data?.message || "خطا در ایجاد رهانش",
      });
    }

    if (action === "last_uncommitted") {
      const r = await lastUncommitted();
      return jsonOk({
        ok: r.ok,
        status: r.status,
        data: r.data,
        hasDraft: r.data?.type !== "not-exists",
      });
    }

    if (action === "commit") {
      const r = await commitRelease({
        changelog_fa: body.changelog_fa,
        changelog_en: body.changelog_en,
        developer_note: body.developer_note,
        staged_rollout_percentage: body.staged_rollout_percentage ?? 100,
        auto_publish: body.auto_publish ?? false,
      });
      // به‌روزرسانی وضعیت نسخه‌های ready/uploaded
      if (r.ok) {
        await prisma.appVersion.updateMany({
          where: { status: { in: ["ready", "uploaded"] } },
          data: { status: "in_review" },
        });
      }
      return jsonOk({
        ok: r.ok,
        status: r.status,
        data: r.data,
        message: r.ok ? "درخواست بررسی ارسال شد" : r.data?.message || "خطا در commit",
      });
    }

    if (action === "proxy") {
      const path = body.path as string;
      if (!path?.startsWith("/")) return jsonErr("path باید با / شروع شود", 400);
      const r = await bazaarFetch(path, {
        method: body.method || "GET",
        body: body.body ? JSON.stringify(body.body) : undefined,
      });
      return jsonOk({ status: r.status, ok: r.ok, data: r.data });
    }

    return jsonErr("action نامعتبر", 400);
  } catch (e) {
    console.error(e);
    return jsonErr("خطا: " + (e as Error).message, 500);
  }
}
