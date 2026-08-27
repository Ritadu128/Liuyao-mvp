# Railway 生产部署与运维状态

**状态：** 已上线，后续运维事项受当前 Trial 套餐边界限制。

**记录更新：** 2026-08-28（GMT+8）

**正式域名：** `liuyao.win`（由项目作者本人 Cloudflare 账户管理）。

本项目采用单一 Node 服务同时承载 React 静态页面与 `/api/trpc`，MySQL 只通过同一 Railway 项目的私有网络连接。Railway、Cloudflare、GitHub 和 DeepSeek 均由项目作者本人持有；密码、Token、数据库连接串和 API Key 不写入本仓库、文档或前端构建产物。

## 当前已上线架构

| 项目 | 已应用状态 | 验证或约束 |
|---|---|---|
| Railway 项目与环境 | 项目 `beneficial-courtesy` 的 `production` 环境。 | 当前 UI 显示 Web Service 与 MySQL 均为 Online，单副本位于 EU West。 |
| Web Service | `Liuyao-mvp` 从 `Ritadu128/Liuyao-mvp` 的 `main` 分支部署。 | GitHub 自动部署已由真实文档提交验证；保留 Railway 临时域名作为回退入口。 |
| 私有 MySQL | 同项目 `MySQL` 服务，附带 `mysql-volume`。 | 应用只使用 `DATABASE_URL=${{MySQL.MYSQL_URL}}` 私有引用；未开启 Public Access 或 TCP Proxy。 |
| 构建、迁移与启动 | Build 为 `pnpm install --frozen-lockfile && pnpm build`；Pre-deploy 为 `pnpm db:migrate`；Start 为 `pnpm start`。 | 最近一次部署成功完成迁移与健康检查；应用在 Railway 注入的 `PORT` 上监听。 |
| 健康检查 | `GET /health`。 | 仅当私有 MySQL 可访问时返回 HTTP 200 与 `{ "status": "ok" }`；不输出连接错误或 Secret。 |
| 域名与 TLS | `liuyao.win` 为 Railway Custom Domain，经 Cloudflare 根域 CNAME 橙云代理。 | Cloudflare SSL/TLS 为 `Full`；正式 HTTPS 域名和临时 Railway 域名均保留。 |
| DeepSeek Secret | `DEEPSEEK_API_KEY` 已由作者在 `Liuyao-mvp` 的 production Service Variables 中自行填写，UI 仅显示掩码值。 | 已应用变量变更并完成新的 Active 部署；不得在聊天、截图、Git 或 `VITE_*` 中复制该值。 |
| 真实 AI 解读 | 正式同源接口已完成一次最小有效的 `reading.generate` 验收。 | 返回 HTTP 200，且同时含 `integratedReading` 与 `hexagramReading`；未记录完整问题、模型输出或任何凭据。 |

> 以上是项目维护者的上线记录，不是 Railway、Cloudflare、DeepSeek 或任何第三方的认证报告。

## 域名与部署流程（已完成）

已先使用 Railway 生成的 `*.up.railway.app` 临时域名验证部署、数据库迁移和 `/health`，再将 `liuyao.win` 添加为 Railway Custom Domain。Cloudflare 中保留 Railway 面板实际提供的根域 CNAME 与 TXT 所有权验证记录；根域经 Cloudflare 扁平化或代理时，公共 DNS 查询不一定直接显示 CNAME Answer。随后正式地址 `/`、`/privacy`、`/disclaimer`、`/health` 及授权随喜图片均已返回 HTTPS 200。

未来更新 `main` 时，Railway 会自动构建、执行受控迁移并通过 `/health` 后再切换流量。对 Railway Variables 的修改会显示为待应用的变更；应先确认其影响，再手动触发一次 Deploy。应用部署不会读取或显示 Secret 值。

## 机密、数据库与迁移规则

`DATABASE_URL` 必须继续引用同一项目 MySQL 的私有 `MYSQL_URL`。数据库不得为了排障、导入数据或外部访问而开启 Public Access 或 TCP Proxy；如未来确有迁移需求，应使用短时、受控的运维通道并在完成后关闭。

`DEEPSEEK_API_KEY` 仅在服务器运行时读取。若 Railway UI 提供密封（Seal）选项，应由作者本人启用；无论 UI 表现如何，都不应把变量值写入 `.env.example`、README、部署日志、浏览器控制台或 `VITE_*`。更换 Key 后应先应用配置变更，再用一次最小且非敏感的请求验证 HTTP 状态与结构字段，不保存请求正文或模型输出。

项目的生产迁移命令为 `pnpm db:migrate`。迁移会在部署前执行，因而 Schema 变更必须先在本地通过类型检查、测试和构建，再提交到 `main`。匿名模式不会把问题或解读写入 `readings`；MySQL 目前主要承载 IP/UTC 日期的十次/日原子限流。

## 备份与成本控制：当前限制和未来选择

| 项目 | 当前状态 | 用户偏好与后续操作 |
|---|---|---|
| Railway MySQL Backups/PITR | 当前 Trial 工作区的 UI 将该能力标为 Pro 可用，尚未启用。 | 若作者自行升级后仍需要，应设置 **7 天**原生保留期，并在隔离环境执行一次恢复演练；恢复生产数据必须再次单独确认。 |
| Compute 软提醒 | 当前未设置，且 Trial 未添加支付方式。 | 作者自行升级后，可设置 **$10** 邮件提醒；提醒不会关闭服务。 |
| Compute 硬上限 | 当前未设置。 | 作者自行升级后，如仍确认需要，可设置 **$20** 硬上限。达到上限会停止工作负载，可能导致网站不可访问，不能自动启用。 |
| Trial 余额 | 最近 UI 显示约 `$4.97` 的一次性试用额度。 | 试用额度耗尽时工作负载可能停止；应由作者自行决定是否续费、升级或暂停服务。 |

不启用原生备份时，不应把“可恢复备份”写作已有保障。独立备份方案会涉及对象存储、凭据、额外费用和恢复责任；只有在作者选择自有存储位置并明确授权后，才可另行设计。

## 尚待完成的真实设备验收

生产 AI 解读已验证成功，但以下项目必须由作者在真实 HTTPS 手机和桌面设备上完成，不应以服务端冒烟测试替代：允许/拒绝摄像头、握拳蓄力—张掌释放、抖动与连续触发、路由离开后的媒体轨道关闭、长内容的两类独立 PNG、Web Share 原生分享、二维码实际扫码，以及 Ko-fi 外链在用户浏览器中的落地页。

## 参考资料

1. [Railway MySQL 文档](https://docs.railway.com/databases/mysql)：同项目 MySQL、私有网络及备份功能。
2. [Railway 域名文档](https://docs.railway.com/networking/domains/working-with-domains)：临时域名、自定义域名、验证记录与证书流程。
3. [Railway Healthchecks 文档](https://docs.railway.com/guides/healthchecks)：`PORT` 与健康检查的部署就绪边界。
4. [Railway Variables 文档](https://docs.railway.com/guides/variables)：服务变量、引用变量与密封变量。
5. [Railway Cost Control 文档](https://docs.railway.com/pricing/cost-control)：预算提醒、硬上限及相关影响。
