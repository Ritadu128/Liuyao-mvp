import { describe, it, expect, vi, beforeEach } from 'vitest';

// 模拟 getTodayDate 和 DB 操作，单独测试限流逻辑
const DAILY_LIMIT = 10;

function getTodayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

// 内存版限流逻辑（与 reading.ts 逻辑一致）
function createRateLimiter(limit: number) {
  const store = new Map<string, number>();

  function getKey(ip: string, date: string) {
    return `${ip}::${date}`;
  }

  return {
    check(ip: string): { allowed: boolean; remaining: number } {
      const today = getTodayDate();
      const key = getKey(ip, today);
      const current = store.get(key) ?? 0;

      if (current >= limit) {
        return { allowed: false, remaining: 0 };
      }

      store.set(key, current + 1);
      return { allowed: true, remaining: limit - (current + 1) };
    },
    getCount(ip: string): number {
      const today = getTodayDate();
      return store.get(getKey(ip, today)) ?? 0;
    },
  };
}

describe('IP Rate Limiter', () => {
  it('should allow first request', () => {
    const limiter = createRateLimiter(DAILY_LIMIT);
    const result = limiter.check('1.2.3.4');
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(9);
  });

  it('should track count correctly', () => {
    const limiter = createRateLimiter(DAILY_LIMIT);
    for (let i = 0; i < 5; i++) limiter.check('1.2.3.4');
    expect(limiter.getCount('1.2.3.4')).toBe(5);
  });

  it('should block after reaching limit', () => {
    const limiter = createRateLimiter(DAILY_LIMIT);
    for (let i = 0; i < DAILY_LIMIT; i++) limiter.check('1.2.3.4');
    const result = limiter.check('1.2.3.4');
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('should not affect other IPs', () => {
    const limiter = createRateLimiter(DAILY_LIMIT);
    for (let i = 0; i < DAILY_LIMIT; i++) limiter.check('1.2.3.4');
    const result = limiter.check('5.6.7.8');
    expect(result.allowed).toBe(true);
  });

  it('remaining should decrease with each call', () => {
    const limiter = createRateLimiter(DAILY_LIMIT);
    const r1 = limiter.check('10.0.0.1');
    const r2 = limiter.check('10.0.0.1');
    const r3 = limiter.check('10.0.0.1');
    expect(r1.remaining).toBe(9);
    expect(r2.remaining).toBe(8);
    expect(r3.remaining).toBe(7);
  });
});
