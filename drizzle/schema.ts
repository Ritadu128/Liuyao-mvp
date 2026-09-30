import { int, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// TODO: Add your tables here

// 占卜记录表
export const readings = mysqlTable("readings", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId"),
  question: text("question").notNull(),
  // 六爻原始数据：JSON 字符串，存储 6 个爻值 (6/7/8/9)
  linesJson: text("linesJson").notNull(),
  // 本卦
  originalKey: varchar("originalKey", { length: 4 }).notNull(),
  originalName: varchar("originalName", { length: 32 }).notNull(),
  originalBits: varchar("originalBits", { length: 6 }).notNull(),
  // 变卦（无动爻时为空）
  changedKey: varchar("changedKey", { length: 4 }),
  changedName: varchar("changedName", { length: 32 }),
  changedBits: varchar("changedBits", { length: 6 }),
  // 动爻列表：JSON 字符串，如 "[1,4]"
  movingLinesJson: text("movingLinesJson").notNull(),
  // LLM 生成的解读
  integratedReading: text("integratedReading"),
  hexagramReading: text("hexagramReading"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Reading = typeof readings.$inferSelect;
export type InsertReading = typeof readings.$inferInsert;

// IP 限流表：记录每个 IP 每天的调用次数
export const ipRateLimits = mysqlTable("ipRateLimits", {
  id: int("id").autoincrement().primaryKey(),
  ip: varchar("ip", { length: 64 }).notNull(),
  date: varchar("date", { length: 10 }).notNull(), // YYYY-MM-DD
  count: int("count").notNull().default(0),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  uniqueIndex("ip_rate_limits_ip_date_unique").on(table.ip, table.date),
]);

export type IpRateLimit = typeof ipRateLimits.$inferSelect;

// AI 每日预算：金额以“微元”（1 元 = 1,000,000）记录，避免浮点误差。
export const aiDailyBudgets = mysqlTable("aiDailyBudgets", {
  id: int("id").autoincrement().primaryKey(),
  date: varchar("date", { length: 10 }).notNull(),
  spentMicros: int("spentMicros").notNull().default(0),
  reservedMicros: int("reservedMicros").notNull().default(0),
  requestCount: int("requestCount").notNull().default(0),
  upstreamCallCount: int("upstreamCallCount").notNull().default(0),
  alertSentAt: timestamp("alertSentAt"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  uniqueIndex("ai_daily_budgets_date_unique").on(table.date),
]);

export type AiDailyBudget = typeof aiDailyBudgets.$inferSelect;

// AI 请求审计日志：不保存原始 IP、问题或解读正文，便于凭请求编号排错和核算费用。
export const aiRequestLogs = mysqlTable("aiRequestLogs", {
  requestId: varchar("requestId", { length: 32 }).primaryKey(),
  date: varchar("date", { length: 10 }).notNull(),
  ipHash: varchar("ipHash", { length: 32 }).notNull(),
  status: varchar("status", { length: 32 }).notNull(),
  httpStatus: int("httpStatus"),
  turnstileRequired: int("turnstileRequired").notNull().default(0),
  turnstileVerified: int("turnstileVerified").notNull().default(0),
  attemptCount: int("attemptCount").notNull().default(0),
  promptCacheHitTokens: int("promptCacheHitTokens").notNull().default(0),
  promptCacheMissTokens: int("promptCacheMissTokens").notNull().default(0),
  completionTokens: int("completionTokens").notNull().default(0),
  estimatedCostMicros: int("estimatedCostMicros").notNull().default(0),
  upstreamRequestId: varchar("upstreamRequestId", { length: 128 }),
  failureKind: varchar("failureKind", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AiRequestLog = typeof aiRequestLogs.$inferSelect;
