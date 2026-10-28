import { isAdminAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { clientIp, jsonErr, jsonOk } from "@/lib/api";
import { getAiConfig, DEFAULT_AI_RULES } from "@/lib/ai";
import { z } from "zod";

export const runtime = "nodejs";

export async function GET() {
  if (!(await isAdminAuthenticated())) return jsonErr("غیرمجاز", 401);
  const cfg = await getAiConfig();
  return jsonOk({ aiConfig: cfg, defaultRules: DEFAULT_AI_RULES });
}

const updateSchema = z.object({
  apiUrl: z.string().url().default("https://api.openai.com/v1"),
  apiKey: z.string().default(""),
  model: z.string().min(1).default("gpt-4o-mini"),
  systemPrompt: z.string().default(""),
  enabled: z.boolean().default(true),
  timeoutSeconds: z.number().min(5).max(3600).default(120),
});

export async function POST(req: Request) {
  if (!(await isAdminAuthenticated())) return jsonErr("غیرمجاز", 401);
  try {
    const body = updateSchema.parse(await req.json());
    const existing = await prisma.aiConfig.findFirst();
    const cfg = existing
      ? await prisma.aiConfig.update({ where: { id: existing.id }, data: body })
      : await prisma.aiConfig.create({ data: { id: 1, ...body } });

    await prisma.auditLog.create({
      data: {
        action: "ai_config_update",
        detail: `model: ${cfg.model}, enabled: ${cfg.enabled}`,
        ip: clientIp(req),
      },
    });

    return jsonOk({ aiConfig: cfg });
  } catch (e: any) {
    console.error(e);
    return jsonErr(e.message || "ذخیره تنظیمات هوش مصنوعی ناموفق بود", 400);
  }
}