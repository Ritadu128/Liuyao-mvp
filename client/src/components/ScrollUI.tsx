/**
 * ScrollUI — 统一书卷风格公共组件库
 * 包含：云纹/如意纹 SVG 背景、书卷卡片、印章按钮、分割线
 */
import React from 'react';

// ─── 字体栈常量 ───────────────────────────────────────────────
// 主字体：Noto Serif SC（方正书宋风格，Google Fonts 免费）
export const FANG_SONG = "'Noto Serif SC', 'STSong', 'SimSun', serif";
export const SONG = "'Noto Serif SC', 'STSong', 'SimSun', serif";

// ─── 云纹 SVG（传统祥云纹样） ──────────────────────────────────
export function CloudPattern({ opacity = 0.045 }: { opacity?: number }) {
  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none select-none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ opacity }}
    >
      <defs>
        <pattern id="cloud-pattern" x="0" y="0" width="120" height="120" patternUnits="userSpaceOnUse">
          {/* 祥云单元 */}
          <g fill="none" stroke="#8B5E2A" strokeWidth="0.8">
            {/* 主云体 */}
            <path d="M20 60 Q20 45 35 45 Q35 35 50 35 Q65 35 65 45 Q80 45 80 60 Q80 72 65 72 Q65 78 50 78 Q35 78 35 72 Q20 72 20 60Z" />
            {/* 云尾卷曲 */}
            <path d="M20 60 Q10 55 8 48 Q6 40 15 38 Q22 36 25 42" />
            <path d="M80 60 Q90 55 92 48 Q94 40 85 38 Q78 36 75 42" />
            {/* 小云朵 */}
            <circle cx="35" cy="45" r="6" />
            <circle cx="50" cy="37" r="7" />
            <circle cx="65" cy="45" r="6" />
          </g>
        </pattern>
        <pattern id="ruyi-pattern" x="0" y="0" width="80" height="80" patternUnits="userSpaceOnUse">
          {/* 如意纹单元 */}
          <g fill="none" stroke="#8B5E2A" strokeWidth="0.7">
            <path d="M40 10 Q55 10 55 25 Q55 35 45 38 Q55 42 55 55 Q55 70 40 70 Q25 70 25 55 Q25 42 35 38 Q25 35 25 25 Q25 10 40 10Z" />
            <path d="M40 10 Q40 5 45 5 Q50 5 50 10" />
            <path d="M40 70 Q40 75 45 75 Q50 75 50 70" />
            <circle cx="40" cy="38" r="5" />
          </g>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#cloud-pattern)" />
    </svg>
  );
}

// ─── 如意纹 SVG（用于卡片角落） ────────────────────────────────
export function RuyiCorner({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" className={className} style={style} fill="none">
      <path
        d="M2 2 Q2 12 12 12 Q8 16 12 20 Q16 24 12 28"
        stroke="rgba(160,110,40,0.35)"
        strokeWidth="1.2"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="12" cy="12" r="3" stroke="rgba(160,110,40,0.3)" strokeWidth="1" fill="none" />
      <circle cx="2" cy="2" r="1.5" fill="rgba(160,110,40,0.25)" />
    </svg>
  );
}

// ─── 书卷卡片 ──────────────────────────────────────────────────
export function ScrollCard({
  children,
  className = '',
  noPadding = false,
}: {
  children: React.ReactNode;
  className?: string;
  noPadding?: boolean;
}) {
  return (
    <div
      className={`relative ${className}`}
      style={{
        background: 'linear-gradient(168deg, rgba(255,253,242,0.99) 0%, rgba(255,249,228,0.98) 100%)',
        border: '1px solid rgba(175,135,55,0.2)',
        borderRadius: '2px',
        boxShadow: `
          0 6px 28px rgba(100,70,15,0.09),
          0 1px 6px rgba(100,70,15,0.06),
          inset 0 1px 0 rgba(255,235,160,0.45),
          inset 0 -1px 0 rgba(175,135,55,0.08)
        `,
      }}
    >
      {/* 左竖线 */}
      <div
        className="absolute left-[13px] top-4 bottom-4 w-px"
        style={{ background: 'linear-gradient(to bottom, transparent, rgba(175,130,50,0.16), transparent)' }}
      />
      {/* 右竖线 */}
      <div
        className="absolute right-[13px] top-4 bottom-4 w-px"
        style={{ background: 'linear-gradient(to bottom, transparent, rgba(175,130,50,0.16), transparent)' }}
      />
      {noPadding ? children : <div className="px-7 py-5">{children}</div>}
    </div>
  );
}

// ─── 书卷分割线 ────────────────────────────────────────────────
export function ScrollDivider({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 my-1">
      <div className="flex-1 h-px" style={{ background: 'linear-gradient(to right, transparent, rgba(175,130,50,0.28), transparent)' }} />
      {label && (
        <span className="text-amber-700/45 text-[0.72rem] tracking-[0.35em]" style={{ fontFamily: FANG_SONG }}>
          {label}
        </span>
      )}
      {!label && <span className="text-amber-600/20 text-[0.6rem]">✦</span>}
      <div className="flex-1 h-px" style={{ background: 'linear-gradient(to right, transparent, rgba(175,130,50,0.28), transparent)' }} />
    </div>
  );
}

// ─── 波浪装饰线 ────────────────────────────────────────────────
export function WaveLine({ flip }: { flip?: boolean }) {
  return (
    <svg width="44" height="12" viewBox="0 0 44 12"
      style={{ transform: flip ? 'scaleX(-1)' : undefined, opacity: 0.5 }}>
      <path d="M2 6 C8 2, 14 10, 22 6 C30 2, 36 10, 42 6"
        stroke="rgba(160,110,35,0.6)" strokeWidth="1" fill="none" strokeLinecap="round" />
    </svg>
  );
}

// ─── 主按钮（原印章按钮，已简化为纯按钮） ────────────────────────
export function SealButton({
  onClick,
  children,
  disabled = false,
  className = '',
  sealChar: _sealChar,
}: {
  onClick?: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  className?: string;
  sealChar?: string;
}) {
  const [pressed, setPressed] = React.useState(false);

  const handleClick = () => {
    if (disabled) return;
    setPressed(true);
    setTimeout(() => setPressed(false), 180);
    onClick?.();
  };

  return (
    <div className={`relative ${className}`}>
      <button
        onClick={handleClick}
        disabled={disabled}
        className="w-full h-11 relative overflow-hidden"
        style={{
          fontFamily: FANG_SONG,
          fontSize: '1rem',
          letterSpacing: '0.45em',
          background: disabled
            ? 'rgba(180,160,120,0.5)'
            : pressed
            ? 'linear-gradient(135deg, #6b3410 0%, #5a2c0e 100%)'
            : 'linear-gradient(135deg, #8b4513 0%, #6b3410 40%, #7a3d15 70%, #8b4513 100%)',
          color: disabled ? 'rgba(200,180,140,0.7)' : '#fef3c7',
          border: '1px solid rgba(160,100,30,0.35)',
          borderRadius: '1px',
          boxShadow: pressed
            ? '0 1px 6px rgba(100,55,10,0.15), inset 0 2px 4px rgba(0,0,0,0.15)'
            : '0 2px 14px rgba(100,55,10,0.22), inset 0 1px 0 rgba(255,210,100,0.12)',
          transform: pressed ? 'translateY(1px)' : 'translateY(0)',
          transition: 'all 0.15s ease',
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        {children}
      </button>
    </div>
  );
}

// ─── 古风标题区 ────────────────────────────────────────────────
export function AncientHeader({
  subtitle,
  title,
  desc,
}: {
  subtitle: string;
  title: string;
  desc?: string;
}) {
  return (
    <div className="text-center mb-7">
      <div className="inline-flex items-center gap-3 mb-4">
        <WaveLine />
        <span className="text-amber-700/60 text-[0.78rem] tracking-[0.4em]" style={{ fontFamily: FANG_SONG }}>
          {subtitle}
        </span>
        <WaveLine flip />
      </div>
      <h1
        className="text-[2.6rem] font-medium text-stone-800 tracking-[0.2em] mb-2"
        style={{ fontFamily: SONG, fontWeight: 500 }}
      >
        {title}
      </h1>
      {desc && (
        <p className="text-stone-500/75 text-[0.85rem] leading-[2] tracking-[0.12em]"
          style={{ fontFamily: FANG_SONG }}>
          {desc}
        </p>
      )}
    </div>
  );
}

// ─── 问题展示条 ────────────────────────────────────────────────
export function QuestionBanner({ question }: { question: string }) {
  return (
    <div
      className="px-4 py-3 mb-5"
      style={{
        background: 'linear-gradient(to right, rgba(255,248,225,0.7), rgba(255,252,240,0.85), rgba(255,248,225,0.7))',
        border: '1px solid rgba(175,135,55,0.18)',
        borderRadius: '1px',
        borderLeft: '3px solid rgba(160,100,35,0.4)',
      }}
    >
      <p className="text-[0.72rem] text-amber-700/55 mb-1 tracking-[0.25em]" style={{ fontFamily: FANG_SONG }}>
        所问之事
      </p>
      <p className="text-stone-700 text-[0.9rem] leading-relaxed tracking-wide" style={{ fontFamily: FANG_SONG }}>
        {question}
      </p>
    </div>
  );
}

// ─── 底部免责声明 ──────────────────────────────────────────────
export function Disclaimer() {
  return (
    <p
      className="text-center text-stone-400/55 text-[0.7rem] mt-4 tracking-[0.2em]"
      style={{ fontFamily: FANG_SONG }}
    >
      本结果仅供文化研究与娱乐参考，请合理看待
    </p>
  );
}

// ─── 古风 Tab 切换 ─────────────────────────────────────────────
export function AncientTabs({
  tabs,
  active,
  onChange,
}: {
  tabs: { key: string; label: string }[];
  active: string;
  onChange: (key: string) => void;
}) {
  return (
    <div
      className="flex overflow-hidden"
      style={{
        border: '1px solid rgba(175,135,55,0.25)',
        borderRadius: '1px',
        background: 'rgba(255,250,235,0.5)',
      }}
    >
      {tabs.map((tab, i) => (
        <button
          key={tab.key}
          onClick={() => onChange(tab.key)}
          className="flex-1 py-2.5 text-[0.85rem] tracking-[0.15em] transition-all duration-200 relative"
          style={{
            fontFamily: FANG_SONG,
            background: active === tab.key
              ? 'linear-gradient(135deg, #8b4513 0%, #6b3410 100%)'
              : 'transparent',
            color: active === tab.key ? '#fef3c7' : 'rgba(100,70,30,0.7)',
            borderRight: i < tabs.length - 1 ? '1px solid rgba(175,135,55,0.2)' : 'none',
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

// ─── 古风加载状态 ──────────────────────────────────────────────
export function AncientLoading({ text = '正在推演卦象，请稍候…' }: { text?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 gap-4">
      {/* 旋转八卦符号 */}
      <div
        className="text-3xl animate-spin"
        style={{ animationDuration: '3s', color: 'rgba(160,100,35,0.5)' }}
      >
        ☯
      </div>
      <p className="text-stone-400/70 text-[0.82rem] tracking-widest" style={{ fontFamily: FANG_SONG }}>
        {text}
      </p>
    </div>
  );
}
