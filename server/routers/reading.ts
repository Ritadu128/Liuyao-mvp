import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { desc, eq, sql } from 'drizzle-orm';
import { publicProcedure, router } from '../_core/trpc';
import { ENV } from '../_core/env';
import { getDb } from '../db';
import { ipRateLimits, readings } from '../../drizzle/schema';

const DAILY_LIMIT = 10;
const DEFAULT_DEEPSEEK_TIMEOUT_MS = 20_000;

function getTodayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function getDeepSeekTimeoutMs(): number {
  const configured = Number.parseInt(ENV.deepseekTimeoutMs, 10);
  if (!Number.isFinite(configured)) return DEFAULT_DEEPSEEK_TIMEOUT_MS;
  return Math.min(Math.max(configured, 3_000), 60_000);
}

class DeepSeekRequestError extends Error {
  constructor(
    public readonly kind: 'timeout' | 'upstream' | 'invalid_response',
    cause?: unknown,
  ) {
    super(kind);
    this.cause = cause;
  }
}

/**
 * 通过 MySQL 唯一索引 (ip, date) 的冲突更新原子递增计数。
 * affectedRows 为 0 代表计数已满且本次没有递增；数据库不可用时必须失败关闭，
 * 不能绕过服务端每日限额。
 */
async function checkAndIncrementIpLimit(ip: string): Promise<{ allowed: boolean; remaining: number }> {
  const db = await getDb();
  if (!db) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: '服务暂不可用，请稍后再试。',
    });
  }

  try {
    const result = await db.execute(sql`
      INSERT INTO ${ipRateLimits} (${ipRateLimits.ip}, ${ipRateLimits.date}, ${ipRateLimits.count})
      VALUES (${ip}, ${getTodayDate()}, 1)
      ON DUPLICATE KEY UPDATE
        ${ipRateLimits.count} = IF(${ipRateLimits.count} < ${DAILY_LIMIT}, ${ipRateLimits.count} + 1, ${ipRateLimits.count}),
        ${ipRateLimits.updatedAt} = IF(${ipRateLimits.count} < ${DAILY_LIMIT}, CURRENT_TIMESTAMP, ${ipRateLimits.updatedAt})
    `);

    const header = (Array.isArray(result) ? result[0] : result) as unknown as { affectedRows?: number };
    const allowed = (header.affectedRows ?? 0) > 0;

    return {
      allowed,
      // 并发请求可能在返回前继续递增，此值只作为提示，不参与授权判断。
      remaining: allowed ? 0 : 0,
    };
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    console.error('[Reading] IP rate-limit database error:', error instanceof Error ? error.message : error);
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: '服务暂不可用，请稍后再试。',
    });
  }
}

const DeepSeekApiResponseSchema = z.object({
  choices: z.array(z.object({
    message: z.object({ content: z.string().nullable().optional() }),
  })).min(1),
});

const DeepSeekReadingSchema = z.object({
  integrated_reading: z.string().min(1).max(12_000),
  hexagram_reading: z.string().min(1).max(12_000),
});

async function callDeepSeek(messages: { role: 'system' | 'user'; content: string }[]) {
  const apiKey = ENV.deepseekApiKey;
  if (!apiKey) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: '解读服务尚未配置，请稍后再试。',
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getDeepSeekTimeoutMs());

  try {
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: ENV.deepseekModel,
        messages,
        temperature: 0.7,
        max_tokens: 2_048,
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      console.error('[Reading] DeepSeek upstream error:', response.status);
      throw new DeepSeekRequestError('upstream');
    }

    const apiResponse = DeepSeekApiResponseSchema.safeParse(await response.json());
    const content = apiResponse.success ? apiResponse.data.choices[0]?.message.content : undefined;
    if (!content) throw new DeepSeekRequestError('invalid_response');

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new DeepSeekRequestError('invalid_response');
    }

    const reading = DeepSeekReadingSchema.safeParse(parsed);
    if (!reading.success) throw new DeepSeekRequestError('invalid_response');
    return reading.data;
  } catch (error) {
    if (error instanceof TRPCError || error instanceof DeepSeekRequestError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new DeepSeekRequestError('timeout', error);
    }
    throw new DeepSeekRequestError('upstream', error);
  } finally {
    clearTimeout(timeout);
  }
}

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
    ? `动爻：${input.movingLines.map(position => LINE_POSITION_LABELS[position - 1] + '爻').join('、')}`
    : '无动爻（纯卦）';
  const changedDesc = input.changedName
    ? `变卦：${input.changedName}（${input.changedKey}）`
    : '无变卦';
  const yaoCiText = input.yaoCi.length > 0
    ? input.yaoCi.map(yao => `${LINE_POSITION_LABELS[yao.position - 1]}爻：${yao.text}`).join('\n')
    : '（无动爻）';
  const guaCiBlock = input.guaCi.trim() ? `卦辞：${input.guaCi}` : '卦辞：（缺失）';
  const xiangYueBlock = input.xiangYue.trim() ? `象曰：${input.xiangYue}` : '象曰：（缺失）';
  const yaoCiBlock = input.yaoCi.length > 0 ? `动爻爻辞：\n${yaoCiText}` : '';

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
3. 【重要】经文引用规则：只能引用【经文原文】区块中提供的原句，不得自行补充、杜撰或引用未出现在输入中的经文。若某字段标注“（缺失）”，则在对应位置直接留空，不得替换为其他经文
4. 严格返回合法 JSON，不要有额外文字，JSON 值中的换行用 \\n 表示`;
}

function getDeepSeekError(error: unknown): TRPCError {
  if (error instanceof TRPCError) return error;
  if (error instanceof DeepSeekRequestError && error.kind === 'timeout') {
    return new TRPCError({ code: 'TIMEOUT', message: '解读生成超时，请稍后重试。' });
  }
  return new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '解读生成失败，请稍后重试。' });
}

export const readingRouter = router({
  generate: publicProcedure
    .input(GenerateInputSchema)
    .mutation(async ({ input, ctx }) => {
      // 未配置服务时不消耗 IP 当日额度。
      if (!ENV.deepseekApiKey) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: '解读服务尚未配置，请稍后再试。',
        });
      }

      const clientIp = ctx.req.ip || ctx.req.socket?.remoteAddress || 'unknown';
      const rateCheck = await checkAndIncrementIpLimit(clientIp);
      if (!rateCheck.allowed) {
        throw new TRPCError({
          code: 'TOO_MANY_REQUESTS',
          message: `今日占卜次数已达上限（每天最多 ${DAILY_LIMIT} 次），明日再来。`,
        });
      }

      let generated;
      try {
        generated = await callDeepSeek([
          {
            role: 'system',
            content: '你是精通《周易》六爻占卜的易学大师，擅长将古典易理与现代生活相结合，提供深刻而实用的占卜解读。解读时只能引用用户提供的经文原文，不得自行补充或杜撰经文。',
          },
          { role: 'user', content: buildPrompt(input) },
        ]);
      } catch (error) {
        throw getDeepSeekError(error);
      }

      // 当前阶段的历史仅保存在浏览器。保留已登录用户写库能力，供未来 OAuth 版本复用；
      // 匿名请求绝不向 readings 表写入问题或解读内容。
      let readingId: number | null = null;
      if (ctx.user) {
        try {
          const db = await getDb();
          if (db) {
            const [result] = await db.insert(readings).values({
              userId: ctx.user.id,
              question: input.question,
              linesJson: input.linesJson,
              originalKey: input.originalKey,
              originalName: input.originalName,
              originalBits: input.originalBits,
              changedKey: input.changedKey,
              changedName: input.changedName,
              changedBits: input.changedBits,
              movingLinesJson: JSON.stringify(input.movingLines),
              integratedReading: generated.integrated_reading,
              hexagramReading: generated.hexagram_reading,
            });
            readingId = (result as { insertId?: number }).insertId ?? null;
          }
        } catch (error) {
          console.error('[Reading] Authenticated history save failed:', error instanceof Error ? error.message : error);
        }
      }

      return {
        integratedReading: generated.integrated_reading,
        hexagramReading: generated.hexagram_reading,
        readingId,
        remaining: rateCheck.remaining,
      };
    }),

  // 作为未来 OAuth 版本的可选接口保留；匿名版本的前端不会调用它。
  list: publicProcedure
    .input(z.object({ limit: z.number().int().min(1).max(50).default(20) }))
    .query(async ({ input, ctx }) => {
      if (!ctx.user) return [];
      const db = await getDb();
      if (!db) return [];
      return db
        .select()
        .from(readings)
        .where(eq(readings.userId, ctx.user.id))
        .orderBy(desc(readings.createdAt))
        .limit(input.limit);
    }),

  getById: publicProcedure
    .input(z.object({ id: z.number().int() }))
    .query(async ({ input, ctx }) => {
      if (!ctx.user) {
        throw new TRPCError({ code: 'FORBIDDEN', message: '无权访问此记录' });
      }
      const db = await getDb();
      if (!db) return null;
      const rows = await db
        .select()
        .from(readings)
        .where(eq(readings.id, input.id))
        .limit(1);
      const row = rows[0] ?? null;
      if (!row) return null;
      if (row.userId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: '无权访问此记录' });
      }
      return row;
    }),
});
