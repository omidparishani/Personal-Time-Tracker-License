import { prisma } from "@/lib/prisma";

export const DEFAULT_AI_RULES = `# قوانین ثبت ورک‌لاگ

این قوانین برای هر ایجنتی است که روی جیرا یا تایم‌شیت دمیس ورک‌لاگ می‌زند. برای همان شخصی اجرا کن که درخواست داده، و فقط در ماهی که خودش مشخص کرده. Original Estimate را عوض نکن. تا وقتی پیش‌نمایش را تأیید نکرده، هیچ ورک‌لاگی ننویس، حذف نکن و جابه‌جا نکن.

- جیرا: https://jira.demisco.com
- تایم‌شیت: https://bonus.demisco.com/timesheet
- منطقهٔ زمانی: Asia/Tehran یعنی +03:30

ماه شمسی را خودت به بازهٔ میلادی همان منطقه تبدیل کن. پنجشنبه و جمعه آخر هفته است.

## کدام تسک

فقط تسکی شارژ شود که هر سه شرط را با هم داشته باشد:

- وضعیت فعلی‌اش Done یا READY_TO_RELEASE باشد.
- ورودش به Done یا READY_TO_RELEASE داخل همان ماه اتفاق افتاده باشد. تسکی که قبل از این ماه بسته شده، حتی اگر در این ماه به‌روز شده باشد، خارج است.
- Original Estimate داشته باشد. تسک بدون Estimate اصلاً شارژ نمی‌شود.

برای پر کردن ساعت، از تسک‌های بسته‌شدهٔ ماه‌های قبل استفاده نکن.

## چقدر روی هر تسک

جمع نهایی لاگ تسک، با احتساب ورک‌لاگ‌هایی که از قبل هست، باید اکیداً داخل بازهٔ (۷۵٪، ۱۲۵٪) از Original Estimate باشد.

برای Estimate ده ساعته یعنی بیشتر از ۰۷:۳۰ و کمتر از ۱۲:۳۰. این مقدار باید داخل بازه پخش و تصادفی به نظر برسد. دقیقاً ۷۵٪، دقیقاً ۱۰۰٪ و دقیقاً ۱۲۵٪ ممنوع است. برابری دقیق با Estimate تقلب حساب می‌شود.

ورک‌لاگ جیرا دقیقه‌ای است. ورک‌لاگ‌های یک‌دو دقیقه‌ایِ موجود را پاک نکن؛ هم در جمع تسک حساب می‌شوند و هم در سقف روز.

## چه ساعتی

شروع هیچ ورک‌لاگی نباید زودتر از زمان ساخت همان تسک باشد. اگر تسک امروز ساخته شده، لاگ روزهای قبل روی آن ممنوع است. اگر وسط روز ساخته شده، ساعت‌های قبل از ساخت در همان روز باید روی تسک‌های قدیمی‌تر و مجاز برود.

پنجرهٔ ساعت روز:

- روز حضور: از ساعت شروع حضور به اندازهٔ مدت حضور.
- روز دورکاری: همان بازهٔ شروع و پایان درخواست دورکاری، نه از ۰۸:۰۰ فرضی.

## سقف هر روز

سقف روز = حضور همان روز + دورکاری معتبر همان روز.

دورکاری معتبر یعنی درخواست ثبت‌شده یا در انتظار تأیید. درخواست ردشده، لغوشده، و درخواست لغوشدهٔ هم‌پوشان را حساب نکن.

اختلاف جمع لاگ هر روز با سقف همان روز باید کمتر از ۱۵ دقیقه باشد. این شرط برای هر روز اجباری است. روز بدون حضور و بدون دورکاری معتبر، از جمله پنجشنبه و جمعه، صفر بماند.

## اگر قواعد با هم جمع نشدند

هیچ شرطی را برای پر کردن ساعت نشکن. کسری یا تعارض را همان‌جا نشان بده و متوقف شو.

## پیش‌نمایش

قبل از هر نوشتن، پیش‌نمایش را روزبه‌روز بده: سقف روز، جمع لاگ، اختلاف، و برای هر قطعه کلید تسک، مدت، و ساعت شروع. کنارش جدول نهایی هر تسک را بگذار: Estimate، زمان نهایی، و درصد.
`;

export async function getAiConfig() {
  let cfg = await prisma.aiConfig.findFirst();
  if (!cfg) {
    cfg = await prisma.aiConfig.create({
      data: {
        id: 1,
        apiUrl: "https://api.openai.com/v1",
        apiKey: "",
        model: "gpt-4o-mini",
        systemPrompt: DEFAULT_AI_RULES,
        enabled: true,
        timeoutSeconds: 120,
      },
    });
  }
  return cfg;
}

export async function testAiConnection(cfgOverride?: {
  apiUrl: string;
  apiKey: string;
  model: string;
  timeoutSeconds?: number;
}): Promise<{ ok: boolean; status?: number; latencyMs: number; message: string; model?: string }> {
  const cfg = cfgOverride ? { ...cfgOverride, timeoutSeconds: cfgOverride.timeoutSeconds ?? 120 } : await getAiConfig();
  if (!cfg.apiKey) {
    return { ok: false, latencyMs: 0, message: "کلید API تنظیم نشده است" };
  }
  const endpoint = `${cfg.apiUrl.replace(/\/+$/, "")}/chat/completions`;
  const start = Date.now();
  const signal = AbortSignal.timeout((cfg.timeoutSeconds || 120) * 1000);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: cfg.model || "gpt-4o-mini",
        messages: [{ role: "user", content: "Say 'OK' and nothing else." }],
        max_tokens: 5,
      }),
      signal,
    });
    const latencyMs = Date.now() - start;
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      return { ok: false, status: response.status, latencyMs, message: `خطا ${response.status}: ${text.slice(0, 200)}` };
    }
    const data = await response.json();
    const model = data.model || cfg.model;
    return { ok: true, latencyMs, message: "اتصال موفق", model };
  } catch (e: any) {
    const latencyMs = Date.now() - start;
    return { ok: false, latencyMs, message: e?.name === "TimeoutError" ? "تایم اوت شد" : (e?.message || "خطای نامConnections") };
  }
}

export type CandidateTask = {
  key: string;
  summary: string;
  statusName: string;
  originalEstimateMinutes: number;
  existingLoggedMinutes: number;
  created?: string;
};

export type TimesheetGenerationInput = {
  date: string;
  presenceMinutes: number;
  startTime: string;
  endTime?: string;
  tasks: CandidateTask[];
};

export type GeneratedWorklog = {
  issueKey: string;
  summary: string;
  durationMinutes: number;
  startTime: string;
  comment?: string;
  percentageOfEstimate?: number;
};

export type TimesheetGenerationResult = {
  worklogs: GeneratedWorklog[];
  summary: {
    dayCeilingMinutes: number;
    totalLoggedMinutes: number;
    differenceMinutes: number;
    explanation?: string;
  };
};

export async function generateTimesheetWithAi(
  input: TimesheetGenerationInput
): Promise<TimesheetGenerationResult> {
  const cfg = await getAiConfig();
  if (!cfg.enabled) {
    throw new Error("سرویس هوش مصنوعی در پنل ادمین غیرفعال است");
  }
  if (!cfg.apiKey) {
    throw new Error("کلید API هوش مصنوعی در پنل ادمین تنظیم نشده است");
  }

  const endpoint = `${cfg.apiUrl.replace(/\/+$/, "")}/chat/completions`;

  const systemInstructions = `${cfg.systemPrompt}

==================================================
دستور خروجی سیستمی:
پاسخ شما باید صرفاً و منحصراً یک JSON معتبر باشد (بدون مارک‌داون \`\`\`json و بدون هیچ متن اضافی قبل یا بعد از آن).
فرمت ساختار JSON باید دقیقاً به شکل زیر باشد:
{
  "worklogs": [
    {
      "issueKey": "کلید تسک مثلا DEMIS-123",
      "summary": "عنوان تسک",
      "durationMinutes": 180,
      "startTime": "08:30",
      "comment": "توضیح کوتاه فعالیت انجام شده",
      "percentageOfEstimate": 85
    }
  ],
  "summary": {
    "dayCeilingMinutes": 480,
    "totalLoggedMinutes": 475,
    "differenceMinutes": 5,
    "explanation": "توضیح کوتاه درباره توزیع زمان"
  }
}
دقت کنید:
۱. جمع کل durationMinutes ورک‌لاگ‌ها باید دقیقاً یا با اختلاف کمتر از ۱۵ دقیقه با سقف حضور روز (${input.presenceMinutes} دقیقه) برابر باشد.
۲. ساعت شروع startTime ورک‌لاگ‌ها پشت سر هم از ساعت ${input.startTime} شروع شوند و هم‌پوشانی نداشته باشند.
۳. جمع کل لاگ هر تسک (شامل existingLoggedMinutes + durationMinutes جدید) باید اکیداً در بازه ۷۵٪ تا ۱۲۵٪ از originalEstimateMinutes تسک قرار گیرد.
۴. فقط از تسک‌های ارائه‌شده در لیست تسک‌های ورودی استفاده کنید.
`;

  const userPayload = {
    date: input.date,
    dayPresenceMinutes: input.presenceMinutes,
    workWindow: {
      start: input.startTime || "08:00",
      end: input.endTime || "",
    },
    candidateTasks: input.tasks.map((t) => ({
      key: t.key,
      summary: t.summary,
      status: t.statusName,
      originalEstimateMinutes: t.originalEstimateMinutes,
      existingLoggedMinutes: t.existingLoggedMinutes,
      remainingAllowedRangeMinutes: {
        min75: Math.round(t.originalEstimateMinutes * 0.76),
        max125: Math.round(t.originalEstimateMinutes * 1.24),
      },
    })),
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model: cfg.model || "gpt-4o-mini",
      messages: [
        { role: "system", content: systemInstructions },
        {
          role: "user",
          content: `لطفاً ورک‌لاگ‌های تایم‌شیت این روز را طبق قوانین محاسبه و تولید کن:\n${JSON.stringify(
            userPayload,
            null,
            2
          )}`,
        },
      ],
      temperature: 0.6,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("AI API Error:", response.status, errorText);
    throw new Error(`خطای سرویس هوش مصنوعی (${response.status}): ${errorText.slice(0, 200)}`);
  }

  const data = await response.json();
  const rawContent = data.choices?.[0]?.message?.content?.trim();
  if (!rawContent) {
    throw new Error("پاسخی از هوش مصنوعی دریافت نشد");
  }

  let parsed: any;
  try {
    const cleanJson = rawContent.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
    parsed = JSON.parse(cleanJson);
  } catch (err) {
    console.error("JSON parse error from AI:", rawContent);
    throw new Error("قالب پاسخ هوش مصنوعی نامعتبر بود");
  }

  const worklogs: GeneratedWorklog[] = (parsed.worklogs || []).map((w: any) => ({
    issueKey: String(w.issueKey || "").trim(),
    summary: String(w.summary || "").trim(),
    durationMinutes: Number(w.durationMinutes) || 0,
    startTime: String(w.startTime || "08:00").trim(),
    comment: w.comment ? String(w.comment).trim() : "ثبت کار با هوش مصنوعی",
    percentageOfEstimate: w.percentageOfEstimate ? Number(w.percentageOfEstimate) : undefined,
  }));

  const totalLogged = worklogs.reduce((sum, w) => sum + w.durationMinutes, 0);

  return {
    worklogs,
    summary: {
      dayCeilingMinutes: input.presenceMinutes,
      totalLoggedMinutes: totalLogged,
      differenceMinutes: Math.abs(input.presenceMinutes - totalLogged),
      explanation: parsed.summary?.explanation || "",
    },
  };
}
