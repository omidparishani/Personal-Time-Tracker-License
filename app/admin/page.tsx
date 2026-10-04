"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Shift = {
  id: string;
  name: string;
  description: string | null;
  startWorkTime: string;
  endWorkTime: string;
  flexibleMinutes: number;
  minimumWorkMinutes: number;
  weeklyRequiredMinutes: number;
  thursdayWorking: boolean;
  thursdayMinutes: number;
  holidaysJson: string;
  enabled: boolean;
  _count?: { licenses: number };
};

type LicenseRow = {
  id: string;
  licenseKey: string;
  deviceModel: string | null;
  deviceBrand: string | null;
  username: string | null;
  active: boolean;
  lastSeenAt: string;
  canJira: boolean;
  canAttendance: boolean;
  canReports: boolean;
  canSupport: boolean;
  shiftId: string | null;
  shift: Shift | null;
  activationCode: { code: string; note: string | null };
};

type CodeRow = {
  id: string;
  code: string;
  maxUses: number;
  usedCount: number;
  note: string | null;
  enabled: boolean;
  createdAt: string;
};

type ChatThread = {
  licenseId: string;
  username: string | null;
  deviceModel: string | null;
  unread: number;
};

type ChatMsg = { id: string; sender: string; body: string; createdAt: string };

function fmt(d: string) {
  try {
    return new Date(d).toLocaleString("fa-IR");
  } catch {
    return d;
  }
}

const emptyShiftForm = {
  name: "",
  description: "",
  startWorkTime: "09:00",
  endWorkTime: "17:00",
  flexibleMinutes: 120,
  minimumWorkMinutes: 480,
  weeklyRequiredMinutes: 2400,
  thursdayWorking: false,
  thursdayMinutes: 300,
  holidays: "",
};

export default function AdminPage() {
  const router = useRouter();
  const [tab, setTab] = useState<"codes" | "shifts" | "users" | "chat" | "direct" | "holidays">("shifts");
  const [codes, setCodes] = useState<CodeRow[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [licenses, setLicenses] = useState<LicenseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [genCount, setGenCount] = useState(1);
  const [genNote, setGenNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [shiftForm, setShiftForm] = useState(emptyShiftForm);
  const [editingShiftId, setEditingShiftId] = useState<string | null>(null);
  const [editUserId, setEditUserId] = useState<string | null>(null);
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [chatLicenseId, setChatLicenseId] = useState<string | null>(null);
  const [chatMsgs, setChatMsgs] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [broadcastText, setBroadcastText] = useState("");
  const [directThreads, setDirectThreads] = useState<any[]>([]);
  const [holidaysList, setHolidaysList] = useState<any[]>([]);
  const [holidayYear, setHolidayYear] = useState(1404);
  const [holidayEndpoint, setHolidayEndpoint] = useState(
    "https://raw.githubusercontent.com/hasan-ahani/shamsi-holidays/main/holidays"
  );





  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cRes, sRes, lRes, chRes] = await Promise.all([
        fetch("/api/admin/codes"),
        fetch("/api/admin/shifts"),
        fetch("/api/admin/licenses"),
        fetch("/api/admin/chat"),
      ]);
      if ([cRes, sRes, lRes].some((r) => r.status === 401)) {
        router.push("/login");
        return;
      }
      const c = await cRes.json();
      const s = await sRes.json();
      const l = await lRes.json();
      const ch = await chRes.json();
      if (c.ok) setCodes(c.codes);
      if (s.ok) setShifts(s.shifts);
      if (l.ok) setLicenses(l.licenses);
      if (ch.ok) setThreads(ch.threads || []);
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
        body: JSON.stringify({ count: genCount, maxUses: 1, note: genNote || undefined }),
      });
      const data = await res.json();
      if (!data.ok) {
        setMsg(data.error || "خطا");
        return;
      }
      setMsg("کدها: " + (data.codes as string[]).join(" ، "));
      setGenNote("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function saveShift() {
    if (!shiftForm.name.trim()) {
      setMsg("نام شیفت لازم است");
      return;
    }
    setBusy(true);
    try {
      const holidaysArr = shiftForm.holidays
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const payload = {
        name: shiftForm.name.trim(),
        description: shiftForm.description || undefined,
        startWorkTime: shiftForm.startWorkTime,
        endWorkTime: shiftForm.endWorkTime,
        flexibleMinutes: Number(shiftForm.flexibleMinutes),
        minimumWorkMinutes: Number(shiftForm.minimumWorkMinutes),
        weeklyRequiredMinutes: Number(shiftForm.weeklyRequiredMinutes),
        thursdayWorking: shiftForm.thursdayWorking,
        thursdayMinutes: Number(shiftForm.thursdayMinutes),
        holidaysJson: JSON.stringify(holidaysArr),
      };
      const res = await fetch("/api/admin/shifts", {
        method: editingShiftId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingShiftId ? { id: editingShiftId, ...payload } : payload),
      });
      const data = await res.json();
      if (!data.ok) {
        setMsg(data.error || "خطا");
        return;
      }
      setMsg(editingShiftId ? "شیفت به‌روز شد" : "شیفت ساخته شد");
      setShiftForm(emptyShiftForm);
      setEditingShiftId(null);
      await load();
    } finally {
      setBusy(false);
    }
  }

  function startEditShift(s: Shift) {
    setEditingShiftId(s.id);
    let holidays = "";
    try {
      holidays = JSON.parse(s.holidaysJson || "[]").join(",");
    } catch {}
    setShiftForm({
      name: s.name,
      description: s.description || "",
      startWorkTime: s.startWorkTime,
      endWorkTime: s.endWorkTime,
      flexibleMinutes: s.flexibleMinutes,
      minimumWorkMinutes: s.minimumWorkMinutes,
      weeklyRequiredMinutes: s.weeklyRequiredMinutes,
      thursdayWorking: s.thursdayWorking,
      thursdayMinutes: s.thursdayMinutes,
      holidays,
    });
    setTab("shifts");
  }

  async function deleteShift(id: string) {
    if (!confirm("حذف این شیفت؟ کارمندان از آن جدا می‌شوند.")) return;
    await fetch("/api/admin/shifts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    await load();
  }

  async function patchLicense(id: string, body: Record<string, unknown>) {
    await fetch("/api/admin/licenses", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...body }),
    });
    await load();
  }

  async function deleteCode(id: string) {
    if (!confirm("این کد حذف شود؟")) return;
    await fetch("/api/admin/codes", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    await load();
  }

  async function patchCode(id: string, body: Record<string, unknown>) {
    await fetch("/api/admin/codes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...body }),
    });
    await load();
  }

  async function deleteLicense(id: string) {

    if (!confirm("این لایسنس برای همیشه حذف شود؟")) return;
    await fetch("/api/admin/licenses", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    await load();
  }

  async function openChat(licenseId: string) {
    setChatLicenseId(licenseId);
    const res = await fetch(`/api/admin/chat?licenseId=${licenseId}`);
    const data = await res.json();
    if (data.ok) setChatMsgs(data.messages);
  }

  async function sendBroadcast() {
    if (!broadcastText.trim()) return;
    await fetch("/api/admin/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ broadcast: true, body: broadcastText.trim() }),
    });
    setBroadcastText("");
    alert("پیام گروهی ارسال شد");
  }

  async function sendChat() {

    if (!chatLicenseId || !chatInput.trim()) return;
    await fetch("/api/admin/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ licenseId: chatLicenseId, body: chatInput.trim() }),
    });
    setChatInput("");
    await openChat(chatLicenseId);
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/login");
  }

  const editUser = licenses.find((l) => l.id === editUserId);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-[#1565C0] text-white sticky top-0 z-10 shadow">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">مدیریت لایسنس PTT</h1>
            <p className="text-xs text-blue-100">شیفت · کاربر · کد · پشتیبانی</p>
          </div>
          <button onClick={logout} className="text-sm px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25">
            خروج
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {msg && (
          <div className="bg-blue-50 text-blue-800 text-sm rounded-xl px-4 py-3 border border-blue-100">
            {msg}
          </div>
        )}

        <div className="flex flex-wrap gap-2 border-b border-slate-200">
          {(
            [
              ["shifts", "شیفت‌ها"],
              ["users", "کارمندان"],
              ["codes", "کد فعال‌سازی"],
              ["chat", "پشتیبانی"],
              ["direct", "گفتگوی کاربران"],
              ["holidays", "تعطیلات رسمی"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px ${
                tab === k ? "border-[#1565C0] text-[#1565C0]" : "border-transparent text-slate-500"
              }`}
            >
              {label}
            </button>
          ))}
          <button onClick={load} className="mr-auto text-xs text-slate-500 px-2">
            ↻
          </button>
        </div>

        {loading ? (
          <p className="text-center text-slate-400 py-8">بارگذاری…</p>
        ) : tab === "shifts" ? (
          <div className="grid md:grid-cols-2 gap-6">
            <section className="bg-white rounded-2xl border shadow-sm p-5 space-y-3">
              <h2 className="font-semibold">{editingShiftId ? "ویرایش شیفت" : "ایجاد شیفت جدید"}</h2>
              <p className="text-xs text-slate-500">
                مثال پنج‌شنبه تعطیل: روزانه ۹:۱۵ ← هفتگی ۲۷۷۵ دقیقه (۵×۵۵۵)، شناوری ۱۲۰. پنج‌شنبه ۵ ساعت: تیک پنج‌شنبه + ۳۰۰ دقیقه.
              </p>
              <input
                className="w-full border rounded-lg px-3 py-2 text-sm"
                placeholder="نام شیفت *"
                value={shiftForm.name}
                onChange={(e) => setShiftForm({ ...shiftForm, name: e.target.value })}
              />
              <input
                className="w-full border rounded-lg px-3 py-2 text-sm"
                placeholder="توضیح"
                value={shiftForm.description}
                onChange={(e) => setShiftForm({ ...shiftForm, description: e.target.value })}
              />
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-slate-500">شروع</label>
                  <input
                    type="time"
                    className="w-full border rounded-lg px-2 py-1.5 text-sm"
                    value={shiftForm.startWorkTime}
                    onChange={(e) => setShiftForm({ ...shiftForm, startWorkTime: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500">پایان</label>
                  <input
                    type="time"
                    className="w-full border rounded-lg px-2 py-1.5 text-sm"
                    value={shiftForm.endWorkTime}
                    onChange={(e) => setShiftForm({ ...shiftForm, endWorkTime: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500">شناوری (دقیقه)</label>
                  <input
                    type="number"
                    className="w-full border rounded-lg px-2 py-1.5 text-sm"
                    value={shiftForm.flexibleMinutes}
                    onChange={(e) =>
                      setShiftForm({ ...shiftForm, flexibleMinutes: Number(e.target.value) })
                    }
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500">حداقل روزانه (دقیقه)</label>
                  <input
                    type="number"
                    className="w-full border rounded-lg px-2 py-1.5 text-sm"
                    value={shiftForm.minimumWorkMinutes}
                    onChange={(e) =>
                      setShiftForm({ ...shiftForm, minimumWorkMinutes: Number(e.target.value) })
                    }
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500">حداقل هفتگی (دقیقه)</label>
                  <input
                    type="number"
                    className="w-full border rounded-lg px-2 py-1.5 text-sm"
                    value={shiftForm.weeklyRequiredMinutes}
                    onChange={(e) =>
                      setShiftForm({ ...shiftForm, weeklyRequiredMinutes: Number(e.target.value) })
                    }
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500">ساعات پنج‌شنبه (دقیقه)</label>
                  <input
                    type="number"
                    className="w-full border rounded-lg px-2 py-1.5 text-sm"
                    value={shiftForm.thursdayMinutes}
                    disabled={!shiftForm.thursdayWorking}
                    onChange={(e) =>
                      setShiftForm({ ...shiftForm, thursdayMinutes: Number(e.target.value) })
                    }
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={shiftForm.thursdayWorking}
                  onChange={(e) => setShiftForm({ ...shiftForm, thursdayWorking: e.target.checked })}
                />
                پنج‌شنبه کاری است
              </label>
              <div>
                <label className="text-xs text-slate-500">تعطیلات (میلادی با کاما)</label>
                <input
                  className="w-full border rounded-lg px-2 py-1.5 text-sm"
                  placeholder="2026-03-20,2026-03-21"
                  value={shiftForm.holidays}
                  onChange={(e) => setShiftForm({ ...shiftForm, holidays: e.target.value })}
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={saveShift}
                  disabled={busy}
                  className="flex-1 rounded-xl bg-[#1565C0] text-white py-2.5 text-sm font-medium disabled:opacity-60"
                >
                  {editingShiftId ? "ذخیره تغییرات" : "ایجاد شیفت"}
                </button>
                {editingShiftId && (
                  <button
                    onClick={() => {
                      setEditingShiftId(null);
                      setShiftForm(emptyShiftForm);
                    }}
                    className="rounded-xl border px-4 text-sm"
                  >
                    انصراف
                  </button>
                )}
              </div>
            </section>

            <section className="space-y-3">
              <h2 className="font-semibold">لیست شیفت‌ها</h2>
              {shifts.length === 0 && (
                <p className="text-sm text-slate-400 bg-white rounded-xl border p-6 text-center">
                  هنوز شیفتی نساخته‌اید
                </p>
              )}
              {shifts.map((s) => (
                <div key={s.id} className="bg-white rounded-xl border p-4 shadow-sm">
                  <div className="flex justify-between gap-2">
                    <div>
                      <div className="font-medium">{s.name}</div>
                      <div className="text-xs text-slate-500 mt-1">
                        {s.startWorkTime}–{s.endWorkTime} · شناوری {s.flexibleMinutes}د
                        {" · "}
                        {s.thursdayWorking ? `پنج‌شنبه ${s.thursdayMinutes}د` : "پنج‌شنبه تعطیل"}
                        {" · "}
                        {s._count?.licenses ?? 0} نفر
                      </div>
                      {s.description && (
                        <div className="text-xs text-slate-400 mt-0.5">{s.description}</div>
                      )}
                    </div>
                    <div className="flex flex-col gap-1">
                      <button
                        onClick={() => startEditShift(s)}
                        className="text-xs px-2 py-1 rounded border text-blue-700"
                      >
                        ویرایش
                      </button>
                      <button
                        onClick={() => deleteShift(s.id)}
                        className="text-xs px-2 py-1 rounded border text-red-600"
                      >
                        حذف
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </section>
          </div>
        ) : tab === "users" ? (
          <div className="space-y-3">
            {licenses.map((l) => (
              <div key={l.id} className="bg-white rounded-xl border p-4 shadow-sm">
                <div className="flex flex-wrap justify-between gap-2 items-start">
                  <div>
                    <div className="font-medium">
                      {l.username || "بدون نام"}{" "}
                      <span className={`text-xs ${l.active ? "text-emerald-600" : "text-red-600"}`}>
                        {l.active ? "فعال" : "قطع"}
                      </span>
                    </div>
                    <div className="text-xs text-slate-400">
                      {[l.deviceBrand, l.deviceModel].filter(Boolean).join(" ")} · کد{" "}
                      {l.activationCode.code}
                    </div>
                    <div className="text-xs text-slate-600 mt-1">
                      شیفت: <strong>{l.shift?.name || "— تعیین نشده —"}</strong>
                      {l.shift && (
                        <span className="text-slate-400">
                          {" "}
                          ({l.shift.startWorkTime}–{l.shift.endWorkTime} · شناوری{" "}
                          {l.shift.flexibleMinutes}د)
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500">
                      Jira {l.canJira ? "✓" : "✗"} · تردد {l.canAttendance ? "✓" : "✗"} · پشتیبانی{" "}
                      {l.canSupport ? "✓" : "✗"}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setEditUserId(l.id)}
                      className="text-xs px-3 py-1.5 rounded-lg border border-blue-200 text-blue-700"
                    >
                      تنظیمات
                    </button>
                    <button
                      onClick={() =>
                        patchLicense(l.id, {
                          active: !l.active,
                          disabledReason: l.active ? "قطع توسط مدیر" : undefined,
                        })
                      }
                      className={`text-xs px-3 py-1.5 rounded-lg border ${
                        l.active ? "border-red-200 text-red-600" : "border-emerald-200 text-emerald-700"
                      }`}
                    >
                      {l.active ? "قطع" : "فعال"}
                    </button>
                    <button
                      onClick={() => deleteLicense(l.id)}
                      className="text-xs px-3 py-1.5 rounded-lg border border-red-300 text-red-700 bg-red-50"
                    >
                      حذف
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {licenses.length === 0 && (
              <p className="text-center text-slate-400 py-8">هنوز کاربری فعال نشده</p>
            )}
          </div>
        ) : tab === "direct" ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-500 mb-2">گفتگوهای مستقیم بین کاربران</p>
            {directThreads.length === 0 && (
              <p className="text-center text-slate-400 py-8">گفتگویی ثبت نشده</p>
            )}
            {directThreads.map((th: any) => (
              <div key={th.id} className="bg-white rounded-xl border p-4 shadow-sm">
                <div className="font-medium text-sm">
                  {th.userA?.name} ↔ {th.userB?.name}
                </div>
                <div className="text-xs text-slate-500 mt-1">{th.lastMessage}</div>
                <div className="text-xs text-slate-400">{th.count} پیام</div>
                <button
                  className="text-xs text-red-600 mt-2"
                  onClick={async () => {
                    if (!confirm("حذف این گفتگو؟")) return;
                    await fetch("/api/admin/chat", {
                      method: "DELETE",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ licenseId: th.userA?.id, peerId: th.userB?.id }),
                    });
                    await load();
                  }}
                >
                  حذف گفتگو
                </button>
              </div>
            ))}
          </div>
        ) : tab === "holidays" ? (
          <div className="space-y-4">
            <section className="bg-white rounded-2xl border p-5 space-y-3">
              <h3 className="font-bold text-sm">همگام‌سازی تعطیلات رسمی</h3>
              <p className="text-xs text-slate-500">
                آدرس پایه یا فایل JSON را وارد کنید. اگر پایه باشد، با سال شمسی ترکیب می‌شود
                (مثلاً .../holidays + /1404.json).
              </p>
              <div>
                <label className="text-xs text-slate-500 block mb-1">آدرس endpoint / URL</label>
                <input
                  value={holidayEndpoint}
                  onChange={(e) => setHolidayEndpoint(e.target.value)}
                  placeholder="https://raw.githubusercontent.com/.../holidays"
                  className="w-full rounded-lg border px-3 py-2 text-sm font-mono"
                  dir="ltr"
                />
              </div>
              <div className="flex gap-2 items-end flex-wrap">
                <div>
                  <label className="text-xs text-slate-500 block mb-1">سال شمسی</label>
                  <input
                    type="number"
                    value={holidayYear}
                    onChange={(e) => setHolidayYear(Number(e.target.value) || 1404)}
                    className="w-28 rounded-lg border px-3 py-2 text-sm"
                  />
                </div>
                <button
                  className="bg-[#1565C0] text-white px-4 py-2 rounded-lg text-sm"
                  onClick={async () => {
                    const res = await fetch("/api/admin/holidays", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        syncYear: holidayYear,
                        endpointUrl: holidayEndpoint.trim() || undefined,
                      }),
                    });
                    const d = await res.json();
                    setMsg(d.ok ? `همگام شد: ${d.added} روز از ${d.source}` : d.error || "خطا");
                    await load();
                  }}
                >
                  دریافت از endpoint
                </button>
                <button
                  className="text-red-600 text-sm border border-red-200 px-3 py-2 rounded-lg"
                  onClick={async () => {
                    if (!confirm("همه تعطیلات پاک شوند؟")) return;
                    await fetch("/api/admin/holidays", {
                      method: "DELETE",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ all: true }),
                    });
                    await load();
                  }}
                >
                  پاک کردن همه
                </button>
              </div>
            </section>
            <div className="space-y-2">
              {holidaysList.map((h: any) => (
                <div key={h.id || h.date} className="bg-white border rounded-xl px-4 py-3 flex justify-between text-sm">
                  <span>{h.date} — {h.title}</span>
                  <button
                    className="text-red-600 text-xs"
                    onClick={async () => {
                      await fetch("/api/admin/holidays", {
                        method: "DELETE",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ id: h.id }),
                      });
                      await load();
                    }}
                  >
                    حذف
                  </button>
                </div>
              ))}
              {holidaysList.length === 0 && (
                <p className="text-center text-slate-400 py-6">تعطیلی ثبت نشده — دریافت از endpoint را بزنید</p>
              )}
            </div>
          </div>
        ) : tab === "codes" ? (
          <div className="space-y-4">
            <section className="bg-white rounded-2xl border p-5 flex flex-wrap gap-3 items-end">
              <div>
                <label className="text-xs text-slate-500 block mb-1">تعداد</label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={genCount}
                  onChange={(e) => setGenCount(Number(e.target.value) || 1)}
                  className="w-24 rounded-lg border px-3 py-2 text-sm"
                />
              </div>
              <div className="flex-1 min-w-[160px]">
                <label className="text-xs text-slate-500 block mb-1">یادداشت</label>
                <input
                  value={genNote}
                  onChange={(e) => setGenNote(e.target.value)}
                  placeholder="نام همکار"
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                />
              </div>
              <button
                onClick={generateCodes}
                disabled={busy}
                className="rounded-xl bg-[#1565C0] text-white px-5 py-2.5 text-sm"
              >
                ساخت کد
              </button>
            </section>
            {codes.map((c) => (
              /* code card */

              <div key={c.id} className="bg-white rounded-xl border p-4 flex justify-between">
                <button
                  className="font-mono font-bold text-[#1565C0]"
                  onClick={() => {
                    navigator.clipboard.writeText(c.code);
                    setMsg("کپی: " + c.code);
                  }}
                >
                  {c.code}
                    <div className="flex flex-wrap gap-2 mt-2">
                      <button
                        className="text-xs px-3 py-1.5 rounded-lg border border-blue-200 text-blue-700 bg-blue-50"
                        onClick={() => {
                          const note = prompt("یادداشت", c.note || "");
                          if (note === null) return;
                          const maxUses = prompt("حداکثر استفاده", String(c.maxUses || 1));
                          if (maxUses === null) return;
                          const codeVal = prompt("مقدار کد (اختیاری)", c.code);
                          if (codeVal === null) return;
                          patchCode(c.id, {
                            note,
                            maxUses: Number(maxUses) || 1,
                            code: codeVal.trim() || undefined,
                          });
                        }}
                      >
                        ✎ ویرایش
                      </button>
                      <button
                        className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700"
                        onClick={() => patchCode(c.id, { enabled: !c.enabled })}
                      >
                        {c.enabled ? "⏸ غیرفعال" : "▶ فعال"}
                      </button>
                      <button
                        className="text-xs px-3 py-1.5 rounded-lg border border-red-200 text-red-700 bg-red-50"
                        onClick={() => deleteCode(c.id)}
                      >
                        🗑 حذف
                      </button>
                    </div>
                </button>
                <span className="text-xs text-slate-500">
                  {c.usedCount}/{c.maxUses} · {c.note || "—"} · {fmt(c.createdAt)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid md:grid-cols-3 gap-4 min-h-[420px]">
            <div className="bg-white rounded-xl border overflow-hidden">
              <div className="px-3 py-2 border-b text-sm font-medium bg-slate-50">گفتگوها</div>
              {threads.map((t) => (
                <button
                  key={t.licenseId}
                  onClick={() => openChat(t.licenseId)} /* chat */
                  className={`w-full text-right px-3 py-2.5 border-b text-sm hover:bg-slate-50 ${
                    chatLicenseId === t.licenseId ? "bg-blue-50" : ""
                  }`}
                >
                  {t.username || "کاربر"}{" "}
                  {t.unread > 0 && <span className="text-red-500 text-xs">({t.unread})</span>}
                </button>
              ))}
            </div>
            <div className="md:col-span-2 bg-white rounded-xl border flex flex-col">
              <div className="mb-4 p-3 border rounded-xl bg-slate-50">
                <div className="text-sm font-bold mb-2">پیام گروهی به همه کاربران</div>
                <div className="flex gap-2">
                  <input
                    className="flex-1 border rounded-lg px-3 py-2 text-sm"
                    placeholder="متن پیام گروهی..."
                    value={broadcastText}
                    onChange={(e) => setBroadcastText(e.target.value)}
                  />
                  <button
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm"
                    onClick={sendBroadcast}
                  >
                    ارسال گروهی
                  </button>
                </div>
              </div>
              {!chatLicenseId ? (
                <p className="m-auto text-slate-400 text-sm">یک گفتگو انتخاب کنید</p>
              ) : (
                <>
                  <div className="flex-1 overflow-y-auto p-4 space-y-2 max-h-[360px]">
                    {chatMsgs.map((m) => (
                      <div key={m.id} className="space-y-1">
                        <div
                          className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                            m.sender === "admin"
                              ? "mr-auto bg-[#1565C0] text-white"
                              : "ml-auto bg-slate-100"
                          }`}
                        >
                          {m.body}
                        </div>
                        <div className={`flex gap-2 text-[10px] ${m.sender === "admin" ? "justify-start" : "justify-end"}`}>
                          <button
                            className="text-blue-600 hover:underline"
                            onClick={async () => {
                              const body = prompt("ویرایش پیام", m.body);
                              if (body === null || !body.trim()) return;
                              await fetch("/api/admin/chat", {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ id: m.id, body }),
                              });
                              if (chatLicenseId) await openChat(chatLicenseId);
                            }}
                          >
                            ویرایش
                          </button>
                          <button
                            className="text-red-600 hover:underline"
                            onClick={async () => {
                              if (!confirm("حذف این پیام؟")) return;
                              await fetch("/api/admin/chat", {
                                method: "DELETE",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ messageId: m.id }),
                              });
                              if (chatLicenseId) await openChat(chatLicenseId);
                            }}
                          >
                            حذف
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="p-3 border-t flex gap-2">
                    <input
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && sendChat()}
                      placeholder="پاسخ…"
                      className="flex-1 rounded-xl border px-3 py-2 text-sm"
                    />
                    <button
                      onClick={sendChat}
                      className="rounded-xl bg-[#1565C0] text-white px-4 py-2 text-sm"
                    >
                      ارسال
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </main>

      {editUser && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => setEditUserId(null)}
        >
          <div
            className="bg-white rounded-2xl max-w-md w-full p-5 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-bold text-lg">تنظیمات {editUser.username || "کاربر"}</h3>

            <div>
              <label className="text-xs text-slate-500 block mb-1">شیفت کاری</label>
              <select
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={editUser.shiftId || ""}
                onChange={(e) =>
                  patchLicense(editUser.id, {
                    shiftId: e.target.value || null,
                  })
                }
              >
                <option value="">— بدون شیفت —</option>
                {shifts.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.startWorkTime}–{s.endWorkTime}
                    {!s.thursdayWorking ? " · پنج‌شنبه تعطیل" : ""} · شناوری {s.flexibleMinutes}د)
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2 text-sm">
              {(
                [
                  ["canJira", "دسترسی Jira"],
                  ["canAttendance", "دسترسی تردد"],
                  ["canReports", "گزارشات"],
                  ["canSupport", "پشتیبانی"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 border rounded-lg px-3 py-2">
                  <input
                    type="checkbox"
                    defaultChecked={(editUser as any)[key]}
                    onChange={(e) => patchLicense(editUser.id, { [key]: e.target.checked })}
                  />
                  {label}
                </label>
              ))}
            </div>

            <p className="text-xs text-slate-400">
              ساعت کاری و شناوری از شیفت انتخاب‌شده به اپ می‌رسد. کاربر فقط تم و اعلان را تنظیم
              می‌کند.
            </p>
            <button
              onClick={() => setEditUserId(null)}
              className="w-full rounded-xl bg-slate-100 py-2.5 text-sm"
            >
              بستن
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
