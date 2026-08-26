# 六爻占卜 MVP

一个匿名优先的中文六爻占卜 Web 应用。用户输入所问之事后，可通过三枚 3D 铜钱逐爻投掷、一键成卦，或使用摄像头手势完成投掷；应用依据六爻规则计算本卦、变卦与动爻，并在服务器端调用 DeepSeek 生成受控的文化解读。

> **定位与边界**：本项目用于《周易》文化研究与娱乐体验，不提供医疗、法律、投资、税务或其他高风险决策建议。页面应始终展示“本结果仅供文化研究与娱乐参考，请合理看待”。

## 目录

- [核心能力与用户流程](#核心能力与用户流程)
- [系统架构](#系统架构)
- [完整目录结构](#完整目录结构)
- [技术栈](#技术栈)
- [本地安装与启动](#本地安装与启动)
- [环境变量](#环境变量)
- [MySQL 初始化与迁移](#mysql-初始化与迁移)
- [DeepSeek 服务端解读流程](#deepseek-服务端解读流程)
- [匿名历史与 IP 限额](#匿名历史与-ip-限额)
- [摄像头与手势投掷](#摄像头与手势投掷)
- [测试、构建与部署](#测试构建与部署)
- [安全与隐私](#安全与隐私)
- [当前状态、已知问题与重建说明](#当前状态已知问题与重建说明)

## 核心能力与用户流程

应用的主流程为：**输入问题 → 投掷六爻 → 计算卦象 → 加载经文 → 服务端生成解读 → 保存本机历史**。六爻计算完全在前端通过纯函数完成：每次投掷三枚硬币，正面计 3、反面计 2；6 为老阴动爻、7 为少阳、8 为少阴、9 为老阳动爻。六条爻按自下而上的顺序形成 6 位二进制本卦；仅翻转动爻以形成变卦。

| 能力 | 当前行为 |
|---|---|
| 提问与成卦 | 提问页校验输入后进入投掷页；支持逐爻投掷与一键成卦。 |
| 3D 铜钱 | Three.js 渲染三枚乾隆通宝，展示上抛、翻转、落地与停稳动画。 |
| 手势投掷 | MediaPipe 识别握拳/张掌；稳定握拳后按时长蓄力，稳定张掌后释放投掷。 |
| 经文数据 | `client/public/data` 内含 64 卦映射表与 64 份经文 JSON。 |
| AI 解读 | 后端将问题、卦名、动爻与经文原文发送至 DeepSeek，并要求返回结构化 JSON。 |
| 匿名历史 | 成功解读后保存到浏览器 `localStorage`；刷新和重新打开浏览器后仍可查看。 |
| 服务端限流 | 后端 MySQL 以 IP 与 UTC 日期为维度，限制每 IP 每日最多 10 次 DeepSeek 解读请求。 |

## 系统架构

前端和后端通过同一 Express 服务部署。开发环境由 Express 挂载 Vite 中间件；生产环境由 Express 同域提供 Vite 构建产物与 `/api/trpc` 接口。因此不需要额外配置跨域、跨域 Cookie 或前端 API 基址。摄像头在生产环境必须由 HTTPS 页面调用；`localhost` 是浏览器允许摄像头访问的本地开发例外。

```mermaid
flowchart TB
  U[匿名用户浏览器] -->|HTTPS / localhost| N[Express + Vite / 静态站点]
  N --> FE[React 前端]
  FE -->|同域 /api/trpc| RPC[tRPC reading.generate]
  RPC -->|原子计数| DB[(MySQL ipRateLimits)]
  RPC -->|服务器端 HTTPS 请求| DS[DeepSeek API]
  FE -->|仅本机| LS[(localStorage 历史记录)]
  FE -->|浏览器摄像头权限| MP[MediaPipe 手势识别]
```

### 请求边界

| 数据或能力 | 所在位置 | 说明 |
|---|---|---|
| 六爻随机投掷、卦象计算、经文读取 | 浏览器 | 不依赖模型；经文来自打包的静态 JSON。 |
| DeepSeek API Key | 服务器环境变量 | 只使用 `DEEPSEEK_API_KEY`；绝不使用 `VITE_*` 前缀，绝不进入浏览器包。 |
| DeepSeek API 请求 | `server/routers/reading.ts` | 仅后端发起，含 3–60 秒超时钳制、上游错误与响应结构校验。 |
| 每日 IP 限额 | MySQL | `(ip, date)` 唯一索引和原子 UPSERT 强制执行，不依赖前端。 |
| 匿名占卜历史 | 浏览器 `localStorage` | 当前阶段不向服务器保存匿名问题或解读内容。 |
| OAuth | 模板保留能力 | 未配置 OAuth 环境变量时自动禁用，不阻塞匿名版本。 |

## 完整目录结构

```text
Liuyao-mvp/
├── client/
│   ├── index.html                     # HTML 入口、中文元信息与字体
│   ├── public/
│   │   ├── assets/                    # 铜钱贴图
│   │   └── data/
│   │       ├── hexagrams_map.json     # 64 卦二进制映射
│   │       └── texts/01..64.json      # 64 卦经文数据
│   └── src/
│       ├── App.tsx                    # 路由、全局 Provider
│       ├── components/
│       │   ├── CoinScene.tsx          # Three.js 3D 铜钱动画
│       │   ├── GestureThrowPanel.tsx  # 摄像头、识别状态与蓄力 UI
│       │   ├── HexagramLine.tsx       # 卦象线条展示
│       │   ├── ScrollUI.tsx           # 书卷风格公共组件
│       │   └── ui/                    # shadcn/Radix 基础组件
│       ├── contexts/DivinationContext.tsx
│       ├── hooks/
│       │   ├── useGestureThrow.ts     # MediaPipe 手势状态机
│       │   ├── useHexagramData.ts     # 静态卦象与经文加载
│       │   └── useLocalHistory.ts     # 匿名本地历史
│       ├── lib/
│       │   ├── liuyao.ts              # 六爻纯函数计算引擎
│       │   └── trpc.ts                # 类型化 tRPC 客户端
│       ├── pages/
│       │   ├── QuestionPage.tsx       # 提问页
│       │   ├── ThrowPage.tsx          # 投掷页
│       │   ├── ResultPage.tsx         # 结果与 AI 解读页
│       │   └── HistoryPage.tsx        # 匿名本地历史页
│       └── index.css                  # 全局宣纸主题与样式
├── drizzle/
│   ├── schema.ts                      # MySQL 表定义
│   ├── 0000_*.sql .. 0003_*.sql       # 已提交的迁移
│   └── meta/                          # Drizzle 迁移日志与快照
├── server/
│   ├── _core/                         # Express、tRPC、Vite、可选 OAuth 基础设施
│   ├── routers/reading.ts             # AI 解读、限流与可选登录历史接口
│   ├── db.ts                          # Drizzle 数据库入口
│   ├── routers.ts                     # 根 tRPC Router
│   └── *.test.ts                      # Vitest 服务端与领域测试
├── shared/                            # 前后端共享常量、类型与错误定义
├── .env.example                       # 安全的环境变量示例
├── drizzle.config.ts                  # Drizzle Kit 配置
├── vite.config.ts                     # Vite 客户端构建配置
├── vitest.config.ts                   # 服务端测试配置
├── package.json                       # 脚本和依赖
└── REBUILD_BROWSER_NOTES.md           # 本次重建过程的浏览器验证记录
```

## 技术栈

| 层次 | 主要技术 |
|---|---|
| 前端 | React 19、TypeScript、Vite 7、Tailwind CSS 4、Wouter、TanStack Query、tRPC React |
| 视觉与交互 | Three.js、Framer Motion、Radix UI、Noto Serif SC |
| 手势识别 | `@mediapipe/tasks-vision` GestureRecognizer（GPU 优先、CPU 回退） |
| 后端 | Node.js、Express 4、tRPC 11、Zod、SuperJSON |
| 数据库 | MySQL 8、Drizzle ORM、Drizzle Kit |
| AI | DeepSeek Chat Completions API，模型默认 `deepseek-chat` |
| 测试与构建 | Vitest、TypeScript、Vite、esbuild、pnpm |

## 本地安装与启动

### 前置条件

请安装 Node.js 22+、pnpm 10+ 和 MySQL 8+。本地手势识别可在 `http://localhost` 下运行；真实线上摄像头功能必须运行在 HTTPS 域名下。

```bash
git clone https://github.com/Ritadu128/Liuyao-mvp.git
cd Liuyao-mvp
pnpm install
cp .env.example .env
```

编辑 `.env`，至少配置 `DATABASE_URL`。要获得真实 AI 解读，还必须填写 `DEEPSEEK_API_KEY`。`.env` 已被 `.gitignore` 忽略，不能提交。

```bash
# 开发模式：同一端口同时提供前端和 API
pnpm dev

# 浏览器访问
# http://localhost:3000
```

## 环境变量

请从 `.env.example` 复制模板；示例文件只含变量名与占位符，不能放入真实密钥。

| 变量 | 是否必需 | 用途 |
|---|---|---|
| `NODE_ENV` | 否 | `development` 或 `production`。 |
| `PORT` | 否 | Express 端口，默认 `3000`。 |
| `DATABASE_URL` | 是 | MySQL URL；限流依赖它，格式为 `mysql://user:password@host:3306/database`。 |
| `DEEPSEEK_API_KEY` | 真实解读必需 | 仅服务器读取的 DeepSeek Key。不可提交、不可使用 `VITE_` 前缀。 |
| `DEEPSEEK_MODEL` | 否 | 默认 `deepseek-chat`。 |
| `DEEPSEEK_TIMEOUT_MS` | 否 | DeepSeek 请求超时，服务端会钳制到 3000–60000ms，默认 20000ms。 |
| `TRUST_PROXY` | 生产反向代理时必需 | 仅当 Node 位于可信反向代理之后设为 `true`，以便 `req.ip` 读取真实来源。 |
| `JWT_SECRET`、`VITE_APP_ID`、`OAUTH_SERVER_URL` 等 | 否 | 预留给未来 OAuth；匿名版本无需设置。 |

## MySQL 初始化与迁移

本项目当前数据库用于两类内容：**服务器端 IP 限流**与未来可选的登录用户记录。匿名历史不会写入 `readings` 表。

### 创建数据库与本地应用账户

以下为本地开发示例。请把密码替换为强随机值，并把同一个密码写入 `.env` 的 `DATABASE_URL`。

```sql
CREATE DATABASE liuyao_mvp CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'liuyao_app'@'127.0.0.1' IDENTIFIED BY 'replace-with-strong-password';
GRANT ALL PRIVILEGES ON liuyao_mvp.* TO 'liuyao_app'@'127.0.0.1';
FLUSH PRIVILEGES;
```

### 执行迁移

```bash
# 根据已提交迁移创建/升级表
pnpm db:migrate

# 修改 drizzle/schema.ts 后生成新的迁移
pnpm db:generate

# 生成并立即执行迁移（本地开发便捷命令）
pnpm db:push
```

`ipRateLimits` 表包含 `(ip, date)` 唯一索引 `ip_rate_limits_ip_date_unique`。不要手动删除该索引，否则高并发下同一 IP 的计数可能失准。

## DeepSeek 服务端解读流程

1. 结果页从静态经文数据中收集问题、本卦、变卦、动爻、卦辞、象曰和动爻爻辞。
2. 前端使用同域 tRPC 调用 `reading.generate`；浏览器从不携带 DeepSeek Key。
3. 服务器先校验 `DEEPSEEK_API_KEY`，未配置时返回受控提示且不扣限额。
4. 服务器以 IP/日期进行原子限流；达到十次后返回 `TOO_MANY_REQUESTS`。
5. 服务器请求 `https://api.deepseek.com/chat/completions`，附加 AbortController 超时控制。
6. 服务端验证上游 HTTP 状态、外层 `choices` 结构、JSON 文本和两项必需的解读字段。
7. 仅在验证成功后向浏览器返回 `integratedReading` 与 `hexagramReading`。

提示词明确限制模型：只能引用本次输入的经文原文，不得自行补充或杜撰经文；输出应保持客观中立，不作绝对预测。

## 匿名历史与 IP 限额

### 匿名历史

匿名历史由 `client/src/hooks/useLocalHistory.ts` 管理，保存在浏览器 `localStorage` 的 `liuyao_local_history` 键中。成功解读会保存问题、六爻、本卦/变卦、动爻、两类解读和时间；最新记录在前，最多保留 30 条。用户清除浏览器站点数据或换用浏览器/设备后，历史不会自动迁移。

### 每日 IP 限额

限额必须由后端执行。`reading.generate` 会在调用 DeepSeek 前，以 UTC 日期和请求来源 IP 对 MySQL 表 `ipRateLimits` 执行原子 UPSERT。前十次请求递增；第十一次不会递增并返回“今日占卜次数已达上限”。数据库不可用时接口会失败关闭，避免因故障绕过限额。

## 摄像头与手势投掷

### 前置条件

生产访问必须使用 HTTPS；浏览器通常只允许 HTTPS 页面或 `localhost` 调用 `getUserMedia`。用户首次点击“启动手势识别”时，浏览器会请求摄像头权限。若权限被拒绝、摄像头不存在、被其他程序占用或浏览器不支持，页面会显示明确中文错误。

### 识别和投掷状态机

| 阶段 | 判定 | 用户可见反馈 | 保护措施 |
|---|---|---|---|
| 未启动 | 未取得摄像头流 | 摄像头预览占位和启动按钮 | 不预加载模型，减少首次页面开销。 |
| 就绪 | 摄像头与模型可用 | 实时镜像画面、“请握拳蓄力” | 仅接受置信度不低于 0.65 的手势。 |
| 蓄力 | `Closed_Fist` 稳定至少 200ms | 蓄力条从 0% 至 100% | 张掌必须在至少 300ms 蓄力后才可释放。 |
| 释放 | `Open_Palm` 稳定至少 200ms | “已释放，正在投掷” | 触发原有单爻状态机，不直接绕开第六爻收尾逻辑。 |
| 冷却 | 投掷触发后 | “投掷冷却中” | 两段 800ms 冷却、动画中禁用面板、六爻完成后禁用面板，防止连续误触发。 |

手势力度不会改变随机卦象结果，但会改变 3D 铜钱动画的上抛高度与翻转速度。握拳越久，动画视觉力度越强。

## 测试、构建与部署

### 本地验证命令

```bash
# 类型检查
pnpm check

# Vitest：六爻规则、匿名访问边界、限流思路、fixture 与认证登出
pnpm test

# 生产构建
pnpm build

# 启动生产产物
NODE_ENV=production PORT=3000 pnpm start
```

### 建议的简单稳定部署方案

优先使用**单一 Node 进程 + 托管 MySQL + HTTPS 反向代理或支持 Node 的托管平台**。Express 在同一域名下提供前端产物与 tRPC API，能够避免 CORS、跨站 Cookie 与摄像头权限配置复杂度。生产环境建议：

1. 将代码部署到支持长期运行 Node 22 的服务；运行 `pnpm install --frozen-lockfile`、`pnpm build`，再以 `NODE_ENV=production pnpm start` 启动。
2. 使用托管 MySQL 或同网络内的 MySQL 8；通过 CI/CD 或受控运维步骤执行 `pnpm db:migrate`。
3. 通过平台代理或 Caddy/Nginx 提供 TLS，并把 HTTPS 请求转发给 Node 服务。
4. 仅在前方确实有可信反向代理时设定 `TRUST_PROXY=true`；否则保留 `false`。
5. 在部署平台的服务器端 Secret/Environment 设置 `DATABASE_URL` 与 `DEEPSEEK_API_KEY`，不要在构建参数、客户端变量或日志中暴露它们。
6. 将健康检查指向首页或只读 tRPC 请求；部署后分别验证首页、一次匿名投掷、DeepSeek 成功/错误状态、历史页和实际摄像头权限流程。

> 默认建议保持前后端同域。它既满足匿名 tRPC 调用，也满足移动浏览器对摄像头安全上下文的要求。项目不需要前端单独部署或额外 CORS 白名单。

## 安全与隐私

| 主题 | 当前措施 |
|---|---|
| API Key | `.env` 被 Git 忽略；`.env.example` 仅含占位符；DeepSeek Key 仅在服务器端读取。 |
| 匿名隐私 | 匿名问题与解读只保存在浏览器本地；服务器不保存匿名 `readings`。 |
| 滥用控制 | 数据库原子化的后端每日 10 次/IP 限额；前端不能绕过。 |
| 经文约束 | 模型提示词限制仅引用本次提供的经文内容，降低杜撰原文风险。 |
| 摄像头 | 仅在用户主动点击后请求权限；停止识别或离开页面后关闭媒体轨道。 |
| OAuth | 未配置时禁用；当前匿名版本不依赖 Cookie 或登录状态。 |
| 日志 | 不应记录 `DEEPSEEK_API_KEY`、完整授权头、数据库 URL 或未脱敏的用户敏感内容。 |

如果真实 DeepSeek Key 曾经出现在代码仓库、历史部署日志、截图、聊天记录或其他不受控位置，请立即在 DeepSeek 控制台轮换该 Key，再将新 Key 写入服务器 Secret。

## 当前状态、已知问题与重建说明

### 已完成

- [x] 修复缺失的 Vite、Vitest、Drizzle 和环境配置文件。
- [x] 移除不存在的 Wouter 补丁引用，恢复 `pnpm install`。
- [x] 修复 Vitest 根目录，当前测试集已覆盖 29 项测试。
- [x] 修复 `ipRateLimits` 迁移日志，新增 `(ip, date)` 唯一索引迁移。
- [x] 匿名历史改为完全依赖浏览器 `localStorage`，OAuth 不再阻塞应用启动。
- [x] 增加服务器端 DeepSeek 超时、错误处理、响应结构校验和失败关闭的限流策略。
- [x] 验证开发和生产模式均能提供同域页面与 API。
- [x] 重建并强化 MediaPipe 手势投掷面板、状态机、摄像头错误提示、抖动保护和动画力度联动。

### 待完成或需要真实环境验收

- [ ] 在有效 `DEEPSEEK_API_KEY` 下完成真实 DeepSeek 成功响应的端到端测试。
- [ ] 在具备摄像头、HTTPS 的手机与桌面浏览器上完成真实握拳/张掌、权限拒绝、摄像头占用和连续投掷测试。
- [ ] 根据实际部署平台配置服务器 Secret、MySQL 备份、日志、HTTPS 和监控。
- [ ] 如未来重新启用正式登录，再决定是否将匿名历史迁移到账号，并补充登录用户的完整数据库历史测试。
- [ ] 评估并按需拆分较大的前端构建包；当前 Vite 会提示部分依赖分包超过 500KB，但构建成功。

### 本次“重建”可以确认与无法确认的内容

当前 GitHub 仓库只能追溯到 2026-03-03，之后的任务上下文、聊天记录、版本与功能变化无法从仓库恢复。本 README 以仓库内可运行的 React/tRPC/Drizzle 架构和本次确认的需求为准重建，不把旧仓库错误地视为最终版本。`REBUILD_BROWSER_NOTES.md` 记录了本次首页、投掷、结果、历史与无摄像头错误路径的实际浏览器验证。

无法从当前仓库确认的内容包括：旧线上部署供应商、旧生产数据库、旧 DeepSeek Key、3 月 3 日后的产品需求及任何未提交版本。请不要将这些未知内容作为当前实现已经具备的能力。
