import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

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