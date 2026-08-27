# Railway 线上部署状态记录

**记录时间：** 2026-08-28（GMT+8）
**项目：** `beneficial-courtesy`  
**环境：** `production`  
**Web Service：** `Liuyao-mvp`

| 检查项 | 观察结果 | 结论 |
|---|---|---|
| GitHub 部署 | Railway 显示提交 `caf0ffd fix: fail startup when Railway port is invalid`，状态为 `ACTIVE` / `Deployment successful`。 | 最新已推送代码已从 GitHub 部署成功。 |
| 启动日志 | `NODE_ENV=production node dist/index.js`；匿名 OAuth 禁用；`Server listening on port 8080.`。 | Railway 已注入端口，应用按严格生产端口策略正常启动。 |
| MySQL | 已在同一项目创建名称为 `MySQL` 的数据库服务及附带 `mysql-volume`；控制台显示 `Online`。 | 后续 Web Service 可通过 Railway 私有引用变量 `${{MySQL.MYSQL_URL}}` 连接，保持数据库不公开。 |
| 暴露状态 | Railway 标记为 `Unexposed service`。 | 尚未生成临时公开域名，符合先配置数据库和健康检查、后公开测试的顺序。 |
| 运行地区与副本 | 控制台显示 `EU West`、`1 Replica`。 | 仅作当前状态记录，尚未变更地区或扩缩容。 |
| 计费提示 | 控制台显示试用提示 `30 days or $5.00 left`。 | 尚未修改支付方式、预算告警、硬上限或备份设置。 |
| 构建器 | Railway Settings 显示默认 Railpack 与 `node@24.19.0`。 | 首次构建成功；后续仍会显式配置项目锁定的 pnpm 安装/构建命令。 |
| 私有网络 | UI 显示候选内部端点 `liuyao-mvp.railway.internal`。 | 没有提交任何端点名称改动；数据库仍应仅用项目私有引用变量连接。 |
| GitHub 源状态 | Railway Source 设置现显示 `Ritadu128/Liuyao-mvp` 与 `main` 分支，先前的 `GitHub Repo not found` 红色提示已消失。 | 来源恢复后已审阅待应用变更，发现其“新值为空”会删除来源，故已安全丢弃；当前为 0 项待应用变更。 |
| 自动部署实测 | 先前空提交 `9f9371f` 未触发部署；重新检查确认当时 Railway 的 `Auto deploy` 开关处于关闭状态。 | 用户确认后已开启 `Auto deploys when pushed to GitHub`，随后 `main` 的真实文档提交 `9f68aae` 自动创建 Railway 部署并已成功切流。 |
| 自动部署后健康检查 | 自动触发的新活动版本成功完成 Railway 部署流程；从独立网络路径再次访问 `/health` 返回 `200 {"status":"ok"}`。 | 已端到端验证 GitHub 推送 → Railway 构建/迁移/健康检查 → 公网应用与私有 MySQL 就绪。 |
| 随喜素材发布 | 用户授权公开的微信、支付宝二维码、公开联系邮箱和 Ko-fi 链接已随提交 `244305c` 推送到 `main`。 | 正式域名轮询确认 `/support/wechat-pay.jpg` 返回 200 且为 117,915 字节 JPEG、`/support/alipay-pay.webp` 返回 200 且为 43,188 字节，同时 `/health` 返回 200；初次 889 字节响应是新部署切换前的错误页面，随后版本已切流。 |
| 正式域名复验 | `https://liuyao.win/`、`/privacy`、`/disclaimer`、`/health` 及两张收款码均返回 HTTPS 200。 | 首页/政策页为 889 字节 SPA HTML 文档属正常；抽检已返回 CSP、HSTS（含子域）、nosniff、严格 Referrer-Policy 与摄像头 Permissions-Policy。 |
| Railway GitHub App | 用户提供的 GitHub 设置截图显示 `Only select repositories`，且唯一被选择的仓库为 `Ritadu128/Liuyao-mvp`；用户已确认点击 Save。 | 这是当前最直接的授权证据。沙箱中的 GitHub CLI 使用的是受限集成令牌，对安装与 Webhook 查询返回 401/403，不能用其错误推断用户的 Railway App 授权无效。 |
| 基础生产配置 | 用户确认后已提交有效 EU West 单副本、`DATABASE_URL=${{MySQL.MYSQL_URL}}`、`TRUST_PROXY=true`、锁定构建命令、`pnpm start`、`pnpm db:migrate` 与 `/health`。 | 未启用 MySQL Public Access、TCP Proxy、备份或预算控制；DeepSeek Secret 由后续独立变量变更应用。 |
| 数据库引用 | 已新增服务变量 `DATABASE_URL`，值在 Railway UI 中保持掩码，来源为 `${{MySQL.MYSQL_URL}}` 私有引用。 | 已随成功部署应用；未读取、复制或记录数据库密码。 |
| 构建命令 | 已设置 `pnpm install --frozen-lockfile && pnpm build`。 | 已随成功部署应用；构建日志显示 pnpm 10.4.1 以锁定依赖完成构建。 |
| 启动命令 | 已设置 `pnpm start`。 | 已随重新部署提交；该命令会以生产模式执行已验证的 Node 入口。 |
| 部署前迁移 | 已设置 `pnpm db:migrate`。 | 已随重新部署提交；Railway 会在新应用版本切流前执行已提交的 Drizzle 迁移。 |
| 重新部署状态 | 新部署 `3a664098` 已为 `Active`，Web Service 与 MySQL 均为 Online。 | 已通过 Railway 部署流程。 |
| 临时公网域名 | 已生成 `https://liuyao-mvp-production.up.railway.app`，目标端口为平台注入的 8080。 | 用于正式域名绑定前的验收，保留为回退访问地址。 |
| Railway 自定义域名 | 已在 Railway 添加 `liuyao.win`，目标端口为 8080；用户在 Cloudflare 保存了精确 CNAME 与 TXT（根域 CNAME 为橙云代理，验证 TXT 为 DNS only）。 | Railway 完成 DNS 验证和路由后，从独立网络路径访问 `https://liuyao.win/health` 已返回 `200 {"status":"ok"}`，正式域名可用。根域通过 Cloudflare 代理/扁平化，CNAME 类型查询没有直接 Answer 属正常现象。 |
| 公网健康检查 | 从独立网络路径访问 `/health` 返回 HTTP 200 与 `{"status":"ok"}`。 | 已端到端确认 HTTPS、应用进程及私有 MySQL 就绪；响应未泄露数据库细节。 |
| 安全头抽检 | 临时域名首页和 `/health` 均返回 CSP、HSTS、`X-Content-Type-Options: nosniff`、`Referrer-Policy` 与摄像头限制的 Permissions-Policy。 | 仅为部署后抽检，不构成第三方安全认证。 |
| 无 DeepSeek Key 行为 | 对 `reading.generate` 的有效格式请求返回 HTTP 412 / `PRECONDITION_FAILED` 与“解读服务尚未配置，请稍后再试。”；响应设置 `Cache-Control: no-store`。 | 已验证不会因缺少 Key 暴露配置细节；代码在该检查后才执行 IP 额度递增，因此该测试不消耗 IP 限额且未调用外部模型。 |
| 同源 JSON 写入防护 | 以伪造外部 Origin 发起 `reading.generate` POST 返回 HTTP 403 与“跨域写请求不被允许”。 | 已抽检 API 写操作在到达 tRPC/AI 逻辑前拒绝跨站请求；未调用 AI。 |
| tRPC 输入校验 | 以错误类型和缺失字段请求 `reading.generate` 返回 HTTP 400 / `BAD_REQUEST`，并返回 Zod 类型校验结果。 | 已抽检畸形输入无法进入后续业务流程；响应 `Cache-Control: no-store`。 |
| 首页可达性 | 浏览器导航到临时域名根路径时获得页面标题“六爻占卜 · 易经卦象解读”。 | 已确认首页可达；浏览器扩展导致后续截图读取失败，故完整交互与摄像头/分享真机验收仍待进行。 |
| 公开路由与 HTTPS | `/`、`/privacy`、`/disclaimer`、`/health` 均为 HTTPS HTTP 200；HTTP 根路径返回 301 到 HTTPS。 | 已覆盖首页、法务入口与健康端点的基础可达性；未对用户的本地摄像头、移动分享和完整投掷流程作真机验收。 |
| 迁移与启动验证 | Deploy Logs 显示 `pnpm db:migrate`、`drizzle-kit migrate`、`migrations applied successfully!`，随后 `pnpm start` 以生产模式启动并监听平台端口 8080。 | 已验证本次部署的 MySQL 迁移与应用启动；Railway 将 `/health` 配置纳入部署流程，部署已被平台标记成功。 |
| DeepSeek Secret 应用 | 作者在 `Liuyao-mvp` 的 production Service Variables 中自行添加 `DEEPSEEK_API_KEY`，UI 仅展示掩码；应用此前显示 `Edited · 1 Change`。 | 经作者明确确认点击 Deploy 后，Railway 创建新部署 `b5927a20` 并显示 `Active` / `Deployment successful`；未读取、复制或记录变量值。 |
| 真实 AI 解读验收 | 在新部署 Active 后，对正式同源 `reading.generate` 发起一次最小、有效的批处理请求。 | 返回 HTTP 200，响应同时含 `integratedReading` 与 `hexagramReading`，无 tRPC error；仅检查结构和状态，未记录完整问题、生成内容或 Secret。该有效请求会计入其来源 IP 的当日十次额度。 |
| 变量生效前受控拒绝 | 在变量已填写但尚未点击 Apply/Deploy 时，正确格式的同源解读请求返回 HTTP 412 / `PRECONDITION_FAILED`。 | 说明运行中的旧实例尚未加载新变量；请求在额度递增和外部模型调用之前被拒绝，未消耗 DeepSeek 调用或 IP 额度。 |

> 本记录不包含任何密码、Token、数据库连接串、API Key 或私有日志内容。临时域名已完成公开可达、数据库就绪、法务路由、HTTPS 重定向、跨站写入拒绝与 tRPC 输入校验抽检；GitHub 最小授权、仓库可见性和自动部署开关已恢复，且已由真实文档提交成功复验。`liuyao.win` 已完成 Railway/Cloudflare 配置、正式 HTTPS 健康检查和一次真实 DeepSeek 结构化解读验收；授权随喜素材已随生产部署发布。真机摄像头/分享、二维码实际扫码、备份和成本控制仍待作者在真实设备或升级后完成。
