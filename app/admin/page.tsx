"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type LicenseBrief = {
  id: string;
  active: boolean;
  username: string | null;
  deviceModel: string | null;
  deviceId: string;
  activatedAt: string;
  lastSeenAt: string;
};

type CodeRow = {
  id: string;
  code: string;
  maxUses: number;
  usedCount: number;
  note: string | null;
  enabled: boolean;
  createdAt: string;
  expiresAt: string | null;
  _count: { licenses: number };
  licenses: LicenseBrief[];
};

type LicenseRow = {
  id: string;
  licenseKey: string;
  deviceId: string;
  deviceModel: string | null;
  deviceBrand: string | null;
  androidVersion: string | null;
  appVersion: string | null;
  username: string | null;
  active: boolean;
  activatedAt: string;
  lastSeenAt: string;
  disabledReason: string | null;
  adminNote: string | null;
  activationCode: { code: string; note: string | null };
};

function fmt(d: string) {
  try {
    return new Date(d).toLocaleString("fa-IR");
  } catch {
    return d;
  }
}

export default function AdminPage() {
  const router = useRouter();
  const [tab, setTab] = useState<"codes" | "licenses">("codes");
  const [codes, setCodes] = useState<CodeRow[]>([]);
  const [licenses, setLicenses] = useState<LicenseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [genCount, setGenCount] = useState(1);
  const [genNote, setGenNote] = useState("");
  const [genMaxUses, setGenMaxUses] = useState(1);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cRes, lRes] = await Promise.all([
        fetch("/api/admin/codes"),
        fetch("/api/admin/licenses"),
      ]);
      if (cRes.status === 401 || lRes.status === 401) {
        router.push("/login");
        return;
      }
      const cData = await cRes.json();
      const lData = await lRes.json();
      if (cData.ok) setCodes(cData.codes);
      if (lData.ok) setLicenses(lData.licenses);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  async function generateCodes() {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/admin/codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          count: genCount,
          maxUses: genMaxUses,
          note: genNote || undefined,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setMsg(data.error || "خطا");
        return;
      }
      setMsg(`کدهای ساخته‌شده: ${(data.codes as string[]).join(" ، ")}`);
      setGenNote("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function toggleCode(id: string, enabled: boolean) {
    await fetch("/api/admin/codes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, enabled }),
    });
    await load();
  }

  async function toggleLicense(id: string, active: boolean) {
    const reason = active
      ? undefined
      : window.prompt("دلیل غیرفعال‌سازی (اختیاری):") || "غیرفعال توسط مدیر";
    await fetch("/api/admin/licenses", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, active, disabledReason: reason }),
    });
    await load();
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/login");
  }

  function copy(text: string) {
    navigator.clipboard.writeText(text);
    setMsg(`کپی شد: ${text}`);
  }

  const activeCount = licenses.filter((l) => l.active).length;
  const disabledCount = licenses.filter((l) => !l.active).length;
  const unusedCodes = codes.filter((c) => c.usedCount === 0 && c.enabled).length;

  return (
    <div className="min-h-screen">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-bold text-slate-800">مدیریت لایسنس PTT</h1>
            <p className="text-xs text-slate-500">صدور کد · کنترل دستگاه · غیرفعال‌سازی</p>
          </div>
          <button
            onClick={logout}
            className="text-sm px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50"
          >
            خروج
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "کدهای استفاده‌نشده", value: unusedCodes, color: "text-brand-600" },
            { label: "کل کدها", value: codes.length, color: "text-slate-700" },
            { label: "لایسنس فعال", value: activeCount, color: "text-emerald-600" },
            { label: "غیرفعال", value: disabledCount, color: "text-red-600" },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm">
              <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-xs text-slate-500 mt-1">{s.label}</div>
            </div>
          ))}
        </div>

        {msg && (
          <div className="bg-brand-50 text-brand-700 text-sm rounded-xl px-4 py-3 border border-brand-100">
            {msg}
          </div>
        )}

        {/* Generate */}
        <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <h2 className="font-semibold text-slate-800 mb-4">صدور کد فعال‌سازی</h2>
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="text-xs text-slate-500 block mb-1">تعداد</label>
              <input
                type="number"
                min={1}
                max={50}
                value={genCount}
                onChange={(e) => setGenCount(Number(e.target.value) || 1)}
                className="w-24 rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">حداکثر دستگاه</label>
              <input
                type="number"
                min={1}
                max={20}
                value={genMaxUses}
                onChange={(e) => setGenMaxUses(Number(e.target.value) || 1)}
                className="w-24 rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
            <div className="flex-1 min-w-[180px]">
              <label className="text-xs text-slate-500 block mb-1">یادداشت (نام همکار)</label>
              <input
                value={genNote}
                onChange={(e) => setGenNote(e.target.value)}
                placeholder="مثلاً: علی احمدی"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
            <button
              onClick={generateCodes}
              disabled={busy}
              className="rounded-xl bg-brand-500 hover:bg-brand-600 text-white px-5 py-2.5 text-sm font-medium disabled:opacity-60"
            >
              {busy ? "…" : "ساخت کد"}
            </button>
          </div>
        </section>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-slate-200">
          {(
            [
              ["codes", "کدها"],
              ["licenses", "لایسنس‌ها / دستگاه‌ها"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition ${
                tab === k
                  ? "border-brand-500 text-brand-600"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {label}
            </button>
          ))}
          <button
            onClick={load}
            className="mr-auto text-xs text-slate-500 hover:text-brand-600 px-2"
          >
            ↻ بروزرسانی
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-slate-500 py-8 text-center">در حال بارگذاری…</p>
        ) : tab === "codes" ? (
          <div className="space-y-3">
            {codes.length === 0 && (
              <p className="text-sm text-slate-500 text-center py-8">هنوز کدی ساخته نشده</p>
            )}
            {codes.map((c) => (
              <div
                key={c.id}
                className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-center gap-3 justify-between">
                  <div>
                    <button
                      onClick={() => copy(c.code)}
                      className="font-mono text-base font-bold text-brand-600 hover:underline tracking-wide"
                      title="کپی"
                    >
                      {c.code}
                    </button>
                    <div className="text-xs text-slate-500 mt-1">
                      {c.note && <span className="ml-2">یادداشت: {c.note}</span>}
                      <span>
                        استفاده: {c.usedCount}/{c.maxUses}
                      </span>
                      <span className="mx-2">·</span>
                      <span>{fmt(c.createdAt)}</span>
                      {!c.enabled && (
                        <span className="mr-2 text-red-600 font-medium">غیرفعال</span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => toggleCode(c.id, !c.enabled)}
                    className={`text-xs px-3 py-1.5 rounded-lg border ${
                      c.enabled
                        ? "border-red-200 text-red-600 hover:bg-red-50"
                        : "border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                    }`}
                  >
                    {c.enabled ? "غیرفعال کردن کد" : "فعال کردن کد"}
                  </button>
                </div>
                {c.licenses.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-slate-50 space-y-1">
                    {c.licenses.map((l) => (
                      <div key={l.id} className="text-xs text-slate-600 flex gap-2 flex-wrap">
                        <span className={l.active ? "text-emerald-600" : "text-red-500"}>
                          {l.active ? "● فعال" : "● قطع"}
                        </span>
                        <span>{l.username || "—"}</span>
                        <span className="text-slate-400">{l.deviceModel || l.deviceId.slice(0, 12)}</span>
                        <span className="text-slate-400">آخرین بازدید: {fmt(l.lastSeenAt)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto bg-white rounded-xl border border-slate-100 shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600 text-xs">
                <tr>
                  <th className="text-right px-4 py-3 font-medium">کاربر / دستگاه</th>
                  <th className="text-right px-4 py-3 font-medium">کد</th>
                  <th className="text-right px-4 py-3 font-medium">وضعیت</th>
                  <th className="text-right px-4 py-3 font-medium">آخرین بازدید</th>
                  <th className="text-right px-4 py-3 font-medium">عملیات</th>
                </tr>
              </thead>
              <tbody>
                {licenses.map((l) => (
                  <tr key={l.id} className="border-t border-slate-50">
                    <td className="px-4 py-3">
                      <div className="font-medium">{l.username || "بدون نام"}</div>
                      <div className="text-xs text-slate-400">
                        {[l.deviceBrand, l.deviceModel].filter(Boolean).join(" ") || l.deviceId}
                        {l.androidVersion ? ` · Android ${l.androidVersion}` : ""}
                        {l.appVersion ? ` · v${l.appVersion}` : ""}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{l.activationCode.code}</td>
                    <td className="px-4 py-3">
                      {l.active ? (
                        <span className="text-emerald-600 text-xs font-medium">فعال</span>
                      ) : (
                        <span className="text-red-600 text-xs font-medium">
                          غیرفعال
                          {l.disabledReason ? ` — ${l.disabledReason}` : ""}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{fmt(l.lastSeenAt)}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggleLicense(l.id, !l.active)}
                        className={`text-xs px-3 py-1.5 rounded-lg border ${
                          l.active
                            ? "border-red-200 text-red-600 hover:bg-red-50"
                            : "border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                        }`}
                      >
                        {l.active ? "قطع دسترسی" : "فعال‌سازی مجدد"}
                      </button>
                    </td>
                  </tr>
                ))}
                {licenses.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                      هنوز فعالی ثبت نشده
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
