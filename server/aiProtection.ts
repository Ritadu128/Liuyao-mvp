import { createHmac, randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { aiDailyBudgets, aiRequestLogs } from '../drizzle/schema';
import { ENV } from './_core/env';
import { notifyOwner } from './_core/notification';
import { getDb } from './db';
import type { DeepSeekStreamDiagnostics } from './readingStream';

const MICROS_PER_CNY = 1_000_000;

function parsePositiveNumber(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function toMicros(cny: number): number {
  return Math.max(0, Math.round(cny * MICROS_PER_CNY));
}

export function getAiBudgetConfig() {
  return {
    dailyLimitMicros: toMicros(parsePositiveNumber(ENV.aiDailyBudgetCny, 30)),
    reservationMicros: toMicros(parsePositiveNumber(ENV.aiRequestReservationCny, 0.10)),
  };
}

export function estimateDeepSeekCostMicros(
  usage: Pick<DeepSeekStreamDiagnostics,
    'promptCacheHitTokens' | 'promptCacheMissTokens' | 'completionTokens'>,
): number {
  const hitRate = parsePositiveNumber(ENV.deepseekCacheHitCnyPerMillion, 0.05);
  const missRate = parsePositiveNumber(ENV.deepseekCacheMissCnyPerMillion, 2.20);
  const outputRate = parsePositiveNumber(ENV.deepseekOutputCnyPerMillion, 8.80);
  const cny = (
    usage.promptCacheHitTokens * hitRate
    + usage.promptCacheMissTokens * missRate
    + usage.completionTokens * outputRate
  ) / 1_000_000;
  return toMicros(cny);
}

function affectedRows(result: unknown): number {
  const header = (Array.isArray(result) ? result[0] : result) as { affectedRows?: number } | undefined;
  return header?.affectedRows ?? 0;
}

export async function reserveAiBudget(date: string, countRequest: boolean): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error('budget_database_unavailable');
  const { dailyLimitMicros, reservationMicros } = getAiBudgetConfig();
  const requestIncrement = countRequest ? 1 : 0;
  const result = await db.execute(sql`
    INSERT INTO ${aiDailyBudgets} (
      ${aiDailyBudgets.date}, ${aiDailyBudgets.spentMicros}, ${aiDailyBudgets.reservedMicros},
      ${aiDailyBudgets.requestCount}, ${aiDailyBudgets.upstreamCallCount}
    ) VALUES (${date}, 0, ${reservationMicros}, ${requestIncrement}, 0)
    ON DUPLICATE KEY UPDATE
      ${aiDailyBudgets.reservedMicros} = IF(
        ${aiDailyBudgets.spentMicros} + ${aiDailyBudgets.reservedMicros} + ${reservationMicros} <= ${dailyLimitMicros},
        ${aiDailyBudgets.reservedMicros} + ${reservationMicros},
        ${aiDailyBudgets.reservedMicros}
      ),
      ${aiDailyBudgets.requestCount} = IF(
        ${aiDailyBudgets.spentMicros} + ${aiDailyBudgets.reservedMicros} + ${reservationMicros} <= ${dailyLimitMicros},
        ${aiDailyBudgets.requestCount} + ${requestIncrement},
        ${aiDailyBudgets.requestCount}
      )
  `);
  return affectedRows(result) > 0;
}

export async function settleAiBudget(date: string, actualCostMicros: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error('budget_database_unavailable');
  const { reservationMicros } = getAiBudgetConfig();
  await db.execute(sql`
    UPDATE ${aiDailyBudgets}
    SET ${aiDailyBudgets.reservedMicros} = GREATEST(${aiDailyBudgets.reservedMicros} - ${reservationMicros}, 0),
        ${aiDailyBudgets.spentMicros} = ${aiDailyBudgets.spentMicros} + ${actualCostMicros},
        ${aiDailyBudgets.upstreamCallCount} = ${aiDailyBudgets.upstreamCallCount} + 1,
        ${aiDailyBudgets.updatedAt} = CURRENT_TIMESTAMP
    WHERE ${aiDailyBudgets.date} = ${date}
  `);
}

export async function notifyBudgetLimitOnce(date: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const result = await db.execute(sql`
    UPDATE ${aiDailyBudgets}
    SET ${aiDailyBudgets.alertSentAt} = CURRENT_TIMESTAMP,
        ${aiDailyBudgets.updatedAt} = CURRENT_TIMESTAMP
    WHERE ${aiDailyBudgets.date} = ${date}
      AND ${aiDailyBudgets.alertSentAt} IS NULL
  `);
  if (affectedRows(result) === 0) return;

  const budgetCny = parsePositiveNumber(ENV.aiDailyBudgetCny, 30);
  try {
    const sent = await notifyOwner({
      title: '众见六爻：今日 AI 预算已达到上限',
      content: `${date} 的 AI 调用预算已达到约 ${budgetCny} 元，系统已自动停止新的 AI 解读。请检查 Railway 的 [Reading] 日志和 DeepSeek 用量。`,
    });
    if (!sent) console.error('[Reading] budget_alert_delivery_failed');
  } catch (error) {
    console.error('[Reading] budget_alert_unavailable:', error instanceof Error ? error.message : error);
  }
}

export function hashClientIp(ip: string): string {
  const salt = ENV.logHashSalt || ENV.cookieSecret || ENV.turnstileSecretKey || ENV.deepseekApiKey;
  if (!salt) return 'unavailable';
  return createHmac('sha256', salt).update(ip).digest('hex').slice(0, 32);
}

export async function createAiRequestLog(input: {
  requestId: string;
  date: string;
  ipHash: string;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(aiRequestLogs).values({
    ...input,
    status: 'received',
  }).onDuplicateKeyUpdate({ set: { status: 'received' } });
}

type AiRequestLogUpdate = {
  status?: string;
  httpStatus?: number | null;
  turnstileRequired?: number;
  turnstileVerified?: number;
  attemptCount?: number;
  promptCacheHitTokens?: number;
  promptCacheMissTokens?: number;
  completionTokens?: number;
  estimatedCostMicros?: number;
  upstreamRequestId?: string | null;
  failureKind?: string | null;
};

export async function updateAiRequestLog(
  requestId: string,
  fields: AiRequestLogUpdate,
): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    await db.update(aiRequestLogs).set(fields).where(sql`${aiRequestLogs.requestId} = ${requestId}`);
  } catch (error) {
    console.error('[Reading] request_log_update_failed:', error instanceof Error ? error.message : error);
  }
}

type TurnstileResponse = {
  success?: boolean;
  hostname?: string;
  action?: string;
  'error-codes'?: string[];
};

export async function verifyTurnstileToken(input: {
  token: string;
  remoteIp: string;
  expectedHostname: string;
}): Promise<{ success: boolean; errorCodes: string[] }> {
  if (!ENV.turnstileSecretKey) return { success: false, errorCodes: ['missing-secret'] };
  if (!input.token || input.token.length > 2_048) return { success: false, errorCodes: ['invalid-token'] };

  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret: ENV.turnstileSecretKey,
        response: input.token,
        remoteip: input.remoteIp,
        idempotency_key: randomUUID(),
      }),
    });
    const result = await response.json() as TurnstileResponse;
    const hostnameMatches = !result.hostname || result.hostname === input.expectedHostname;
    const actionMatches = !result.action || result.action === 'reading';
    return {
      success: response.ok && result.success === true && hostnameMatches && actionMatches,
      errorCodes: result['error-codes'] ?? [],
    };
  } catch {
    return { success: false, errorCodes: ['siteverify-unavailable'] };
  }
}
