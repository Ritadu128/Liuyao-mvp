# 安全审计与整改记录

**审计日期：** 2026-08-27  
**范围：** 匿名六爻应用的 Express/tRPC 服务端、DeepSeek 调用边界、数据库限流、前端渲染与导出、浏览器摄像头、依赖树和部署配置。  
**审计性质：** 本文是项目维护者进行的代码与本地运行检查记录，**不是第三方渗透测试报告或安全认证**。

## 审计依据

本次加固参考 Express 的生产安全建议（TLS、输入验证、依赖审计和减少框架指纹）[1]、OWASP 的 HTTP 响应头建议（CSP、反点击劫持、`nosniff`、Referrer-Policy、HSTS、缓存控制和受限 CORS）[2]，以及 MDN 对 Permissions-Policy 的说明（可对摄像头等浏览器能力设置来源白名单）[3]。CSP 是 XSS 防御的补充而不是输入处理的替代品[4]。

## 已通过

| 检查项 | 结论 | 验证方法 |
|---|---|---|
| DeepSeek Key 边界 | 当前代码仅从服务端 `DEEPSEEK_API_KEY` 读取 Key；浏览器没有该变量或直连地址。 | 搜索客户端与服务端请求路径；审查 `server/routers/reading.ts`。 |
| 匿名历史隔离 | 匿名问题和 AI 解读保存在浏览器 localStorage，不写入服务器 `readings` 表。 | 审查 `ResultPage`、`useLocalHistory` 与 `reading.generate`。 |
| SQL 注入防护 | IP 限流使用 Drizzle 参数化 SQL 模板；读取历史使用 Drizzle 查询构造器。 | 审查数据库调用，没有字符串拼接 SQL。 |
| SSRF 边界 | DeepSeek 上游 URL 是代码内固定的 `https://api.deepseek.com/chat/completions`，不接受用户 URL。 | 审查 `callDeepSeek`。 |
| DeepSeek 失败保护 | 已配置前置 Key 检查、3–60 秒超时钳制、上游结构校验与数据库不可用时失败关闭。 | 单元测试和代码审查。 |
| IP 限额抗并发 | `(ip, date)` 唯一索引与原子 UPSERT 强制每日 10 次限制。 | 已执行 MySQL 迁移并运行限流测试。 |
| 匿名跨站状态 | 当前匿名路径不依赖 Cookie；未配置 OAuth 时认证路由不会注册。 | 启动日志和路由条件检查。 |

## 已修复

| 编号 | 风险或缺口 | 整改内容 | 验证方法 |
|---|---|---|---|
| SEC-01 | Express 默认暴露 `X-Powered-By`，且没有安全响应头。 | 禁用 `x-powered-by`；新增 CSP、`X-Content-Type-Options: nosniff`、`Referrer-Policy`、`X-Frame-Options: DENY`、COOP、CORP 和 `Permissions-Policy`。 | `server/securityHeaders.test.ts`。 |
| SEC-02 | API 响应可含问题与模型解读，可能被缓存。 | 为 `/api/*` 设置 `Cache-Control: no-store`。 | `server/securityHeaders.test.ts`。 |
| SEC-03 | HTTP 场景若错误使用 HSTS 可能破坏本地开发或不安全代理环境。 | 仅在 `NODE_ENV=production` 且 Express 判定 `req.secure` 时返回 HSTS；代理头仅在 `TRUST_PROXY=true` 时由 Express 信任。 | 单元测试与启动配置审查。 |
| SEC-04 | 浏览器跨站表单/脚本可尝试向公开 tRPC mutation 发起写请求。 | 对有 `Origin` 的写请求要求同源和 `application/json`；不设置宽泛 CORS 头。 | `server/securityHeaders.test.ts`。 |
| SEC-05 | 解读接口允许过宽的卦象和经文输入。 | 为卦序、二进制卦象、卦名、问题长度、经文长度、动爻数量和重复动爻增加 Zod 约束。 | `server/reading.anonymous.test.ts`。 |
| SEC-06 | 浏览器中存在不必要的经文调试日志和 `window.__hexDebug` 全局对象。 | 移除生产调试日志与全局对象，错误日志不再输出任意异常对象。 | `useHexagramData.ts` 审查。 |
| SEC-07 | 初始生产依赖树存在严重传递依赖告警。 | 移除未引用的 AWS SDK 和 Streamdown/Mermaid 路径；升级 Express 5、Axios、Drizzle 与 tRPC；使用版本化 pnpm 工作区覆盖固定其余兼容补丁。 | `pnpm audit --prod --audit-level=low` 最终返回 `No known vulnerabilities found`。 |
| SEC-08 | 模型输出经旧 Markdown 链路会引入 Mermaid/DOMPurify 等额外攻击面与大体积依赖。 | 统一替换为 `react-markdown` + `remark-gfm`，不添加 `rehypeRaw`，因此模型输出中的原始 HTML 不会作为 DOM 执行。 | 代码搜索、`pnpm check`、`pnpm test` 与生产构建。 |

## 仍需处理

| 编号 | 项目 | 处理计划 |
|---|---|---|
| SEC-09 | DeepSeek 真实成功与失败响应 | 等项目作者提供新 Key 后，在不记录 Key 的前提下完成真实端到端测试，并核对错误不会包含授权头或问题正文。 |
| SEC-10 | Markdown 依赖的长期维护 | 当前统一使用不启用原始 HTML 的 `react-markdown`；升级依赖时仍需保留该约束，并在渲染器配置变更后复测恶意 HTML/链接。 |
| SEC-11 | 依赖最小化与前端体积 | 已移除两组未使用高风险依赖，但通用 UI 模板仍有可精简空间。应在稳定版本后逐步移除未引用包，并进行代码分割，避免一次性大重构。 |
| SEC-12 | 限流范围 | 当前按单 IP 限制，无法完全防御分布式代理、NAT 共享或 IPv6 地址轮换。上线后可结合反向代理/WAF 规则和滥用监控补强。 |

## 需要部署环境验证

| 项目 | 原因与验证方法 |
|---|---|
| HTTPS 与 HSTS | 本地 HTTP 不应发送 HSTS。上线后通过真实 HTTPS 域名检查 `Strict-Transport-Security`，并确认有效证书续期机制。 |
| `TRUST_PROXY` | 仅当 Node 后方存在可信反向代理时设为 `true`。部署后分别从代理和直连路径测试 `X-Forwarded-For`，确认 IP 限额不可通过伪造头绕过。 |
| CSP/Permissions-Policy | 生产构建加载 Google Fonts、MediaPipe CDN/WASM/模型时，浏览器控制台不应出现 CSP 拦截；同时摄像头只允许本域顶级页面调用。 |
| OAuth Cookie | 当前匿名模式不启用 OAuth。未来启用时必须复核 `Secure`、`HttpOnly`、`SameSite`、Cookie 域与 CSRF 状态参数。 |
| MySQL 最小权限与备份 | 生产数据库账户应仅授予应用所需的库/表权限；应启用加密备份、恢复演练、访问日志和明确的数据保留期限。 |
| 摄像头生命周期 | 在 HTTPS 真机上测试允许、拒绝、切后台、路由离开和停止识别，确认媒体轨道立即停止且视频不上传服务器。 |

## 验证命令

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm build
pnpm audit --prod --audit-level=low
```

## 参考资料

[1]: https://expressjs.com/en/advanced/best-practice-security/ "Express: Production Best Practices: Security"
[2]: https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html "OWASP: HTTP Security Response Headers Cheat Sheet"
[3]: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Permissions-Policy "MDN: Permissions-Policy header"
[4]: https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CSP "MDN: Content Security Policy"
