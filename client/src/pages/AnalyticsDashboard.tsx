import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Area, AreaChart, Bar, CartesianGrid, ComposedChart, Legend, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { AlertTriangle, Bot, CircleDollarSign, Eye, RefreshCw, Sparkles, Users } from 'lucide-react';

type DashboardData = {
  generatedAt: string; from: string; to: string; days: number;
  summary: Record<string, number>;
  eventDaily: Array<Record<string, string | number>>;
  aiDaily: Array<Record<string, string | number>>;
  topPages: Array<{ path: string; views: number; visitors: number }>;
  devices: Array<{ name: string; value: number }>;
  recentErrors: Array<{ requestId: string; date: string; status: string; failureKind: string | null; httpStatus: number | null }>;
  cloudflare: { configured: boolean; daily: Array<{ date: string; requests: number; visitors: number; bandwidth: number }>; error?: string };
};

const fmt = new Intl.NumberFormat('zh-CN');
const money = new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY', maximumFractionDigits: 2 });
const PAGE_NAMES: Record<string, string> = { '/': '首页', '/throw': '投掷页', '/result': '结果页', '/history': '往卦记录' };

function Card({ label, value, note, icon: Icon }: { label: string; value: string; note: string; icon: typeof Eye }) {
  return <div className="rounded-2xl border border-[#e8dfcf] bg-white p-5 shadow-sm">
    <div className="flex items-center justify-between text-sm text-stone-500"><span>{label}</span><Icon size={18} className="text-[#a87831]" /></div>
    <div className="mt-3 text-3xl font-semibold text-stone-800">{value}</div>
    <div className="mt-2 text-xs text-stone-400">{note}</div>
  </div>;
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return <section className="rounded-2xl border border-[#e8dfcf] bg-white p-5 shadow-sm">
    <h2 className="mb-5 text-base font-medium text-stone-700">{title}</h2>{children}
  </section>;
}

export default function AnalyticsDashboard() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const load = async () => {
    setLoading(true); setError('');
    try {
      const response = await fetch(`/api/admin/analytics?days=${days}`, { credentials: 'include' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || '读取失败');
      setData(body);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '读取失败');
    } finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [days]);

  const daily = useMemo(() => {
    if (!data) return [];
    const byDate = new Map<string, Record<string, string | number>>();
    for (const row of data.eventDaily) byDate.set(String(row.date), { ...row });
    for (const row of data.aiDaily) byDate.set(String(row.date), { ...(byDate.get(String(row.date)) ?? {}), ...row });
    return Array.from(byDate.values()).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }, [data]);

  if (error) return <div className="min-h-screen bg-[#f6f2ea] p-8 text-stone-700"><div className="mx-auto max-w-xl rounded-2xl bg-white p-8 text-center"><AlertTriangle className="mx-auto mb-3 text-amber-700" /><p>{error}</p><button onClick={load} className="mt-5 rounded-lg border px-4 py-2">重新加载</button></div></div>;
  if (!data) return <div className="flex min-h-screen items-center justify-center bg-[#f6f2ea] text-stone-500">{loading ? '正在整理数据…' : '暂无数据'}</div>;
  const s = data.summary;
  const completionRate = s.aiRequests ? Math.round((s.aiCompleted / s.aiRequests) * 100) : 0;

  return <div className="min-h-screen bg-[#f6f2ea] px-4 py-8 text-stone-700 md:px-8">
    <main className="mx-auto max-w-7xl">
      <header className="mb-7 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div><div className="text-xs tracking-[0.3em] text-[#a87831]">众见六爻</div><h1 className="mt-2 text-3xl font-semibold text-stone-800">数据看板</h1><p className="mt-2 text-sm text-stone-400">访客、转化、AI 用量与异常，一页看清</p></div>
        <div className="flex items-center gap-2">
          {[7, 30, 90].map(n => <button key={n} onClick={() => setDays(n)} className={`rounded-lg px-3 py-2 text-sm ${days === n ? 'bg-[#9a6b2f] text-white' : 'bg-white text-stone-500'}`}>{n} 天</button>)}
          <button onClick={load} title="刷新" className="rounded-lg bg-white p-2.5 text-stone-500"><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /></button>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card label="页面浏览" value={fmt.format(s.pageViews)} note={`独立访客 ${fmt.format(s.visitors)}`} icon={Eye} />
        <Card label="开始问卦" value={fmt.format(s.questions)} note={`完成投掷 ${fmt.format(s.castings)}`} icon={Users} />
        <Card label="AI 解读" value={fmt.format(s.aiCompleted)} note={`成功率 ${completionRate}% · 使用者 ${fmt.format(s.aiVisitors)}`} icon={Bot} />
        <Card label="AI 估算费用" value={money.format(s.costCny)} note={`${fmt.format(s.tokens)} tokens · 验证 ${fmt.format(s.turnstile)} 次`} icon={CircleDollarSign} />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-3">
        <div className="xl:col-span-2"><Panel title="访问与问卦趋势"><div className="h-72"><ResponsiveContainer width="100%" height="100%"><AreaChart data={daily}><defs><linearGradient id="pv" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#b68337" stopOpacity={0.3}/><stop offset="95%" stopColor="#b68337" stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="#eee8dc" vertical={false}/><XAxis dataKey="date" tick={{fontSize:11}}/><YAxis tick={{fontSize:11}}/><Tooltip/><Legend/><Area name="浏览量" type="monotone" dataKey="pageViews" stroke="#a87831" fill="url(#pv)"/><Line name="独立访客" type="monotone" dataKey="visitors" stroke="#4f6b61"/><Line name="完成投掷" type="monotone" dataKey="castings" stroke="#bd765a"/></AreaChart></ResponsiveContainer></div></Panel></div>
        <Panel title="热门页面"><div className="space-y-4">{data.topPages.map((page, i) => <div key={page.path} className="flex items-center justify-between border-b border-stone-100 pb-3"><div><span className="mr-3 text-xs text-stone-300">{i + 1}</span>{PAGE_NAMES[page.path] ?? page.path}</div><div className="text-right"><div className="font-medium">{fmt.format(page.views)}</div><div className="text-xs text-stone-400">{fmt.format(page.visitors)} 人</div></div></div>)}</div></Panel>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Panel title="AI 调用与费用"><div className="h-72"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={daily}><CartesianGrid stroke="#eee8dc" vertical={false}/><XAxis dataKey="date" tick={{fontSize:11}}/><YAxis yAxisId="left" tick={{fontSize:11}}/><YAxis yAxisId="right" orientation="right" tick={{fontSize:11}}/><Tooltip/><Legend/><Bar yAxisId="left" name="成功" dataKey="completed" fill="#718b7e" radius={[4,4,0,0]}/><Bar yAxisId="left" name="失败/拒绝" dataKey="failed" fill="#c88468" radius={[4,4,0,0]}/><Line yAxisId="right" name="费用（元）" dataKey="costCny" stroke="#a87831" strokeWidth={2}/></ComposedChart></ResponsiveContainer></div></Panel>
        <Panel title="Cloudflare 流量">{!data.cloudflare.configured ? <div className="flex h-72 flex-col items-center justify-center text-center text-sm text-stone-400"><Sparkles className="mb-3 text-amber-600"/><p>看板已经预留 Cloudflare 同步</p><p className="mt-1">连接只读凭证后，这里会显示边缘请求和访客</p></div> : data.cloudflare.error ? <div className="flex h-72 items-center justify-center text-sm text-amber-700">同步失败：{data.cloudflare.error}</div> : <div className="h-72"><ResponsiveContainer width="100%" height="100%"><LineChart data={data.cloudflare.daily}><CartesianGrid stroke="#eee8dc" vertical={false}/><XAxis dataKey="date" tick={{fontSize:11}}/><YAxis tick={{fontSize:11}}/><Tooltip/><Legend/><Line name="Cloudflare 请求" dataKey="requests" stroke="#e09b47"/><Line name="Cloudflare 访客" dataKey="visitors" stroke="#627c72"/></LineChart></ResponsiveContainer></div>}</Panel>
      </div>

      <div className="mt-5"><Panel title="最近异常（可凭编号定位）"><div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead className="text-xs text-stone-400"><tr><th className="pb-3">日期</th><th>请求编号</th><th>状态</th><th>原因</th><th>HTTP</th></tr></thead><tbody>{data.recentErrors.map(row => <tr key={row.requestId} className="border-t border-stone-100"><td className="py-3">{row.date}</td><td className="font-mono text-xs">{row.requestId}</td><td>{row.status}</td><td>{row.failureKind ?? '—'}</td><td>{row.httpStatus ?? '—'}</td></tr>)}</tbody></table>{data.recentErrors.length === 0 && <div className="py-8 text-center text-sm text-stone-400">这段时间没有异常</div>}</div></Panel></div>
      <footer className="py-7 text-center text-xs text-stone-400">数据截止 {new Date(data.generatedAt).toLocaleString('zh-CN')} · 看板数据不保存问题内容或原始 IP</footer>
    </main>
  </div>;
}
