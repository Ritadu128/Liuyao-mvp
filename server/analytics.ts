import { createHmac } from 'node:crypto';
import type { Request, Response } from 'express';
import { and, desc, gte, inArray, lte, sql } from 'drizzle-orm';
import { analyticsEvents, aiDailyBudgets, aiRequestLogs } from '../drizzle/schema';
import { ENV } from './_core/env';
import { getDb } from './db';

const EVENT_NAMES = new Set([
  'page_view',
  'question_submitted',
  'casting_completed',
  'history_opened',
  'reading_exported',
]);

let analyticsTableReady: Promise<void> | null = null;

async function ensureAnalyticsTable() {
  if (analyticsTableReady) return analyticsTableReady;
  analyticsTableReady = (async () => {
    const db = await getDb();
    if (!db) throw new Error('analytics_database_unavailable');
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS analyticsEvents (
        id int AUTO_INCREMENT NOT NULL PRIMARY KEY,
        date varchar(10) NOT NULL,
        eventName varchar(48) NOT NULL,
        path varchar(128) NOT NULL,
        sessionHash varchar(32) NOT NULL,
        referrerHost varchar(128),
        deviceType varchar(16) NOT NULL,
        country varchar(8),
        createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX analytics_events_date_event_idx (date, eventName),
        INDEX analytics_events_date_path_idx (date, path),
        INDEX analytics_events_date_session_idx (date, sessionHash)
      )
    `);
  })().catch(error => {
    analyticsTableReady = null;
    throw error;
  });
  return analyticsTableReady;
}

function chinaDate(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
}

function dateDaysAgo(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return chinaDate(date);
}

function hashSession(id: string): string {
  const salt = ENV.logHashSalt || ENV.cookieSecret || ENV.deepseekApiKey || 'liuyao-analytics';
  return createHmac('sha256', salt).update(id).digest('hex').slice(0, 32);
}

function deviceType(userAgent: string): string {
  if (/ipad|tablet/i.test(userAgent)) return 'tablet';
  if (/mobile|iphone|android/i.test(userAgent)) return 'mobile';
  return 'desktop';
}

function safeReferrerHost(value: unknown): string | null {
  if (typeof value !== 'string' || !value || value.length > 500) return null;
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host && host !== 'liuyao.win' && host !== 'www.liuyao.win' ? host.slice(0, 128) : null;
  } catch {
    return null;
  }
}

export async function recordAnalyticsEvent(req: Request, res: Response) {
  const body = req.body as Record<string, unknown> | null;
  const eventName = typeof body?.eventName === 'string' ? body.eventName : '';
  const path = typeof body?.path === 'string' ? body.path : '';
  const sessionId = typeof body?.sessionId === 'string' ? body.sessionId : '';
  if (!EVENT_NAMES.has(eventName)
    || !/^\/[a-z0-9/_-]*$/i.test(path)
    || path.length > 128
    || !/^[a-zA-Z0-9-]{16,80}$/.test(sessionId)) {
    return res.status(400).json({ ok: false });
  }

  try {
    await ensureAnalyticsTable();
    const db = await getDb();
    if (!db) return res.status(503).json({ ok: false });
    await db.insert(analyticsEvents).values({
      date: chinaDate(),
      eventName,
      path,
      sessionHash: hashSession(sessionId),
      referrerHost: safeReferrerHost(body?.referrer),
      deviceType: deviceType(req.get('user-agent') ?? ''),
      country: (req.get('cf-ipcountry') ?? '').slice(0, 8) || null,
    });
    return res.status(202).json({ ok: true });
  } catch (error) {
    console.error('[Analytics] event_write_failed:', error instanceof Error ? error.message : error);
    return res.status(503).json({ ok: false });
  }
}

function isDashboardHost(req: Request): boolean {
  if (!ENV.isProduction) return true;
  return req.hostname.toLowerCase() === ENV.analyticsDashboardHost.toLowerCase();
}

type CloudflareDay = { date: string; requests: number; visitors: number; bandwidth: number };

async function fetchCloudflareDaily(from: string, to: string): Promise<{
  configured: boolean; daily: CloudflareDay[]; error?: string;
}> {
  if (!ENV.cloudflareAnalyticsToken || !ENV.cloudflareZoneId) {
    return { configured: false, daily: [] };
  }
  const query = `query($zoneTag: string!, $filter: ZoneHttpRequestsAdaptiveGroupsFilter_InputObject!) {
    viewer { zones(filter: { zoneTag: $zoneTag }) {
      httpRequestsAdaptiveGroups(limit: 1000, filter: $filter, orderBy: [date_ASC]) {
        dimensions { date }
        sum { requests bytes }
        uniq { uniques }
      }
    } }
  }`;
  try {
    const response = await fetch('https://api.cloudflare.com/client/v4/graphql', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ENV.cloudflareAnalyticsToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        variables: { zoneTag: ENV.cloudflareZoneId, filter: { date_geq: from, date_leq: to } },
      }),
    });
    const payload = await response.json() as {
      data?: { viewer?: { zones?: Array<{ httpRequestsAdaptiveGroups?: Array<{
        dimensions?: { date?: string }; sum?: { requests?: number; bytes?: number }; uniq?: { uniques?: number };
      }> }> } };
      errors?: Array<{ message?: string }>;
    };
    if (!response.ok || payload.errors?.length) {
      return { configured: true, daily: [], error: payload.errors?.[0]?.message ?? `HTTP ${response.status}` };
    }
    const groups = payload.data?.viewer?.zones?.[0]?.httpRequestsAdaptiveGroups ?? [];
    return {
      configured: true,
      daily: groups.map(group => ({
        date: group.dimensions?.date ?? '',
        requests: Number(group.sum?.requests ?? 0),
        visitors: Number(group.uniq?.uniques ?? 0),
        bandwidth: Number(group.sum?.bytes ?? 0),
      })).filter(day => day.date),
    };
  } catch (error) {
    return { configured: true, daily: [], error: error instanceof Error ? error.message : '同步失败' };
  }
}

export async function getAnalyticsDashboard(req: Request, res: Response) {
  if (!isDashboardHost(req)) return res.status(404).json({ error: 'Not found' });
  // 正式环境由 Cloudflare Access 保护 data 子域名；该头代表已通过 Access。
  if (ENV.isProduction && !req.get('cf-access-authenticated-user-email')) {
    return res.status(401).json({ error: '请先通过数据看板身份验证。' });
  }

  const days = Math.min(Math.max(Number.parseInt(String(req.query.days ?? '30'), 10) || 30, 7), 90);
  const from = dateDaysAgo(days - 1);
  const to = chinaDate();
  try {
    await ensureAnalyticsTable();
    const db = await getDb();
    if (!db) return res.status(503).json({ error: '数据库暂不可用' });

    const eventFilter = and(gte(analyticsEvents.date, from), lte(analyticsEvents.date, to));
    const aiFilter = and(gte(aiRequestLogs.date, from), lte(aiRequestLogs.date, to));
    const [eventSummary] = await db.select({
      pageViews: sql<number>`SUM(CASE WHEN ${analyticsEvents.eventName} = 'page_view' THEN 1 ELSE 0 END)`,
      visitors: sql<number>`COUNT(DISTINCT CASE WHEN ${analyticsEvents.eventName} = 'page_view' THEN ${analyticsEvents.sessionHash} END)`,
      questions: sql<number>`SUM(CASE WHEN ${analyticsEvents.eventName} = 'question_submitted' THEN 1 ELSE 0 END)`,
      castings: sql<number>`SUM(CASE WHEN ${analyticsEvents.eventName} = 'casting_completed' THEN 1 ELSE 0 END)`,
    }).from(analyticsEvents).where(eventFilter);

    const [aiSummary] = await db.select({
      requests: sql<number>`COUNT(*)`,
      aiVisitors: sql<number>`COUNT(DISTINCT ${aiRequestLogs.ipHash})`,
      completed: sql<number>`SUM(CASE WHEN ${aiRequestLogs.status} = 'complete' THEN 1 ELSE 0 END)`,
      failed: sql<number>`SUM(CASE WHEN ${aiRequestLogs.status} IN ('failed','budget_rejected','rejected') THEN 1 ELSE 0 END)`,
      costMicros: sql<number>`COALESCE(SUM(${aiRequestLogs.estimatedCostMicros}), 0)`,
      tokens: sql<number>`COALESCE(SUM(${aiRequestLogs.promptCacheHitTokens} + ${aiRequestLogs.promptCacheMissTokens} + ${aiRequestLogs.completionTokens}), 0)`,
      turnstile: sql<number>`SUM(CASE WHEN ${aiRequestLogs.turnstileRequired} = 1 THEN 1 ELSE 0 END)`,
    }).from(aiRequestLogs).where(aiFilter);

    const eventDaily = await db.select({
      date: analyticsEvents.date,
      pageViews: sql<number>`SUM(CASE WHEN ${analyticsEvents.eventName} = 'page_view' THEN 1 ELSE 0 END)`,
      visitors: sql<number>`COUNT(DISTINCT CASE WHEN ${analyticsEvents.eventName} = 'page_view' THEN ${analyticsEvents.sessionHash} END)`,
      questions: sql<number>`SUM(CASE WHEN ${analyticsEvents.eventName} = 'question_submitted' THEN 1 ELSE 0 END)`,
      castings: sql<number>`SUM(CASE WHEN ${analyticsEvents.eventName} = 'casting_completed' THEN 1 ELSE 0 END)`,
    }).from(analyticsEvents).where(eventFilter).groupBy(analyticsEvents.date).orderBy(analyticsEvents.date);

    const aiDaily = await db.select({
      date: aiRequestLogs.date,
      completed: sql<number>`SUM(CASE WHEN ${aiRequestLogs.status} = 'complete' THEN 1 ELSE 0 END)`,
      failed: sql<number>`SUM(CASE WHEN ${aiRequestLogs.status} IN ('failed','budget_rejected','rejected') THEN 1 ELSE 0 END)`,
      costMicros: sql<number>`COALESCE(SUM(${aiRequestLogs.estimatedCostMicros}), 0)`,
      tokens: sql<number>`COALESCE(SUM(${aiRequestLogs.promptCacheHitTokens} + ${aiRequestLogs.promptCacheMissTokens} + ${aiRequestLogs.completionTokens}), 0)`,
    }).from(aiRequestLogs).where(aiFilter).groupBy(aiRequestLogs.date).orderBy(aiRequestLogs.date);

    const topPages = await db.select({
      path: analyticsEvents.path,
      views: sql<number>`COUNT(*)`,
      visitors: sql<number>`COUNT(DISTINCT ${analyticsEvents.sessionHash})`,
    }).from(analyticsEvents).where(and(eventFilter, sql`${analyticsEvents.eventName} = 'page_view'`))
      .groupBy(analyticsEvents.path).orderBy(desc(sql`COUNT(*)`)).limit(10);

    const devices = await db.select({
      name: analyticsEvents.deviceType,
      value: sql<number>`COUNT(*)`,
    }).from(analyticsEvents).where(and(eventFilter, sql`${analyticsEvents.eventName} = 'page_view'`))
      .groupBy(analyticsEvents.deviceType).orderBy(desc(sql`COUNT(*)`));

    const recentErrors = await db.select({
      requestId: aiRequestLogs.requestId,
      date: aiRequestLogs.date,
      status: aiRequestLogs.status,
      failureKind: aiRequestLogs.failureKind,
      httpStatus: aiRequestLogs.httpStatus,
      createdAt: aiRequestLogs.createdAt,
    }).from(aiRequestLogs).where(and(
      aiFilter,
      inArray(aiRequestLogs.status, ['failed', 'budget_rejected', 'rejected', 'challenge_failed']),
    )).orderBy(desc(aiRequestLogs.createdAt)).limit(12);

    const budgets = await db.select({
      date: aiDailyBudgets.date,
      spentMicros: aiDailyBudgets.spentMicros,
      requestCount: aiDailyBudgets.requestCount,
      upstreamCallCount: aiDailyBudgets.upstreamCallCount,
    }).from(aiDailyBudgets).where(and(gte(aiDailyBudgets.date, from), lte(aiDailyBudgets.date, to)))
      .orderBy(aiDailyBudgets.date);

    const cloudflare = await fetchCloudflareDaily(from, to);
    return res.json({
      generatedAt: new Date().toISOString(), from, to, days,
      summary: {
        pageViews: Number(eventSummary?.pageViews ?? 0),
        visitors: Number(eventSummary?.visitors ?? 0),
        questions: Number(eventSummary?.questions ?? 0),
        castings: Number(eventSummary?.castings ?? 0),
        aiRequests: Number(aiSummary?.requests ?? 0),
        aiVisitors: Number(aiSummary?.aiVisitors ?? 0),
        aiCompleted: Number(aiSummary?.completed ?? 0),
        aiFailed: Number(aiSummary?.failed ?? 0),
        costCny: Number(aiSummary?.costMicros ?? 0) / 1_000_000,
        tokens: Number(aiSummary?.tokens ?? 0),
        turnstile: Number(aiSummary?.turnstile ?? 0),
      },
      eventDaily, aiDaily: aiDaily.map(day => ({ ...day, costCny: Number(day.costMicros) / 1_000_000 })),
      topPages, devices, recentErrors,
      budgets: budgets.map(day => ({ ...day, spentCny: day.spentMicros / 1_000_000 })),
      cloudflare,
    });
  } catch (error) {
    console.error('[Analytics] dashboard_query_failed:', error instanceof Error ? error.message : error);
    return res.status(500).json({ error: '数据看板暂时无法读取，请稍后刷新。' });
  }
}
