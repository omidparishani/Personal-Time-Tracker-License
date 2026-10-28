import { isAdminAuthenticated } from "@/lib/auth";
import { jsonErr, jsonOk } from "@/lib/api";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!(await isAdminAuthenticated())) return jsonErr("غیرمجاز", 401);
  try {
    const body = await req.json();
    const { apiUrl, apiKey, model, timeoutSeconds } = body;
    if (!apiUrl || !apiKey) {
      return jsonErr("آدرس و کلید API لازم است", 400);
    }
    const endpoint = `${apiUrl.replace(/\/+$/, "")}/chat/completions`;
    const start = Date.now();
    const signal = AbortSignal.timeout((timeoutSeconds || 120) * 1000);
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model || "gpt-4o-mini",
        messages: [{ role: "user", content: "Say 'OK' and nothing else." }],
        max_tokens: 5,
      }),
      signal,
    });
    const latencyMs = Date.now() - start;
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      return jsonOk({ ok: false, latencyMs, message: `خطا ${response.status}: ${text.slice(0, 200)}` });
    }
    const data = await response.json();
    return jsonOk({ ok: true, latencyMs, message: "اتصال موفق", model: data.model || model });
  } catch (e: any) {
    return jsonErr(e?.name === "TimeoutError" ? "تایم اوت شد" : (e?.message || "خطای نامConnections"), 500);
  }
}