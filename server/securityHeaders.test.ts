import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { applySecurityHeaders, enforceSameOriginApiMutations, handleMalformedJson } from './_core/security';

function createResponse() {
  const headers = new Map<string, string>();
  const response = {
    setHeader: vi.fn((name: string, value: string) => headers.set(name, value)),
    status: vi.fn(() => response),
    json: vi.fn(),
  };
  return { response: response as unknown as Response, headers, raw: response };
}

function createRequest(overrides: Partial<Request> = {}) {
  const request = {
    method: 'GET',
    path: '/',
    secure: false,
    headers: {},
    get: (name: string) => {
      const key = name.toLowerCase();
      return (request.headers as Record<string, string | undefined>)[key];
    },
    ...overrides,
  };
  return request as unknown as Request;
}

afterEach(() => vi.unstubAllEnvs());

describe('HTTP 安全中间件', () => {
  it('为 API 响应设置安全头并禁止缓存', () => {
    const { response, headers } = createResponse();
    const next = vi.fn();

    applySecurityHeaders(createRequest({ path: '/api/trpc/reading.generate' }), response, next);

    expect(headers.get('Content-Security-Policy')).toContain("frame-ancestors 'none'");
    expect(headers.get('Content-Security-Policy')).toContain("script-src 'self' 'wasm-unsafe-eval'");
    expect(headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(headers.get('Permissions-Policy')).toContain('camera=(self)');
    expect(headers.get('Cache-Control')).toBe('no-store');
    expect(next).toHaveBeenCalledOnce();
  });

  it('仅在生产 HTTPS 请求中发送 HSTS', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { response, headers } = createResponse();
    applySecurityHeaders(createRequest({ secure: true }), response, vi.fn());
    expect(headers.get('Strict-Transport-Security')).toBe('max-age=31536000; includeSubDomains');
  });

  it('仅在开发环境放行 Vite 的内联预加载与热更新连接', () => {
    vi.stubEnv('NODE_ENV', 'development');
    const { response, headers } = createResponse();
    applySecurityHeaders(createRequest(), response, vi.fn());
    expect(headers.get('Content-Security-Policy')).toContain("script-src 'self' 'wasm-unsafe-eval' 'unsafe-inline'");
    expect(headers.get('Content-Security-Policy')).toContain(' ws:');
  });

  it('允许同源 JSON 写请求和无 Origin 的 CLI 请求', () => {
    const sameOrigin = createRequest({
      method: 'POST',
      headers: { origin: 'https://gua.example.com', host: 'gua.example.com', 'content-type': 'application/json' },
    });
    const { response } = createResponse();
    const next = vi.fn();
    enforceSameOriginApiMutations(sameOrigin, response, next);
    expect(next).toHaveBeenCalledOnce();

    const noOrigin = createRequest({ method: 'POST', headers: { host: 'gua.example.com' } });
    enforceSameOriginApiMutations(noOrigin, response, next);
    expect(next).toHaveBeenCalledTimes(2);
  });

  it('将畸形 JSON 统一转换为不含解析细节的 400 响应', () => {
    const { response, raw } = createResponse();
    const parseError = Object.assign(new SyntaxError('unexpected token internal detail'), { body: '{invalid' });
    handleMalformedJson(parseError, createRequest(), response, vi.fn());
    expect(raw.status).toHaveBeenCalledWith(400);
    expect(raw.json).toHaveBeenCalledWith({ error: '请求 JSON 格式无效' });
  });

  it('拒绝跨域或非 JSON 的浏览器写请求', () => {
    const { response, raw } = createResponse();
    const crossOrigin = createRequest({
      method: 'POST',
      headers: { origin: 'https://attacker.example', host: 'gua.example.com', 'content-type': 'application/json' },
    });
    enforceSameOriginApiMutations(crossOrigin, response, vi.fn());
    expect(raw.status).toHaveBeenCalledWith(403);

    const wrongContentType = createRequest({
      method: 'POST',
      headers: { origin: 'https://gua.example.com', host: 'gua.example.com', 'content-type': 'text/plain' },
    });
    enforceSameOriginApiMutations(wrongContentType, response, vi.fn());
    expect(raw.status).toHaveBeenCalledWith(415);
  });
});
