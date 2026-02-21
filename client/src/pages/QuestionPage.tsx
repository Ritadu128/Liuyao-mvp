import { useState, useRef } from 'react';
import { useLocation } from 'wouter';
import { useDivination } from '@/contexts/DivinationContext';
import {
  FANG_SONG, SONG,
  CloudPattern, ScrollCard, ScrollDivider, WaveLine, SealButton, Disclaimer,
} from '@/components/ScrollUI';

const EXAMPLE_QUESTIONS = [
  '此次求职能否顺利？',
  '近期感情运势如何？',
  '这笔投资是否值得？',
  '家人的病情会好转吗？',
];

export default function QuestionPage() {
  const [, navigate] = useLocation();
  const { state, setQuestion, reset } = useDivination();
  const [localQ, setLocalQ] = useState(state.question);
  const [error, setError] = useState('');
  const [focused, setFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleStart = () => {
    const q = localQ.trim();
    if (!q) { setError('请先输入您的占卜问题'); return; }
    if (q.length < 4) { setError('问题至少需要四字'); return; }
    reset();
    setQuestion(q);
    navigate('/throw');
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setLocalQ(e.target.value);
    setError('');
  };

  const handleExample = (q: string) => {
    setLocalQ(q);
    setError('');
    textareaRef.current?.focus();
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-10 relative overflow-hidden">

      {/* 云纹背景 */}
      <CloudPattern opacity={0.04} />

      {/* 大字背景装饰 */}
      <div className="absolute inset-0 pointer-events-none select-none">
        <span className="absolute top-4 left-4 text-[9rem] leading-none text-amber-900/[0.05]"
          style={{ fontFamily: SONG, fontWeight: 700 }}>易</span>
        <span className="absolute bottom-4 right-4 text-[7rem] leading-none text-amber-900/[0.035]"
          style={{ fontFamily: SONG, fontWeight: 700 }}>卦</span>
        {/* 左侧竖排文字 */}
        <div className="absolute left-5 top-1/2 -translate-y-1/2 text-amber-800/[0.06] text-[0.78rem]"
          style={{ writingMode: 'vertical-rl', fontFamily: FANG_SONG, letterSpacing: '0.6em', lineHeight: 1 }}>
          天地玄黄宇宙洪荒
        </div>
        {/* 右侧竖排文字 */}
        <div className="absolute right-5 top-1/2 -translate-y-1/2 text-amber-800/[0.06] text-[0.78rem]"
          style={{ writingMode: 'vertical-rl', fontFamily: FANG_SONG, letterSpacing: '0.6em', lineHeight: 1 }}>
          日月盈昃辰宿列张
        </div>
      </div>

      <div className="w-full max-w-[520px] relative z-10">

        {/* 标题区 */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-4">
            <WaveLine />
            <span className="text-amber-700/60 text-[0.78rem] tracking-[0.4em]" style={{ fontFamily: FANG_SONG }}>
              六爻占卜
            </span>
            <WaveLine flip />
          </div>
          <h1 className="text-[3.2rem] font-medium text-stone-800 tracking-[0.22em] mb-3"
            style={{ fontFamily: SONG, fontWeight: 500 }}>
            心诚则灵
          </h1>
          <p className="text-stone-500/75 text-[0.88rem] leading-[2.1] tracking-[0.15em]"
            style={{ fontFamily: FANG_SONG }}>
            静心凝神，将您的问题化为文字<br />
            天地自有感应，卦象自然呈现
          </p>
        </div>

        {/* 书卷卡片 */}
        <ScrollCard>
          <ScrollDivider label="问 卦" />
          <div className="mt-4">

            {/* 问题标签 */}
            <label className="block text-stone-600/80 text-[0.82rem] mb-2.5 tracking-[0.2em]"
              style={{ fontFamily: FANG_SONG }}>
              ◈ 您的占卜问题
            </label>

            {/* 文本输入区 */}
            <textarea
              ref={textareaRef}
              value={localQ}
              onChange={handleInput}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder="请将心中所问，化为文字……"
              maxLength={200}
              rows={4}
              onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) handleStart(); }}
              style={{
                width: '100%',
                padding: '14px 16px',
                background: focused ? 'rgba(255,250,235,0.7)' : 'rgba(255,252,242,0.5)',
                border: 'none',
                borderBottom: `1px solid ${focused ? 'rgba(175,120,35,0.45)' : 'rgba(175,120,35,0.18)'}`,
                outline: 'none',
                resize: 'none',
                fontFamily: FANG_SONG,
                fontSize: '1rem',
                lineHeight: '2',
                letterSpacing: '0.05em',
                color: '#3d2e1a',
                transition: 'all 0.3s ease',
              }}
            />

            {/* 字数/错误提示 */}
            <div className="flex justify-between items-center mt-1.5 px-0.5">
              <span className={`text-xs tracking-wide ${error ? 'text-red-500/75' : 'text-stone-400/55'}`}
                style={{ fontFamily: FANG_SONG }}>
                {error ? `✦ ${error}` : 'Ctrl+Enter 快速开始'}
              </span>
              <span className="text-stone-400/45 text-xs">{localQ.length}/200</span>
            </div>

            {/* 示例问题 */}
            <div className="mt-5">
              <div className="flex items-center gap-2 mb-2.5">
                <div className="h-px flex-1" style={{ background: 'rgba(175,130,50,0.1)' }} />
                <p className="text-stone-400/60 text-[0.72rem] tracking-[0.28em]" style={{ fontFamily: FANG_SONG }}>
                  示例问题
                </p>
                <div className="h-px flex-1" style={{ background: 'rgba(175,130,50,0.1)' }} />
              </div>
              <div className="flex flex-wrap gap-2">
                {EXAMPLE_QUESTIONS.map(q => (
                  <button
                    key={q}
                    onClick={() => handleExample(q)}
                    style={{
                      fontFamily: FANG_SONG,
                      fontSize: '0.78rem',
                      padding: '4px 12px',
                      background: 'rgba(255,248,230,0.6)',
                      border: '1px solid rgba(175,130,50,0.28)',
                      borderRadius: '1px',
                      color: '#7c5a2a',
                      letterSpacing: '0.05em',
                      cursor: 'pointer',
                      transition: 'background 0.2s, border-color 0.2s',
                    }}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLElement).style.background = 'rgba(255,240,200,0.8)';
                      (e.currentTarget as HTMLElement).style.borderColor = 'rgba(175,130,50,0.5)';
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLElement).style.background = 'rgba(255,248,230,0.6)';
                      (e.currentTarget as HTMLElement).style.borderColor = 'rgba(175,130,50,0.28)';
                    }}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>

            {/* 分割线 */}
            <ScrollDivider />

            {/* 开始按钮 */}
            <SealButton onClick={handleStart} className="mt-1">
              <span>开 始 占 卜</span>
            </SealButton>
          </div>
        </ScrollCard>

        {/* 底部 */}
        <Disclaimer />
        <div className="text-center mt-2">
          <button
            onClick={() => navigate('/history')}
            className="text-amber-700/45 text-[0.72rem] tracking-[0.2em] hover:text-amber-700/70 transition-colors"
            style={{ fontFamily: FANG_SONG }}
          >
            查阅往卦 →
          </button>
        </div>
      </div>
    </div>
  );
}
