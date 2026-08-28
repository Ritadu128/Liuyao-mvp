import type { NextFunction, Request, Response } from 'express';

function createContentSecurityPolicy(isDevelopment = false) {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    `script-src 'self' 'wasm-unsafe-eval'${isDevelopment ? " 'unsafe-inline'" : ''}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    `connect-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com${isDevelopment ? ' ws:' : ''}`,
    "worker-src 'self' blob:",
  ].join('; ');
}

const CONTENT_SECURITY_POLICY = createContentSecurityPolicy();

const PERMISSIONS_POLICY = [
  'camera=(self)',
  'microphone=()',
  'geolocation=()',
  'payment=()',
  'usb=()',
  'interest-cohort=()',
].join(', ');

/** 为所有响应提供与当前第三方资源清单兼容的安全响应头。 */
export function applySecurityHeaders(req: Request, res: Response, next: NextFunction) {
  res.setHeader(
    'Content-Security-Policy',
    createContentSecurityPolicy(process.env.NODE_ENV === 'development'),
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', PERMISSIONS_POLICY);
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');

  // API 结果可能包含用户问题与模型解读，不能被浏览器或中间缓存复用。
  if (req.path.startsWith('/api/')) {
    res.setHeader('Cache-Control', 'no-store');
  }

  // HSTS 只在生产 HTTPS 请求上发送，避免影响本地 HTTP 开发。
  if (process.env.NODE_ENV === 'production' && req.secure) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  next();
}

/**
 * 匿名 tRPC 不使用 Cookie，但同源 JSON 写请求限制仍能阻断跨站表单/脚本滥用。
 * 无 Origin 的非浏览器调用（健康检查、CLI）保持兼容；生产不设置 CORS 放行头。
 */
/** 将 JSON 解析失败统一为不泄露解析细节的 400 JSON 响应。 */
export function handleMalformedJson(error: unknown, _req: Request, res: Response, next: NextFunction) {
  if (error instanceof SyntaxError && 'body' in error) {
    return res.status(400).json({ error: '请求 JSON 格式无效' });
  }
  next(error);
}

export function enforceSameOriginApiMutations(req: Request, res: Response, next: NextFunction) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();

  const origin = req.get('origin');
  if (!origin) return next();

  try {
    const requestOrigin = new URL(origin);
    if (requestOrigin.host !== req.get('host')) {
      return res.status(403).json({ error: '跨域写请求不被允许' });
    }
  } catch {
    return res.status(403).json({ error: '无效的请求来源' });
  }

  const contentType = req.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) {
    return res.status(415).json({ error: '写请求必须使用 application/json' });
  }

  next();
}

export const SECURITY_HEADERS = {
  contentSecurityPolicy: CONTENT_SECURITY_POLICY,
  permissionsPolicy: PERMISSIONS_POLICY,
};
