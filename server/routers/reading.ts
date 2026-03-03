import { z } from 'zod';
import { publicProcedure, router } from '../_core/trpc';
import { getDb } from '../db';
import { readings } from '../../drizzle/schema';
import { eq, desc } from 'drizzle-orm';
import { ENV } from '../_core/env';

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
  "integrated_reading": "综合解读内容（400-600字）",
  "hexagram_reading": "卦象解读内容（包含：①引用卦辞/象曰原文并解释其含义 ②结合问题的现代解释 ③故事化解读，约300-400字）"
}

要求：
1. 综合解读：结合问题本质、本卦卦义、动爻变化、变卦走向，给出整体判断和建议，字数控制在400-600字
2. 卦象解读：先引用经文原文，再用现代语言解释，最后用一个生动的故事或比喻来阐释卦义
3. 语言：文白相间，既有古典韵味又通俗易懂
4. 态度：客观中立，不做绝对预测，引导积极思考
5. 【重要】经文引用规则：只能引用【经文原文】区块中提供的原句，不得自行补充、杜撰或引用未出现在输入中的经文。若某字段标注"（缺失）"，则在对应位置直接留空，不得替换为其他经文
6. 严格返回合法 JSON，不要有额外文字`;
}

// ── Router ───────────────────────────────────────────────────────────────────
export const readingRouter = router({
  generate: publicProcedure
    .input(GenerateInputSchema)
    .mutation(async ({ input, ctx }) => {
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

  // 获取历史记录列表
  list: publicProcedure
    .input(z.object({ limit: z.number().int().min(1).max(50).default(20) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const rows = await db
        .select()
        .from(readings)
        .orderBy(desc(readings.createdAt))
        .limit(input.limit);
      return rows;
    }),

  // 获取单条记录
  getById: publicProcedure
    .input(z.object({ id: z.number().int() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const rows = await db
        .select()
        .from(readings)
        .where(eq(readings.id, input.id))
        .limit(1);
      return rows[0] ?? null;
    }),
});
