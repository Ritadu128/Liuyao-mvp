import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { TRPCError } from '@trpc/server';
import { desc, eq, sql } from 'drizzle-orm';
import type { Request, Response } from 'express';
import {
  deriveHexagramFromLines,
  HEXAGRAM_IDENTITY_BY_BITS,
} from '../../shared/hexagram';
import { publicProcedure, router } from '../_core/trpc';
import type { TrpcContext } from '../_core/context';
import { ENV } from '../_core/env';
import { getDb } from '../db';
import { ipRateLimits, readings } from '../../drizzle/schema';
import {
  DeepSeekStreamError,
  streamDeepSeekReading,
  type ReadingSection,
  type StreamedReading,
} from '../readingStream';
import { getReadingRelevanceRules } from '../readingPromptRules';
import {
  createAiRequestLog,
  estimateDeepSeekCostMicros,
  getAiBudgetConfig,
  hashClientIp,
  notifyBudgetLimitOnce,
  reserveAiBudget,
  settleAiBudget,
  updateAiRequestLog,
  verifyTurnstileToken,
} from '../aiProtection';

const DAILY_LIMIT = 10;
const FREE_WITHOUT_TURNSTILE = 5;
const DEFAULT_DEEPSEEK_TIMEOUT_MS = 60_000;

function getTodayDate(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function createReadingRequestId(): string {
  return `LY-${randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`;
}

function logReadingEvent(
  level: 'info' | 'error',
  event: string,
  fields: Record<string, unknown>,
) {
  const payload = JSON.stringify({ event, ...fields });
  if (level === 'error') console.error(`[Reading] ${payload}`);
  else console.info(`[Reading] ${payload}`);
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
async function checkAndIncrementIpLimit(
  ip: string,
  date = getTodayDate(),
  limit = DAILY_LIMIT,
): Promise<{ allowed: boolean; remaining: number }> {
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
      VALUES (${ip}, ${date}, 1)
      ON DUPLICATE KEY UPDATE
        ${ipRateLimits.count} = IF(${ipRateLimits.count} < ${limit}, ${ipRateLimits.count} + 1, ${ipRateLimits.count}),
        ${ipRateLimits.updatedAt} = IF(${ipRateLimits.count} < ${limit}, CURRENT_TIMESTAMP, ${ipRateLimits.updatedAt})
    `);

    const header = (Array.isArray(result) ? result[0] : result) as unknown as { affectedRows?: number };
    const allowed = (header.affectedRows ?? 0) > 0;

    return {
      allowed,
      // 并发请求可能在返回前继续递增，此值只作为提示，不参与授权判断。
      remaining: 0,
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

async function refundIpLimit(ip: string, date: string): Promise<boolean> {
  try {
    const db = await getDb();
    if (!db) return false;
    await db.execute(sql`
      UPDATE ${ipRateLimits}
      SET ${ipRateLimits.count} = GREATEST(${ipRateLimits.count} - 1, 0),
          ${ipRateLimits.updatedAt} = CURRENT_TIMESTAMP
      WHERE ${ipRateLimits.ip} = ${ip}
        AND ${ipRateLimits.date} = ${date}
        AND ${ipRateLimits.count} > 0
    `);
    return true;
  } catch {
    return false;
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
        max_tokens: 4_096,
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

const HexagramKeySchema = z.string().regex(/^\d{2}$/, '卦序格式无效');
const HexagramBitsSchema = z.string().regex(/^[01]{6}$/, '卦象格式无效');
const HexagramNameSchema = z.string().trim().min(1).max(24);

const YaoCiSchema = z.object({
  position: z.number().int().min(1).max(6),
  text: z.string().trim().max(1_000),
});

const GenerateInputSchema = z.object({
  locale: z.enum(['zh-CN', 'zh-TW', 'en-US']).default('zh-CN'),
  question: z.string().trim().min(1).max(200),
  originalKey: HexagramKeySchema,
  originalName: HexagramNameSchema,
  originalBits: HexagramBitsSchema,
  changedKey: HexagramKeySchema.nullable(),
  changedName: HexagramNameSchema.nullable(),
  changedBits: HexagramBitsSchema.nullable(),
  movingLines: z.array(z.number().int().min(1).max(6)).max(6).refine(
    lines => new Set(lines).size === lines.length,
    '动爻不能重复',
  ),
  guaCi: z.string().trim().max(2_000),
  xiangYue: z.string().trim().max(2_000),
  yaoCi: z.array(YaoCiSchema).max(6),
  linesJson: z.string().max(128),
});

const ReadingStreamInputSchema = GenerateInputSchema.extend({
  turnstileToken: z.string().max(2_048).optional(),
});

type GenerateInput = z.infer<typeof GenerateInputSchema>;

function localized(locale: GenerateInput['locale'], zh: string, en: string, tw: string) {
  return locale === 'en-US' ? en : locale === 'zh-TW' ? tw : zh;
}

function containsCjk(value: string) {
  return /[\u3400-\u9fff]/u.test(value);
}
/**
 * 客户端只负责展示，服务端在消耗 AI 额度前重新根据六次投掷校验排盘。
 * 这样即使旧缓存或被篡改的请求把上下卦、动爻或变卦传错，也不会生成错误解读。
 */
export function getCastingValidationError(input: GenerateInput): string | null {
  let parsedLines: unknown;
  try {
    parsedLines = JSON.parse(input.linesJson);
  } catch {
    return '六爻记录不是有效 JSON';
  }
  if (!Array.isArray(parsedLines)) return '六爻记录必须是数组';

  const derived = deriveHexagramFromLines(parsedLines);
  if (!derived) return '六爻记录必须按初爻到上爻包含六个 6、7、8、9';

  if (input.originalBits !== derived.originalBits) return '本卦爻码与投掷记录不一致';
  if (JSON.stringify(input.movingLines) !== JSON.stringify(derived.movingLines)) {
    return '动爻位置与投掷记录不一致';
  }

  const original = HEXAGRAM_IDENTITY_BY_BITS[derived.originalBits];
  if (!original) return '本卦爻码不在六十四卦表中';
  if (input.originalKey !== original.key || input.originalName !== original.name) {
    return '本卦名称或卦序与六爻不一致';
  }

  const hasChange = derived.changedBits !== derived.originalBits;
  if (!hasChange) {
    if (input.changedBits !== null || input.changedKey !== null || input.changedName !== null) {
      return '无动爻时不应存在变卦';
    }
  } else {
    const changed = HEXAGRAM_IDENTITY_BY_BITS[derived.changedBits];
    if (!changed) return '变卦爻码不在六十四卦表中';
    if (input.changedBits !== derived.changedBits
      || input.changedKey !== changed.key
      || input.changedName !== changed.name) {
      return '变卦名称、卦序或爻码与动爻变化不一致';
    }
  }

  const suppliedYaoPositions = input.yaoCi.map(item => item.position);
  if (JSON.stringify(suppliedYaoPositions) !== JSON.stringify(derived.movingLines)) {
    return '动爻爻辞位置与投掷记录不一致';
  }
  return null;
}

const LINE_POSITION_LABELS = ['初', '二', '三', '四', '五', '上'];

function buildPrompt(input: GenerateInput): string {
  const english = input.locale === 'en-US';
  const sectionHeadings = english
    ? '## 1. Classical meaning and interpretation\n## 2. Modern interpretation\n## 3. Story and metaphor'
    : input.locale === 'zh-TW'
      ? '## 一、經文原文與釋義\n## 二、現代解讀\n## 三、故事化解讀'
      : '## 一、经文原文与释义\n## 二、现代解读\n## 三、故事化解读';
  const languageRule = english
    ? 'Output every user-visible word in natural English. Do not output Chinese characters. Treat the Chinese source text below as internal source material: translate its meaning into English instead of quoting it in Chinese.'
    : input.locale === 'zh-TW'
      ? '全部使用繁體中文（台灣常用字詞），不可混入簡體字。下方簡體經文僅作為資料來源；引用時也需轉成繁體字。文白相間，通俗易懂。'
      : '全部内容必须使用简体中文，文白相间，既有古典韵味又通俗易懂。';
  const relevanceRules = getReadingRelevanceRules(input.locale);
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

  return `你是一位熟悉《周易》经传的文化解读者，请为以下占卜结果提供审慎、可核对的解读。

【占卜信息】
问题：${input.question}
本卦：${input.originalName}（第${input.originalKey}卦）
${changedDesc}
${movingDesc}
排盘校验：已根据六次投掷从初爻到上爻校验通过；本卦爻码为 ${input.originalBits}${input.changedBits ? `，变卦爻码为 ${input.changedBits}` : ''}。
排盘口径：三钱法，6=老阴、7=少阳、8=少阴、9=老阳；只翻转老阴、老阳得到变卦。

【经文原文】（以下为本次占卜的唯一经文来源）
${guaCiBlock}
${xiangYueBlock}
${yaoCiBlock}

请提供两部分解读，严格按照以下 JSON 格式返回：
{
  "integrated_reading": "${english ? 'Overview in Markdown, about 500-800 English words' : input.locale === 'zh-TW' ? '綜合解讀內容（使用 Markdown，約400–600字）' : '综合解读内容（使用 Markdown，400-600字）'}",
  "hexagram_reading": "${english ? 'Detailed reading in Markdown with all three required sections, about 500-800 English words' : input.locale === 'zh-TW' ? '卦象解讀內容（使用 Markdown，包含以下三個章節，約400–500字）' : '卦象解读内容（使用 Markdown，必须包含以下三个章节，每章节用 ## 标题标注，共约400-500字）'}"
}

【卦象解读必须严格包含以下三个章节，缺一不可】
${sectionHeadings}
${english ? 'Explain the source meaning, apply it to the question in modern language, and finish with a vivid story or metaphor.' : '引用卦辞、象曰原文（仅限【经文原文】区块中的原句），解释其含义；再结合具体问题作现代解读，并用故事或比喻使卦理直观易懂。'}

【综合解读要求】
${input.locale === 'zh-TW' ? '使用 Markdown 格式，以 ## 標題分節（如：## 卦象總論、## 動爻分析、## 綜合建議），關鍵詞或核心建議以 **粗體** 標示。' : '使用 Markdown 格式，用 ## 标题分节（如：## 卦象总论、## 动爻分析、## 综合建议），关键词或核心建议用 **加粗** 标注。'}

【问题相关性要求】
${relevanceRules}

【通用要求】
1. 语言：${languageRule}
2. 态度：客观中立，不做绝对预测，引导积极思考
3. 【重要】经文引用规则：只能引用【经文原文】区块中提供的原句，不得自行补充、杜撰或引用未出现在输入中的经文。若某字段标注“（缺失）”，则在对应位置直接留空，不得替换为其他经文
4. 本产品当前采用本卦、动爻、变卦和《周易》经文的简化解读，不包含起卦年月日、月建日辰、纳甲、世应、六亲、六神、旬空等信息；不得假装已完成这些传统六爻纳甲判断
5. 不得凭空断言具体人物、公司内部事件、疾病结果、金额或发生日期；变卦只表变化方向与后续参考，不作必然结果
6. 有动爻时以本卦卦义和已提供的动爻爻辞为重点，再将变卦作为变化背景；无动爻时以本卦整体卦义为重点
7. 严格返回合法 JSON，不要有额外文字，JSON 值中的换行用 \\n 表示`;
}

function getDeepSeekError(error: unknown, locale: GenerateInput['locale'] = 'zh-CN'): TRPCError {
  if (error instanceof TRPCError) return error;
  if ((error instanceof DeepSeekRequestError || error instanceof DeepSeekStreamError) && error.kind === 'timeout') {
    return new TRPCError({ code: 'TIMEOUT', message: localized(locale, '解读生成超时，请稍后重试。', 'The reading timed out. Please try again later.', '解讀生成逾時，請稍後重試。') });
  }
  return new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: localized(locale, '解读生成失败，请稍后重试。', 'The reading could not be generated. Please try again later.', '解讀生成失敗，請稍後重試。') });
}

async function saveAuthenticatedReading(
  input: GenerateInput,
  ctx: TrpcContext,
  generated: StreamedReading,
): Promise<number | null> {
  // 匿名版本只保存到浏览器；这里保留未来 OAuth 模式的服务端历史能力。
  if (!ctx.user) return null;

  try {
    const db = await getDb();
    if (!db) return null;
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
    return (result as { insertId?: number }).insertId ?? null;
  } catch (error) {
    console.error('[Reading] Authenticated history save failed:', error instanceof Error ? error.message : error);
    return null;
  }
}

function getHttpStatus(error: TRPCError): number {
  switch (error.code) {
    case 'BAD_REQUEST': return 400;
    case 'PRECONDITION_FAILED': return 412;
    case 'TOO_MANY_REQUESTS': return 429;
    case 'TIMEOUT': return 504;
    default: return 503;
  }
}

function writeSseEvent(res: Response, event: string, payload: unknown) {
  if (res.writableEnded || res.destroyed) return;
  res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
}

function beginSseResponse(res: Response) {
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  res.write(': connected\n\n');
}

async function writeDevelopmentMockStream(res: Response, locale: GenerateInput['locale']) {
  beginSseResponse(res);
  const mock: StreamedReading = locale === 'en-US' ? {
    integrated_reading: '## Overview\n\nThis local preview confirms that the reading streams progressively and exports correctly.\n\n## Guidance\n\nStay composed and proceed one step at a time.',
    hexagram_reading: '## 1. Classical meaning and interpretation\n\nA local preview interpretation.\n\n## 2. Modern interpretation\n\nObserve first, then act.\n\n## 3. Story and metaphor\n\nLike a boat on water, adjust the sail as conditions change.',
  } : locale === 'zh-TW' ? {
    integrated_reading: '## 卦象總論\n\n此為本機介面驗收內容，用於確認解讀會逐步出現，並驗證長圖儲存。\n\n## 綜合建議\n\n保持從容，循序推進。',
    hexagram_reading: '## 一、經文原文與釋義\n\n本機測試釋義。\n\n## 二、現代解讀\n\n先觀察，再行動。\n\n## 三、故事化解讀\n\n如舟行水上，順勢調帆。',
  } : {
    integrated_reading: '## 卦象总论\n\n此为本地界面验收内容，用于确认解读会逐步出现，并验证电脑端长图保存。\n\n## 综合建议\n\n保持从容，循序推进。',
    hexagram_reading: '## 一、经文原文与释义\n\n本地测试释义。\n\n## 二、现代解读\n\n先观察，再行动。\n\n## 三、故事化解读\n\n如舟行水上，顺势调帆。',
  };

  for (const [section, content] of [
    ['integrated', mock.integrated_reading],
    ['hexagram', mock.hexagram_reading],
  ] as const) {
    for (let index = 0; index < content.length; index += 3) {
      writeSseEvent(res, 'delta', { section, text: content.slice(index, index + 3) });
      await new Promise(resolve => setTimeout(resolve, 120));
    }
  }
  writeSseEvent(res, 'complete', {
    integratedReading: mock.integrated_reading,
    hexagramReading: mock.hexagram_reading,
    readingId: null,
    remaining: 0,
  });
  res.end();
}

/** 独立的 POST + SSE 接口：让浏览器在模型仍生成时就逐字收到解读。 */
export async function handleReadingStream(req: Request, res: Response, ctx: TrpcContext) {
  const requestId = createReadingRequestId();
  res.setHeader('X-Request-ID', requestId);
  const clientIp = ctx.req.ip || ctx.req.socket?.remoteAddress || 'unknown';
  const rateLimitDate = getTodayDate();
  await createAiRequestLog({ requestId, date: rateLimitDate, ipHash: hashClientIp(clientIp) }).catch(error => {
    logReadingEvent('error', 'request_log_create_failed', {
      requestId,
      message: error instanceof Error ? error.message : 'unknown',
    });
  });

  const requestedLocale: GenerateInput['locale'] = req.body?.locale === 'en-US' ? 'en-US' : req.body?.locale === 'zh-TW' ? 'zh-TW' : 'zh-CN';
  const parsedInput = ReadingStreamInputSchema.safeParse(req.body);
  if (!parsedInput.success) {
    logReadingEvent('error', 'invalid_input', { requestId });
    await updateAiRequestLog(requestId, { status: 'rejected', httpStatus: 400, failureKind: 'invalid_input' });
    return res.status(400).json({ error: localized(requestedLocale, '占卜参数格式无效，请重新起卦。', 'The casting data is invalid. Please cast again.', '占卜參數格式無效，請重新起卦。'), requestId });
  }
  const { turnstileToken, ...readingInput } = parsedInput.data;
  const locale = readingInput.locale;
  const castingError = getCastingValidationError(readingInput);
  if (castingError) {
    logReadingEvent('error', 'invalid_casting', { requestId, reason: castingError });
    await updateAiRequestLog(requestId, {
      status: 'rejected',
      httpStatus: 400,
      failureKind: 'invalid_casting',
    });
    return res.status(400).json({
      error: localized(locale, '排盘校验失败，请刷新页面后重新起卦。', 'Casting validation failed. Refresh and cast again.', '排盤校驗失敗，請重新整理頁面後重新起卦。'),
      requestId,
    });
  }
  if (process.env.NODE_ENV === 'development' && process.env.MOCK_READING_STREAM === 'true') {
    await writeDevelopmentMockStream(res, locale);
    return;
  }
  if (!ENV.deepseekApiKey) {
    logReadingEvent('error', 'missing_api_key', { requestId });
    await updateAiRequestLog(requestId, { status: 'rejected', httpStatus: 412, failureKind: 'missing_api_key' });
    return res.status(412).json({ error: localized(locale, '解读服务尚未配置，请稍后再试。', 'The reading service is not configured. Please try again later.', '解讀服務尚未設定，請稍後再試。'), requestId });
  }

  let rateLimitConsumed = false;
  let turnstileRequired = false;
  let turnstileVerified = false;
  let rateCheck: { allowed: boolean; remaining: number };
  try {
    rateCheck = await checkAndIncrementIpLimit(clientIp, rateLimitDate, FREE_WITHOUT_TURNSTILE);
    if (!rateCheck.allowed) {
      turnstileRequired = true;
      if (!turnstileToken) {
        await updateAiRequestLog(requestId, {
          status: 'challenge_required',
          httpStatus: 403,
          turnstileRequired: 1,
          failureKind: 'turnstile_required',
        });
        return res.status(403).json({
          error: localized(locale, '今日已完成 5 次解读，请先完成人机验证后继续。', 'You have completed five readings today. Please verify that you are human to continue.', '今日已完成 5 次解讀，請先完成人機驗證後繼續。'),
          code: 'TURNSTILE_REQUIRED',
          siteKey: ENV.turnstileSiteKey,
          requestId,
        });
      }

      const verification = await verifyTurnstileToken({
        token: turnstileToken,
        remoteIp: clientIp,
        expectedHostname: req.hostname,
      });
      if (!verification.success) {
        logReadingEvent('error', 'turnstile_failed', { requestId, errorCodes: verification.errorCodes });
        await updateAiRequestLog(requestId, {
          status: 'challenge_failed',
          httpStatus: 403,
          turnstileRequired: 1,
          failureKind: 'turnstile_failed',
        });
        return res.status(403).json({
          error: localized(locale, '人机验证未通过或已过期，请重新验证。', 'Verification failed or expired. Please try again.', '人機驗證未通過或已過期，請重新驗證。'),
          code: 'TURNSTILE_FAILED',
          siteKey: ENV.turnstileSiteKey,
          requestId,
        });
      }
      turnstileVerified = true;
      rateCheck = await checkAndIncrementIpLimit(clientIp, rateLimitDate, DAILY_LIMIT);
      if (!rateCheck.allowed) {
        throw new TRPCError({
          code: 'TOO_MANY_REQUESTS',
          message: localized(locale, `今日解读次数已达上限（每天最多 ${DAILY_LIMIT} 次），请明天再来使用吧～`, `Today's reading limit (${DAILY_LIMIT}) has been reached. Please return tomorrow.`, `今日解讀次數已達上限（每天最多 ${DAILY_LIMIT} 次），請明天再來使用吧～`),
        });
      }
    }
    rateLimitConsumed = true;
    await updateAiRequestLog(requestId, {
      status: 'accepted',
      turnstileRequired: turnstileRequired ? 1 : 0,
      turnstileVerified: turnstileVerified ? 1 : 0,
    });
  } catch (error) {
    const publicError = error instanceof TRPCError ? error : getDeepSeekError(error, locale);
    logReadingEvent('error', 'rate_limit_rejected', {
      requestId,
      code: publicError.code,
    });
    await updateAiRequestLog(requestId, {
      status: 'rejected',
      httpStatus: getHttpStatus(publicError),
      turnstileRequired: turnstileRequired ? 1 : 0,
      turnstileVerified: turnstileVerified ? 1 : 0,
      failureKind: publicError.code,
    });
    return res.status(getHttpStatus(publicError)).json({ error: publicError.message, requestId });
  }

  beginSseResponse(res);

  const disconnectController = new AbortController();
  const abortOnDisconnect = () => {
    if (!res.writableEnded) disconnectController.abort();
  };
  res.once('close', abortOnDisconnect);

  const attemptPartials: Array<Record<ReadingSection, string>> = [];
  let totalEstimatedCostMicros = 0;
  let totalPromptCacheHitTokens = 0;
  let totalPromptCacheMissTokens = 0;
  let totalCompletionTokens = 0;
  let attemptCount = 0;
  let latestUpstreamRequestId: string | null = null;
  try {
    let generated: Awaited<ReturnType<typeof streamDeepSeekReading>> | null = null;
    let lastError: unknown;

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const budgetReserved = await reserveAiBudget(rateLimitDate, attempt === 1);
      if (!budgetReserved) {
        await notifyBudgetLimitOnce(rateLimitDate);
        throw new TRPCError({
          code: 'TOO_MANY_REQUESTS',
          message: localized(locale, '今日网站整体 AI 使用额度已达上限，请明天再来使用吧～', "Today's shared AI allowance has been reached. Please return tomorrow.", '今日網站整體 AI 使用額度已達上限，請明天再來使用吧～'),
        });
      }
      attemptCount = attempt;
      const partial: Record<ReadingSection, string> = { integrated: '', hexagram: '' };
      attemptPartials.push(partial);
      if (attempt > 1) {
        writeSseEvent(res, 'reset', { requestId, attempt });
        writeSseEvent(res, 'retry', { requestId, attempt });
      }

      try {
        generated = await streamDeepSeekReading({
          apiKey: ENV.deepseekApiKey,
          model: ENV.deepseekModel,
          messages: [
            {
              role: 'system',
              content: locale === 'en-US'
                ? 'You are a rigorous I Ching cultural interpreter. First understand and directly answer the user\'s exact question, then explain the answer from the supplied hexagram and source text. Never change the subject of the question or invent a person, relationship, motive, event, or certainty. Do not map ancient characters or situations literally onto an unrelated modern question. Use only the supplied source material. Return every user-visible word in natural English and never output Chinese characters.'
                : locale === 'zh-TW'
                  ? '你是嚴謹的《周易》文化解讀者。先準確理解並直接回應使用者原問題，再以提供的卦象與經文說明理由。不得擅自改變問題對象，不得猜測未說明的人物、關係、動機或事件；古代經文情境不得生搬硬套。只能引用提供的經文原文，不得杜撰。全部輸出必須使用繁體中文，包含標題與引文，不得混入簡體字。'
                : '你是严谨的《周易》文化解读者。首要任务是准确理解并直接回应用户原问题，再以已提供的卦象和经文说明理由。不得擅自改变问题对象，不得猜测未说明的人物身份、关系、动机或事件；古代经文情境不得生搬硬套到现代问题。解读时只能引用用户提供的经文原文，不得自行补充或杜撰经文。全部输出使用简体中文。',
            },
            { role: 'user', content: buildPrompt(readingInput) },
          ],
          timeoutMs: getDeepSeekTimeoutMs(),
          signal: disconnectController.signal,
          onDelta: (section: ReadingSection, text: string) => {
            if (locale === 'en-US' && containsCjk(text)) {
              throw new DeepSeekStreamError('invalid_response');
            }
            partial[section] += text;
            writeSseEvent(res, 'delta', { section, text });
          },
        });
        if (locale === 'en-US' && (containsCjk(generated.integrated_reading) || containsCjk(generated.hexagram_reading))) {
          throw new DeepSeekStreamError('invalid_response');
        }
        const estimatedCostMicros = estimateDeepSeekCostMicros(generated.diagnostics);
        await settleAiBudget(rateLimitDate, estimatedCostMicros);
        totalEstimatedCostMicros += estimatedCostMicros;
        totalPromptCacheHitTokens += generated.diagnostics.promptCacheHitTokens;
        totalPromptCacheMissTokens += generated.diagnostics.promptCacheMissTokens;
        totalCompletionTokens += generated.diagnostics.completionTokens;
        latestUpstreamRequestId = generated.diagnostics.upstreamRequestId;
        logReadingEvent('info', 'upstream_complete', {
          requestId,
          attempt,
          model: ENV.deepseekModel,
          ...generated.diagnostics,
        });
        break;
      } catch (error) {
        lastError = error;
        const streamError = error instanceof DeepSeekStreamError ? error : null;
        const diagnostics = streamError?.diagnostics;
        const hasReportedUsage = Boolean(
          diagnostics
          && (diagnostics.promptCacheHitTokens > 0
            || diagnostics.promptCacheMissTokens > 0
            || diagnostics.completionTokens > 0),
        );
        const failedAttemptCost = hasReportedUsage && diagnostics
          ? estimateDeepSeekCostMicros(diagnostics)
          : getAiBudgetConfig().reservationMicros;
        await settleAiBudget(rateLimitDate, failedAttemptCost).catch(settleError => {
          logReadingEvent('error', 'budget_settlement_failed', {
            requestId,
            attempt,
            message: settleError instanceof Error ? settleError.message : 'unknown',
          });
        });
        totalEstimatedCostMicros += failedAttemptCost;
        totalPromptCacheHitTokens += diagnostics?.promptCacheHitTokens ?? 0;
        totalPromptCacheMissTokens += diagnostics?.promptCacheMissTokens ?? 0;
        totalCompletionTokens += diagnostics?.completionTokens ?? 0;
        latestUpstreamRequestId = diagnostics?.upstreamRequestId ?? latestUpstreamRequestId;
        const cause = streamError?.cause;
        const causeCode = typeof cause === 'object' && cause !== null && 'code' in cause
          ? String((cause as { code?: unknown }).code ?? '') || null
          : null;
        logReadingEvent('error', 'upstream_failed', {
          requestId,
          attempt,
          kind: streamError?.kind ?? 'unknown',
          causeCode,
          ...streamError?.diagnostics,
        });
        if (attempt === 2 || disconnectController.signal.aborted) break;
      }
    }

    if (!generated) throw lastError ?? new DeepSeekStreamError('upstream');

    const validated = DeepSeekReadingSchema.safeParse(generated);
    if (!validated.success) throw new DeepSeekStreamError('invalid_response');
    const readingId = await saveAuthenticatedReading(readingInput, ctx, validated.data);
    writeSseEvent(res, 'complete', {
      integratedReading: validated.data.integrated_reading,
      hexagramReading: validated.data.hexagram_reading,
      readingId,
      remaining: rateCheck.remaining,
      requestId,
    });
    await updateAiRequestLog(requestId, {
      status: 'complete',
      httpStatus: 200,
      attemptCount,
      promptCacheHitTokens: totalPromptCacheHitTokens,
      promptCacheMissTokens: totalPromptCacheMissTokens,
      completionTokens: totalCompletionTokens,
      estimatedCostMicros: totalEstimatedCostMicros,
      upstreamRequestId: latestUpstreamRequestId,
    });
    logReadingEvent('info', 'request_complete', {
      requestId,
      attemptCount,
      estimatedCostMicros: totalEstimatedCostMicros,
    });
  } catch (error) {
    if (rateLimitConsumed) {
      const refunded = await refundIpLimit(clientIp, rateLimitDate);
      logReadingEvent(refunded ? 'info' : 'error', 'quota_refund', { requestId, refunded });
      rateLimitConsumed = false;
    }
    if (!disconnectController.signal.aborted) {
      const publicError = getDeepSeekError(error, locale);
      const currentPartial = attemptPartials.at(-1) ?? { integrated: '', hexagram: '' };
      const bestPartial = attemptPartials.reduce((best, candidate) => {
        const bestLength = best.integrated.length + best.hexagram.length;
        const candidateLength = candidate.integrated.length + candidate.hexagram.length;
        return candidateLength > bestLength ? candidate : best;
      }, currentPartial);
      if (bestPartial !== currentPartial) {
        writeSseEvent(res, 'reset', { requestId, attempt: 'restore' });
        if (bestPartial.integrated) {
          writeSseEvent(res, 'delta', { section: 'integrated', text: bestPartial.integrated });
        }
        if (bestPartial.hexagram) {
          writeSseEvent(res, 'delta', { section: 'hexagram', text: bestPartial.hexagram });
        }
      }
      const partialAvailable = bestPartial.integrated.length > 0 || bestPartial.hexagram.length > 0;
      writeSseEvent(res, 'error', {
        message: publicError.message,
        requestId,
        partialAvailable,
      });
      logReadingEvent('error', 'request_failed', {
        requestId,
        code: publicError.code,
        partialAvailable,
      });
      await updateAiRequestLog(requestId, {
        status: publicError.code === 'TOO_MANY_REQUESTS' ? 'budget_rejected' : 'failed',
        httpStatus: getHttpStatus(publicError),
        attemptCount,
        promptCacheHitTokens: totalPromptCacheHitTokens,
        promptCacheMissTokens: totalPromptCacheMissTokens,
        completionTokens: totalCompletionTokens,
        estimatedCostMicros: totalEstimatedCostMicros,
        upstreamRequestId: latestUpstreamRequestId,
        failureKind: publicError.code,
      });
    }
  } finally {
    res.off('close', abortOnDisconnect);
    if (!res.writableEnded && !res.destroyed) res.end();
  }
}

export const readingRouter = router({
  generate: publicProcedure
    .input(GenerateInputSchema)
    .mutation(async () => {
      // 旧整包接口没有 Turnstile 与预算预留能力，关闭以避免成为绕过入口。
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: '此解读入口已停用，请刷新页面后重试。',
      });
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
    .input(z.object({ id: z.number().int().min(1) }))
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
