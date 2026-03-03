import { z } from 'zod';
import { publicProcedure, router } from '../_core/trpc';
import { TRPCError } from '@trpc/server';
import { getDb } from '../db';
import { readings, ipRateLimits } from '../../drizzle/schema';
import { eq, desc, and } from 'drizzle-orm';
import { ENV } from '../_core/env';

const DAILY_LIMIT = 10; // 每个 IP 每天最多解读次数

// ── IP 限流检查与计数 ────────────────────────────────────────────
function getTodayDate(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

async function checkAndIncrementIpLimit(ip: string): Promise<{ allowed: boolean; remaining: number }> {
  const db = await getDb();
  if (!db) return { allowed: true, remaining: DAILY_LIMIT }; // DB 不可用时放行

  const today = getTodayDate();

  const rows = await db
    .select()
    .from(ipRateLimits)
    .where(and(eq(ipRateLimits.ip, ip), eq(ipRateLimits.date, today)))
    .limit(1);

  const current = rows[0];

  if (!current) {
    // 今天第一次，插入新记录
    await db.insert(ipRateLimits).values({ ip, date: today, count: 1 });
    return { allowed: true, remaining: DAILY_LIMIT - 1 };
  }

  if (current.count >= DAILY_LIMIT) {
    return { allowed: false, remaining: 0 };
  }

  // 计数 +1
  await db
    .update(ipRateLimits)
    .set({ count: current.count + 1 })
    .where(eq(ipRateLimits.id, current.id));

  return { allowed: true, remaining: DAILY_LIMIT - (current.count + 1) };
}

// ── DeepSeek API 调用（替代 Manus 内置 LLM）────────────────────────────────
async function callDeepSeek(messages: { role: string; content: string }[], responseFormat?: object) {
  const apiKey = ENV.deepseekApiKey;
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY not set');

  const body: Record<string, unknown> = {
    model: 'deepseek-chat',
    messages,
    temperature: 0.7,
    max_tokens: 2048,
  };
  if (responseFormat) {
    body.response_format = responseFormat;
  }

  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`DeepSeek API error ${res.status}: ${errText}`);
  }

  return res.json();
}

// ── Schemas ─────────────────────────────────────────────────────────────────
const YaoCiSchema = z.object({
  position: z.number().int().min(1).max(6),
  text: z.string(),
});

const GenerateInputSchema = z.object({
  question: z.string().min(1).max(500),
  originalKey: z.string(),
  originalName: z.string(),
  originalBits: z.string().length(6),
  changedKey: z.string().nullable(),
  changedName: z.string().nullable(),
  changedBits: z.string().nullable(),
  movingLines: z.array(z.number().int().min(1).max(6)),
  guaCi: z.string(),
  xiangYue: z.string(),
  yaoCi: z.array(YaoCiSchema),
  linesJson: z.string(),
});

const LINE_POSITION_LABELS = ['初', '二', '三', '四', '五', '上'];

function buildPrompt(input: z.infer<typeof GenerateInputSchema>): string {
  const movingDesc = input.movingLines.length > 0
    ? `动爻：${input.movingLines.map(p => LINE_POSITION_LABELS[p-1] + '爻').join('、')}`
    : '无动爻（纯卦）';

  const changedDesc = input.changedName
    ? `变卦：${input.changedName}（${input.changedKey}）`
    : '无变卦';

  const yaoCiText = input.yaoCi.length > 0
    ? input.yaoCi.map(y => `${LINE_POSITION_LABELS[y.position-1]}爻：${y.text}`).join('\n')
    : '（无动爻）';

  // 构建经文原文区块（若字段为空则标注"缺失"）
  const guaCiBlock = input.guaCi.trim()
    ? `卦辞：${input.guaCi}`
    : '卦辞：（缺失）';
  const xiangYueBlock = input.xiangYue.trim()
    ? `象曰：${input.xiangYue}`
    : '象曰：（缺失）';
  const yaoCiBlock = input.yaoCi.length > 0
    ? `动爻爻辞：\n${yaoCiText}`
    : '';

  return `你是一位精通《周易》六爻占卜的易学大师，请为以下占卜结果提供专业解读。

【占卜信息】
问题：${input.question}
本卦：${input.originalName}（第${input.originalKey}卦）
${changedDesc}
${movingDesc}

【经文原文】（以下为本次占卜的唯一经文来源）
${guaCiBlock}
${xiangYueBlock}
${yaoCiBlock}

请提供两部分解读，严格按照以下 JSON 格式返回：
{
  "integrated_reading": "综合解读内容（使用 Markdown，400-600字）",
  "hexagram_reading": "卦象解读内容（使用 Markdown，必须包含以下三个章节，每章节用 ## 标题标注，共约400-500字）"
}

【卦象解读必须严格包含以下三个章节，缺一不可】
## 一、经文原文与释义
引用卦辞、象曰原文（仅限【经文原文】区块中的原句），逐句解释其字面含义与象征意义。

## 二、现代解读
结合提问者的具体问题，用现代语言解释本卦对此问题的启示，分析当前处境与走向。

## 三、故事化解读
用一个生动的故事、场景或比喻来阐释本卦卦义，使抽象的卦理变得直观易懂。

【综合解读要求】
使用 Markdown 格式，用 ## 标题分节（如：## 卦象总论、## 动爻分析、## 综合建议），关键词或核心建议用 **加粗** 标注。

【通用要求】
1. 语言：文白相间，既有古典韵味又通俗易懂
2. 态度：客观中立，不做绝对预测，引导积极思考
3. 【重要】经文引用规则：只能引用【经文原文】区块中提供的原句，不得自行补充、杜撰或引用未出现在输入中的经文。若某字段标注"（缺失）"，则在对应位置直接留空，不得替换为其他经文
4. 严格返回合法 JSON，不要有额外文字，JSON 值中的换行用 \n 表示`;
}

// ── Router ───────────────────────────────────────────────────────────────────
export const readingRouter = router({
  generate: publicProcedure
    .input(GenerateInputSchema)
    .mutation(async ({ input, ctx }) => {
      // ── IP 限流检查 ───────────────────────────────────────────────────────
      const clientIp =
        (ctx.req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
        ctx.req.socket?.remoteAddress ||
        'unknown';

      const rateCheck = await checkAndIncrementIpLimit(clientIp);
      if (!rateCheck.allowed) {
        throw new TRPCError({
          code: 'TOO_MANY_REQUESTS',
          message: `今日占卜次数已达上限（每天最多 ${DAILY_LIMIT} 次），明日再来。`,
        });
      }

      // ── 调用 LLM 生成解读 ─────────────────────────────────────────────────
      const prompt = buildPrompt(input);

      let integratedReading = '';
      let hexagramReading = '';

      try {
        const response = await callDeepSeek(
          [
            {
              role: 'system',
              content: '你是精通《周易》六爻占卜的易学大师，擅长将古典易理与现代生活相结合，提供深刻而实用的占卜解读。解读时只能引用用户提供的经文原文，不得自行补充或杜撰经文。'
            },
            { role: 'user', content: prompt }
          ],
          {
            type: 'json_object',
          }
        );

        const content = response.choices?.[0]?.message?.content as string | undefined;
        if (content) {
          const parsed = JSON.parse(content);
          integratedReading = parsed.integrated_reading ?? '';
          hexagramReading = parsed.hexagram_reading ?? '';
        }
      } catch (e) {
        console.error('[Reading] LLM error:', e);
        integratedReading = '解读生成失败，请稍后重试。';
        hexagramReading = '解读生成失败，请稍后重试。';
      }

      // ── 保存到数据库 ──────────────────────────────────────────────────────
      let readingId: number | null = null;
      try {
        const db = await getDb();
        if (db) {
          const userId = (ctx.user as any)?.id ?? null;
          const [result] = await db.insert(readings).values({
            userId,
            question: input.question,
            linesJson: input.linesJson,
            originalKey: input.originalKey,
            originalName: input.originalName,
            originalBits: input.originalBits,
            changedKey: input.changedKey ?? null,
            changedName: input.changedName ?? null,
            changedBits: input.changedBits ?? null,
            movingLinesJson: JSON.stringify(input.movingLines),
            integratedReading,
            hexagramReading,
          });
          readingId = (result as any)?.insertId ?? null;
        }
      } catch (e) {
        console.error('[Reading] DB save error:', e);
      }

      return {
        integratedReading,
        hexagramReading,
        readingId,
      };
    }),

  // 获取历史记录列表（仅返回当前登录用户自己的记录）
  list: publicProcedure
    .input(z.object({ limit: z.number().int().min(1).max(50).default(20) }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return [];

      const userId = (ctx.user as any)?.id ?? null;
      // 未登录用户无法查看历史记录（历史记录需要登录才能关联）
      if (!userId) return [];

      const rows = await db
        .select()
        .from(readings)
        .where(eq(readings.userId, userId))
        .orderBy(desc(readings.createdAt))
        .limit(input.limit);
      return rows;
    }),

  // 获取单条记录（严格校验归属，只能查看自己的记录）
  getById: publicProcedure
    .input(z.object({ id: z.number().int() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return null;

      const userId = (ctx.user as any)?.id ?? null;

      const rows = await db
        .select()
        .from(readings)
        .where(eq(readings.id, input.id))
        .limit(1);

      const row = rows[0] ?? null;
      if (!row) return null;

      // 严格校验：记录必须属于当前用户
      // 未登录用户（userId=null）只能访问 userId 为 null 的记录
      // 已登录用户只能访问自己的记录
      if (row.userId !== userId) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: '无权访问此记录',
        });
      }

      return row;
    }),
});
