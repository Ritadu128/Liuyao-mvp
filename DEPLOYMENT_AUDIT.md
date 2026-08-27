# 原线上域名核验记录

**域名：** `liuyao.teloslab.mobi`  
**核验时间：** 2026-08-27 03:11–03:12 UTC（只读核验）

## 当前外部状态

| 项目 | 观测结果 | 含义 |
|---|---|---|
| HTTP | `301` 跳转至 HTTPS | 域名仍配置为优先使用 HTTPS。 |
| HTTPS | 返回 `503`，响应头含 `x-manus-original-status: 404` | 域名、TLS 和代理仍在，但原站点后端或站点映射不可用；不是当前代码部署的正常应用响应。 |
| 页面 | 标题为 `Site under maintenance` | 当前公众访问看到维护页。 |
| TLS 证书 | `CN=liuyao.teloslab.mobi`，Google Trust Services 签发，有效期 2026-07-21 至 2026-10-19 | HTTPS 证书当时有效。 |
| DNS | IPv4 为 `172.67.177.33`、`104.21.88.110`；IPv6 为 Cloudflare 地址 | 解析经 Cloudflare 代理，不能从公开 A/AAAA 记录得知真实源站。 |
| 权威 DNS | `teloslab.mobi` 的权威 DNS 为 Cloudflare | 需要 Cloudflare 管理权才能检查/更改子域名的实际源站配置。 |

## 仓库线索

当前 GitHub 分支没有 `Dockerfile`、Caddy/Nginx 配置、`render.yaml`、`railway.json`、`fly.toml`、`vercel.json`、`netlify.toml` 或 `Procfile`。远程只有 `main`，没有标签或其他可见分支。仓库中没有 `liuyao.teloslab.mobi`、`teloslab` 或已接入的访问分析服务配置。因而无法仅凭仓库还原原始托管平台、源站地址、部署项目或访问量看板。

`x-manus-original-status: 404` 是当前公开响应中的**部署线索**，但不足以证明原部署账户、项目或发布版本；恢复操作前需要在 Cloudflare 与原托管平台后台进一步确认。

## 恢复建议（尚未执行）

1. 登录 Cloudflare，检查 `liuyao` 记录、代理状态、SSL/TLS 模式、Origin Rules/Workers 和自定义主机名映射。
2. 在曾用托管平台中查找该自定义域名；如为 Manus 项目托管，需在对应项目的发布/域名设置中重新绑定或重新发布。
3. 新部署应使用当前仓库的同域 Node + MySQL 架构，配置 `DATABASE_URL`、`DEEPSEEK_API_KEY` 与 HTTPS；仅在可信反向代理后开启 `TRUST_PROXY=true`。
4. 先在临时预览/测试子域验证首页、API、限流、隐私页面、长图导出与手势权限，再切换 `liuyao.teloslab.mobi` 的生产流量。
5. 旧访问量面板不在仓库中。需在 Cloudflare Analytics、原托管平台和可能的独立分析服务账户中查找；当前代码只保留 IP 日限额，不提供访问量统计。

## 外部来源

- 直接 HTTPS 响应：`https://liuyao.teloslab.mobi/`
- Google Public DNS 查询：`https://dns.google/resolve?name=liuyao.teloslab.mobi&type=CNAME`
- Google Public DNS 查询：`https://dns.google/resolve?name=liuyao.teloslab.mobi&type=TXT`
