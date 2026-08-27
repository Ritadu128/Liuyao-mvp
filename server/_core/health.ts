import type { RequestHandler } from "express";
import { sql } from "drizzle-orm";
import { getDb } from "../db";

/**
 * 校验匿名应用是否已具备提供服务的最小条件。
 * 此函数不记录、不返回数据库地址、账号或错误详情，以免健康检查成为信息泄露面。
 */
export async function isDatabaseReady(): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  try {
    await db.execute(sql`SELECT 1`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Railway 在每次部署切流前调用此端点。只有应用与其私有 MySQL 都可用时才返回 200。
 */
export function createHealthHandler(
  checkReady: () => Promise<boolean> = isDatabaseReady,
): RequestHandler {
  return async (_req, res) => {
    const ready = await checkReady();
    res.status(ready ? 200 : 503).json({ status: ready ? "ok" : "unavailable" });
  };
}
