# Railway 部署准备与运维计划

**状态：** 准备中，尚未创建 Railway 项目、服务或数据库。
**目标域名：** `liuyao.win`（由用户本人 Cloudflare 账户管理）。
**部署原则：** 单一 Node 服务同时承载 React 静态页面与 `/api/trpc`，MySQL 仅通过 Railway 项目内私有网络连接；所有账户、付款方式、密码、Token 和 API Key 由用户本人保管和填写。

## 当前项目适配结论

| 项目 | 当前状态 | Railway 准备动作 |
|---|---|---|
| 构建 | `pnpm build` 生成 `dist/public` 与 `dist/index.js` | Railway Build Command 使用 `pnpm install --frozen-lockfile && pnpm build`。 |
| 启动 | `pnpm start` 以生产模式执行 `node dist/index.js`，严格监听 Railway 提供的 `PORT`；端口占用时直接失败，不会改用相邻端口。 | Railway Start Command 使用 `pnpm start`，不要手动覆盖 Railway 注入的 `PORT`。 |
| 数据库 | Drizzle + MySQL，迁移命令为 `pnpm db:migrate` | Web 服务部署前运行迁移；应用 `DATABASE_URL` 以引用变量关联 Railway MySQL 的私有连接串。 |
| 健康检查 | `GET /health` 仅在 MySQL 私有连接可用时返回 HTTP 200 与 `{ "status": "ok" }`；不可用时返回无细节的 503。 | Railway Healthcheck Path 设置为 `/health`，建议部署超时设置为 300 秒。 |
| 机密 | `.env` 被 Git 忽略；DeepSeek Key 仅由服务器读取 | `DATABASE_URL` 与 `DEEPSEEK_API_KEY` 在 Railway Variables 中设置，建议对 DeepSeek Key 使用 Seal。 |
| 同域 | Express 同时服务网页和 API | 仅部署一个 Web Service，避免跨域 Cookie/CORS 与摄像头权限复杂度。 |

## Railway 临时域名与自定义域名顺序

1. 创建 Railway 项目；从 GitHub 仓库 `Ritadu128/Liuyao-mvp` 创建 Web Service，并在**同一项目**新增 Railway MySQL 服务。
2. 设置 Build Command `pnpm install --frozen-lockfile && pnpm build`、Start Command `pnpm start`、Pre-deploy Command `pnpm db:migrate`、Healthcheck Path `/health` 和无机密环境变量；由用户在 Railway 后台填写/密封敏感变量。
3. 在 Web Service 的 Networking 中选择 **Generate Domain**，获得 `*.up.railway.app` 临时域名并完成部署测试。
4. 通过 Railway 临时域名验证首页、匿名占卜、数据库迁移、限流、法律页、导出、AI 未配置降级和 HTTPS。
5. 在 Railway Web Service 的 Networking 中新增 Custom Domain：`liuyao.win`。Railway 会给出一条精确的 CNAME 目标与一条精确的 TXT 所有权验证记录。
6. **只有收到 Railway 实际生成的值后**，才在 Cloudflare 添加 CNAME 和 TXT；不得猜测或沿用其他项目的记录值。Cloudflare 橙云代理开启时，SSL/TLS 设为 `Full`，不要设为 `Full (Strict)`，以符合 Railway 官方互操作说明。
7. Railway 显示验证成功且证书已签发后，再在 Cloudflare 测试 `https://liuyao.win`；最后决定是否启用根域的 `www` 跳转。

## MySQL 迁移与备份

| 范围 | 实施方式 | 用户需确认/操作 |
|---|---|---|
| 迁移 | Web Service 部署前运行 `pnpm db:migrate`；迁移只使用私有 `DATABASE_URL`。 | 首次上线前在 Railway 变量中引用同项目 MySQL URL。 |
| 原生备份 | Railway MySQL 文档建议使用其原生 Backups 功能。 | 用户需在 MySQL 服务中确认套餐可用性、保留期与恢复流程。 |
| 独立备份 | 如原生备份不可用或保留期不符合要求，再增加一个短生命周期的 Railway Cron Service，每日导出并加密写入**用户本人**控制的对象存储。 | 需要用户选择对象存储、创建桶和填写其凭据；此方案有额外存储/网络费用。 |
| 恢复演练 | 每季度在隔离数据库验证一次可恢复备份。 | 恢复操作不可自动在生产执行，需用户明确确认。 |

Railway Cron 适合运行后自行退出的短任务，官方示例明确将每日数据库备份列为适用场景；调度使用 UTC，最短间隔为 5 分钟。

## 支出提醒与成本控制

在 Railway Workspace Usage 页面设置：

- **Custom email alert（软提醒）**：达到用户设定预算后发邮件但服务继续运行。
- **Hard limit（硬上限）**：达到上限后 Railway 会停止工作负载，防止继续计费；此设置可能造成站点下线。
- 应用和 MySQL 使用同项目私有网络，避免数据库 TCP Proxy 带来的额外公网网络出口费用。

预算金额、告警邮箱和是否启用硬上限属于用户财务决定，部署时需由用户本人确认。

## 待用户返回后执行的最少操作

1. 使用本人 GitHub 账号登录 Railway，并授权 Railway 仅访问 `Ritadu128/Liuyao-mvp`。
2. 创建 Railway 项目，添加 GitHub Web Service 和同项目 MySQL 服务。
3. 在 Railway 变量中设置 `DATABASE_URL=${{MySQL.MYSQL_URL}}`，在拥有新的 Key 后添加并 Seal `DEEPSEEK_API_KEY`；其余变量参考 `.env.example`。
4. 在 Railway 开通临时域名后将链接发给本任务，以便进行公开测试。
5. 确认预算告警邮箱、软提醒金额和硬上限金额；启用 MySQL 原生备份或选择独立备份目的地。
6. 通过临时域名验证后，确认是否将 `liuyao.win` 绑定为正式域名；Railway 会提供需要写入 Cloudflare 的 CNAME/TXT 精确值。

## 来源

1. [Railway MySQL 文档](https://docs.railway.com/databases/mysql)：同项目 MySQL 变量、私有网络及 Backups 建议。
2. [Railway 域名文档](https://docs.railway.com/networking/domains/working-with-domains)：临时域名、自定义域名 CNAME/TXT、证书及 Cloudflare SSL 配置。
3. [Railway Healthchecks 文档](https://docs.railway.com/guides/healthchecks)：`PORT` 与 `/health` 部署就绪检查。
4. [Railway Variables 文档](https://docs.railway.com/guides/variables)：服务变量、引用变量和密封变量。
5. [Railway Cost Control 文档](https://docs.railway.com/pricing/cost-control)：邮件软提醒、硬上限及私有网络的成本边界。
6. [Railway Cron Jobs 文档](https://docs.railway.com/guides/cron-jobs)：短任务、UTC 调度和每日备份场景。
