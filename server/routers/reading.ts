import { z } from 'zod';
import { publicProcedure, router } from '../_core/trpc';
import { invokeLLM } from '../_core/llm';
import { getDb } from '../db';
import { readings } from '../../drizzle/schema';
import { eq, desc } from 'drizzle-orm';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Test fixture loader ─────────────────────────────────────────────────────
/**
 * 当环境变量 FORCE_GUA=<key> 时（如 "01"），忽略前端传入的卦象数据，
 * 直接从 server/test-fixtures/<key>.json 读取卦象并构造 generate 输入。
 * 返回 null 表示未启用测试模式。
 */
function loadForceGuaFixture(): {
  key: string;
  name: string;
  bits: string;
  gua_ci: string;
  xiang_yue: string;
  yao_ci: Record<string, string>;
} | null {
  const forceGua = process.env.FORCE_GUA;
  if (!forceGua) return null;

  const fixturePath = path.resolve(
    __dirname,
    '../test-fixtures',
    `${forceGua}.json`
  );

  if (!fs.existsSync(fixturePath)) {
    console.warn(`[Reading] FORCE_GUA=${forceGua} 但找不到 fixture 文件: ${fixturePath}`);
    return null;
  }

  try {
    const raw = fs.readFileSync(fixturePath, 'utf-8');
    const data = JSON.parse(raw);
    console.log(`[Reading] 🧪 测试模式：FORCE_GUA=${forceGua}，使用 ${data.name}（第${data.key}卦）`);
    return data;
  } catch (e) {
    console.error(`[Reading] FORCE_GUA fixture 解析失败:`, e);
    return null;
  }
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

  return `你是一位精通《周易》六爻占卜的易学大师，请为以下占卜结果提供专业解读。

【占卜信息】
问题：${input.question}
本卦：${input.originalName}（第${input.originalKey}卦）
${changedDesc}
${movingDesc}

【经文原文】
卦辞：${input.guaCi}
象曰：${input.xiangYue}
${input.yaoCi.length > 0 ? '动爻爻辞：\n' + yaoCiText : ''}

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
5. 严格返回合法 JSON，不要有额外文字`;
}

// ── Router ───────────────────────────────────────────────────────────────────
export const readingRouter = router({
  generate: publicProcedure
    .input(GenerateInputSchema)
    .mutation(async ({ input, ctx }) => {
      // ── 测试模式：FORCE_GUA 覆盖前端传入的卦象数据 ──────────────────────
      const fixture = loadForceGuaFixture();
      const testMode = fixture !== null;

      let effectiveInput = input;
      if (fixture) {
        // 用第一爻（初九）作为动爻，让解读更丰富
        const movingLines = [1];
        effectiveInput = {
          ...input, // 保留 question（来自前端）
          originalKey: fixture.key,
          originalName: fixture.name,
          originalBits: fixture.bits,
          changedKey: null,
          changedName: null,
          changedBits: null,
          movingLines,
          guaCi: fixture.gua_ci,
          xiangYue: fixture.xiang_yue,
          yaoCi: movingLines.map(pos => ({
            position: pos,
            text: fixture.yao_ci[String(pos)] ?? '',
          })),
          linesJson: JSON.stringify(
            fixture.bits.split('').map(b => (b === '1' ? 9 : 8))
          ),
        };
        console.log('[Reading] 🧪 effectiveInput.originalName:', effectiveInput.originalName);
      }

      // ── 调用 LLM 生成解读 ─────────────────────────────────────────────────
      const prompt = buildPrompt(effectiveInput);

      let integratedReading = '';
      let hexagramReading = '';

      try {
        const response = await invokeLLM({
          messages: [
            {
              role: 'system',
              content: '你是精通《周易》六爻占卜的易学大师，擅长将古典易理与现代生活相结合，提供深刻而实用的占卜解读。'
            },
            { role: 'user', content: prompt }
          ],
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'reading_result',
              strict: true,
              schema: {
                type: 'object',
                properties: {
                  integrated_reading: { type: 'string', description: '综合解读，400-600字' },
                  hexagram_reading: { type: 'string', description: '卦象解读，含经文引用、现代解释、故事化解读' },
                },
                required: ['integrated_reading', 'hexagram_reading'],
                additionalProperties: false,
              },
            },
          },
        });

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
            question: effectiveInput.question,
            linesJson: effectiveInput.linesJson,
            originalKey: effectiveInput.originalKey,
            originalName: effectiveInput.originalName,
            originalBits: effectiveInput.originalBits,
            changedKey: effectiveInput.changedKey ?? null,
            changedName: effectiveInput.changedName ?? null,
            changedBits: effectiveInput.changedBits ?? null,
            movingLinesJson: JSON.stringify(effectiveInput.movingLines),
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
        ...(testMode ? { testMode: true } : {}),
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
