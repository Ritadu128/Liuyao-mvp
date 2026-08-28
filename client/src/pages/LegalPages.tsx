import { Link } from 'wouter';
import { ArrowLeft } from 'lucide-react';
import { CloudPattern, FANG_SONG, ScrollCard, ScrollDivider, SONG } from '@/components/ScrollUI';
import { PUBLIC_CONFIG } from '@/lib/publicConfig';

type LegalSection = { title: string; paragraphs: string[] };

function LegalPage({ title, subtitle, sections }: { title: string; subtitle: string; sections: LegalSection[] }) {
  return (
    <main className="relative min-h-screen" style={{ background: 'var(--bg-paper, #faf6ed)' }}>
      <div className="fixed inset-0 pointer-events-none"><CloudPattern opacity={0.025} /></div>
      <div className="relative z-10 mx-auto max-w-2xl px-4 py-8 sm:py-12">
        <Link href="/" className="inline-flex items-center gap-1 text-[0.78rem] tracking-[0.12em] text-amber-800/65 hover:text-amber-900" style={{ fontFamily: FANG_SONG }}>
          <ArrowLeft size={14} aria-hidden="true" /> 返回占卜首页
        </Link>
        <header className="py-8 text-center">
          <p className="mb-3 text-[0.72rem] tracking-[0.34em] text-amber-700/55" style={{ fontFamily: FANG_SONG }}>{subtitle}</p>
          <h1 className="text-3xl tracking-[0.2em] text-stone-800" style={{ fontFamily: SONG }}>{title}</h1>
          <p className="mt-4 text-[0.72rem] tracking-[0.08em] text-stone-500" style={{ fontFamily: FANG_SONG }}>最后更新：{PUBLIC_CONFIG.policyUpdatedAt}</p>
        </header>
        <article className="space-y-4">
          {sections.map(section => (
            <ScrollCard key={section.title}>
              <ScrollDivider label={section.title} />
              <div className="mt-4 space-y-3 text-[0.9rem] leading-8 tracking-wide text-stone-700" style={{ fontFamily: FANG_SONG }}>
                {section.paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
              </div>
            </ScrollCard>
          ))}
        </article>
        <footer className="py-8 text-center text-[0.74rem] leading-7 text-stone-500" style={{ fontFamily: FANG_SONG }}>
          <p>如需就隐私或内容联系项目作者，请使用：{PUBLIC_CONFIG.contactEmail}</p>
          <p className="mt-2"><Link href="/privacy" className="underline underline-offset-4">隐私政策</Link><span className="mx-2">·</span><Link href="/disclaimer" className="underline underline-offset-4">免责声明</Link></p>
        </footer>
      </div>
    </main>
  );
}

export function PrivacyPage() {
  return (
    <LegalPage
      title="隐私政策"
      subtitle="数据与隐私说明"
      sections={[
        {
          title: '适用范围',
          paragraphs: [
            '本政策适用于“六爻占卜 MVP”当前的匿名版本。它说明我们在你使用提问、解读、匿名历史、手势投掷和随喜支持功能时，实际处理的数据、处理目的和你可以采取的控制方式。',
            '本政策以当前代码行为为准。项目日后接入正式登录、分析统计、支付或其他服务时，会在功能上线前相应更新本政策。',
          ],
        },
        {
          title: '我们处理的数据',
          paragraphs: [
            '当你请求人工智能解读时，浏览器会将你的问题、本卦、变卦、动爻、卦辞、象曰和相关爻辞发送至本项目服务器；服务器再将这些内容发送给 DeepSeek API，用于生成综合解读和卦象解读。请勿在问题中输入密码、身份证号、银行卡号、精确住址或其他不必要的敏感个人信息。',
            '为执行每个 IP 每日最多十次的使用限制，服务器会处理请求来源 IP、UTC 日期和当日已使用次数，并保存于 MySQL 的 `ipRateLimits` 表。该数据用于反滥用与限额执行，而不是用于匿名历史展示。',
            '匿名历史记录保存在当前浏览器的 localStorage（键名为 `liuyao_local_history`）。其中可包含问题、六爻、本卦/变卦、动爻、两类解读和创建时间。当前匿名版本不会将这类历史写入服务器的 `readings` 表。',
          ],
        },
        {
          title: '摄像头与手势识别',
          paragraphs: [
            '摄像头仅在你主动点击“启动手势识别”并授予浏览器权限后开启。视频流由浏览器本地的 MediaPipe GestureRecognizer 用于识别握拳和张掌，不会由当前应用上传至本项目服务器或 DeepSeek。',
            '手势模型与运行组件随本网站由同一域名提供，不需要把摄像头画面发送给第三方。关闭摄像头、停止识别或离开投掷页面时，应用会停止本地媒体轨道。',
          ],
        },
        {
          title: '本地存储、Cookie 与第三方服务',
          paragraphs: [
            '当前匿名版本使用 localStorage 保存匿名历史，不依赖登录 Cookie。项目中保留了未来 OAuth 所需代码，但在未配置 OAuth 环境变量时不会启用，也不会在匿名流程中创建 OAuth 会话 Cookie。',
            '第三方服务包括：DeepSeek（仅在请求解读时接收上述解读所需文本）和 Google Fonts（网页字体加载）。随喜区在作者提供 Ko-fi 链接后会跳转至 Ko-fi；当前版本未配置该链接。',
          ],
        },
        {
          title: '保存、删除与控制方式',
          paragraphs: [
            '你可以通过浏览器的站点数据设置清除 localStorage，或清除浏览器数据，删除本机匿名历史。清除数据、使用无痕模式、换浏览器或换设备后，历史可能无法恢复。',
            'IP 限流记录保存在服务器数据库中。当前版本尚未实现面向用户的自助查询或删除页面；如你有相关请求，请联系项目作者。上线前应将这里的联系邮箱替换为正式联系方式，并配置相应的保留期限与处理流程。',
          ],
        },
        {
          title: '安全与政策更新',
          paragraphs: [
            'DeepSeek API Key 和数据库连接信息仅应保存在服务器环境变量或部署平台的 Secret 中，不应写入浏览器代码、公开仓库或本文档。我们采用后端限流、输入校验和受控错误处理来降低滥用与泄露风险，但互联网传输和第三方服务并非绝对无风险。',
            '本政策可能因功能、服务商或法律要求而更新。重要变更会通过本页面的“最后更新”日期体现；继续使用更新后的服务即表示你理解最新版本的政策。',
          ],
        },
      ]}
    />
  );
}

export function DisclaimerPage() {
  return (
    <LegalPage
      title="免责声明"
      subtitle="使用前请阅读"
      sections={[
        {
          title: '文化研究与娱乐用途',
          paragraphs: [
            '本产品及人工智能生成的内容仅用于《周易》文化研究、一般信息与娱乐参考。占卜结果、卦象阐释和人工智能生成内容不构成对任何事实、结果或未来事件的保证、承诺或预测。',
          ],
        },
        {
          title: '不构成专业意见',
          paragraphs: [
            '本产品不构成医疗诊断或治疗建议、投资建议、法律意见、税务建议，也不应作为任何高风险或重大决策的唯一依据。人工智能生成内容可能存在错误、不完整、过时或不适用于具体情况的问题。',
            '涉及医疗、法律、投资、安全、财务、心理健康或其他重大事项时，请咨询具备相应资质的专业人士，并由用户自行判断和承担最终决策责任。遇到紧急风险或需要即时帮助的情形，请及时联系当地紧急服务或专业机构。',
          ],
        },
        {
          title: '人工智能与第三方服务',
          paragraphs: [
            '解读由 DeepSeek API 根据用户输入与本次提供的经文资料生成。模型输出不代表项目作者、服务提供方或经文原典的立场。用户应自行核验信息，并避免将敏感个人信息输入解读问题。',
          ],
        },
        {
          title: '功能可用性与责任边界',
          paragraphs: [
            '我们会尽力维护应用的可用性与安全性，但不保证服务持续可用、无错误或完全满足特定目的。摄像头、浏览器、网络、第三方 API 与设备兼容性均可能影响功能。法律允许的范围内，项目作者不对因使用、无法使用或依赖本产品内容所造成的间接损失承担责任。',
          ],
        },
      ]}
    />
  );
}
