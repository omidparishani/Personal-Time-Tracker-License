/**
 * کلاینت API پیشخان بازار (نسخه رسمی v1)
 * Base: https://api.pishkhan.cafebazaar.ir/v1
 * Header: CAFEBAZAAR-PISHKHAN-API-SECRET
 *
 * قابلیت‌ها:
 * - ایجاد رهانش
 * - افزودن بسته (آپلود APK/AAB + معماری)
 * - commit رهانش
 * - بررسی رهانش ناتمام
 *
 * مرجع: https://developers.cafebazaar.ir/fa/guidelines/feature/pishkhan-api
 * و github.com/matinzd/cafebazaar-release
 */
import { prisma } from "@/lib/prisma";

export type BazaarCfg = {
  packageName: string;
  apiKeyHeader: string;
  apiKeyValue: string;
  baseUrl: string;
  appId: string | null;
};

const DEFAULT_BASE = "https://api.pishkhan.cafebazaar.ir/v1";
const DEFAULT_HEADER = "CAFEBAZAAR-PISHKHAN-API-SECRET";

export async function getBazaarConfig(): Promise<BazaarCfg> {
  let row = await prisma.bazaarConfig.findUnique({ where: { id: 1 } });
  if (!row) {
    row = await prisma.bazaarConfig.create({
      data: {
        id: 1,
        baseUrl: DEFAULT_BASE,
        apiKeyHeader: DEFAULT_HEADER,
        packageName: "com.personal.timetracker",
      },
    });
  }
  return {
    packageName: row.packageName,
    apiKeyHeader: row.apiKeyHeader || DEFAULT_HEADER,
    apiKeyValue: row.apiKeyValue,
    baseUrl: (row.baseUrl || DEFAULT_BASE).replace(/\/$/, ""),
    appId: row.appId,
  };
}

export async function bazaarFetch(
  path: string,
  init: RequestInit = {}
): Promise<{ ok: boolean; status: number; data: any; raw: string }> {
  const cfg = await getBazaarConfig();
  if (!cfg.apiKeyValue) {
    return {
      ok: false,
      status: 0,
      data: { error: "توکن API پیشخان تنظیم نشده — از پیشخان → API بگیرید" },
      raw: "",
    };
  }
  const url = path.startsWith("http") ? path : `${cfg.baseUrl}${path}`;
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(init.headers as Record<string, string>),
  };
  // هدر رسمی API پیشخان
  headers[cfg.apiKeyHeader || DEFAULT_HEADER] = cfg.apiKeyValue;
  if (!headers["Content-Type"] && init.body && typeof init.body === "string") {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(url, { ...init, headers, cache: "no-store" });
  const raw = await res.text();
  let data: any = null;
  try {
    data = JSON.parse(raw);
  } catch {
    data = { raw };
  }
  return { ok: res.ok, status: res.status, data, raw };
}

/** ایجاد رهانش جدید */
export async function createRelease() {
  return bazaarFetch("/apps/releases/", { method: "POST", body: "{}" });
}

/** بررسی رهانش ناتمام (draft) */
export async function lastUncommitted() {
  return bazaarFetch("/apps/releases/last-uncommitted", { method: "GET" });
}

/**
 * افزودن بسته به رهانش فعلی
 * multipart: apk (file) + architecture (all | armeabi-v7a | arm64-v8a)
 */
export async function uploadPackage(
  file: Buffer,
  fileName: string,
  architecture: string = "all"
) {
  const cfg = await getBazaarConfig();
  if (!cfg.apiKeyValue) {
    return {
      ok: false,
      status: 0,
      data: { error: "توکن تنظیم نشده" },
      raw: "",
    };
  }

  const form = new FormData();
  const blob = new Blob([file], {
    type: fileName.endsWith(".aab")
      ? "application/octet-stream"
      : "application/vnd.android.package-archive",
  });
  form.append("apk", blob, fileName);
  form.append("architecture", architecture);

  const url = `${cfg.baseUrl}/apps/releases/upload/`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      [cfg.apiKeyHeader || DEFAULT_HEADER]: cfg.apiKeyValue,
    },
    body: form,
    // @ts-expect-error duplex not in all types
    duplex: "half",
  });
  const raw = await res.text();
  let data: any = null;
  try {
    data = JSON.parse(raw);
  } catch {
    data = { raw };
  }
  return { ok: res.ok, status: res.status, data, raw };
}

/** ارسال رهانش برای بررسی / انتشار */
export async function commitRelease(opts: {
  changelog_fa?: string;
  changelog_en?: string;
  developer_note?: string;
  staged_rollout_percentage?: number;
  auto_publish?: boolean;
}) {
  return bazaarFetch("/apps/releases/commit/", {
    method: "POST",
    body: JSON.stringify({
      changelog_fa: opts.changelog_fa || "",
      changelog_en: opts.changelog_en || "",
      developer_note: opts.developer_note || "",
      staged_rollout_percentage: opts.staged_rollout_percentage ?? 100,
      auto_publish: opts.auto_publish ?? false,
    }),
  });
}

/** پیشنهاد versionCode بعدی طبق قواعد بازار */
export function suggestNextCodes(
  existing: { versionCode: number; architecture: string }[]
): Record<string, number> {
  const byArch: Record<string, number> = {
    ALL: 0,
    "armeabi-v7a": 0,
    "arm64-v8a": 0,
  };
  for (const e of existing) {
    const a = e.architecture || "ALL";
    if (byArch[a] === undefined) byArch[a] = 0;
    byArch[a] = Math.max(byArch[a], e.versionCode);
  }
  const nextAll = byArch.ALL + 1;
  const nextV7 = Math.max(byArch["armeabi-v7a"] + 1, nextAll + 1);
  const nextV8 = Math.max(byArch["arm64-v8a"] + 1, nextV7 + 1);
  return {
    ALL: nextAll,
    "armeabi-v7a": nextV7,
    "arm64-v8a": nextV8,
  };
}
