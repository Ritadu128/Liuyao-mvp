/**
 * ThrowPage.tsx — 沉浸优先投掷页
 *
 * 布局结构：
 * [顶部：半透明问题条 ≤56px，fixed]
 * [中间：Three.js 3D 投掷区域 75-85vh，绝对主视觉]
 * [底部：HUD 进度层 ≤15vh，fixed]
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useDivination } from '@/contexts/DivinationContext';
import { throwOnce, throwAllSix, computeHexagram, getLineDisplay } from '@/lib/liuyao';
import CoinScene, { type CoinFace } from '@/components/CoinScene';
import type { ThrowResult } from '@/lib/liuyao';

// ─── 六爻线条（HUD 内使用）────────────────────────────────────────────────
function HexLineHUD({ value, isActive }: { value: number | null; isActive: boolean }) {
  const isYin = value !== null && (value === 6 || value === 8);
  const isDynamic = value !== null && (value === 6 || value === 9);
  const lineColor = isDynamic ? '#e8a020' : 'rgba(255,255,255,0.82)';
  const emptyColor = isActive ? 'rgba(200,168,75,0.45)' : 'rgba(255,255,255,0.12)';

  return (
    <div style={{ display: 'flex', alignItems: 'center', height: '9px', gap: '4px' }}>
      {value === null ? (
        <div style={{ flex: 1, height: '2px', background: emptyColor, borderRadius: '1px' }} />
      ) : isYin ? (
        <>
          <div style={{ flex: 1, height: '3px', background: lineColor, borderRadius: '2px' }} />
          <div style={{ width: '7px' }} />
          <div style={{ flex: 1, height: '3px', background: lineColor, borderRadius: '2px' }} />
        </>
      ) : (
        <div style={{ flex: 1, height: '3px', background: lineColor, borderRadius: '2px' }} />
      )}
    </div>
  );
}

// ─── 主组件 ────────────────────────────────────────────────────────────────
export default function ThrowPage() {
  const [, navigate] = useLocation();
  const { state, addThrow, setThrows, setHexagramResult } = useDivination();

  const [coinResults, setCoinResults] = useState<[CoinFace, CoinFace, CoinFace] | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [showLineResult, setShowLineResult] = useState(false);
  const [lastLineDesc, setLastLineDesc] = useState('');
  const [lastLineIdx, setLastLineIdx] = useState(0);

  // 待提交的投掷结果（等动画结束后再更新状态）
  const pendingRef = useRef<{
    result: ThrowResult;
    allResults?: ThrowResult[];
    mode: 'single' | 'all';
  } | null>(null);

  const currentCount = state.throws.length;
  const isComplete = currentCount >= 6;

  // 没有问题时跳回提问页
  useEffect(() => {
    if (!state.question) navigate('/');
  }, [state.question, navigate]);

  // 六爻完成后跳转结果页
  useEffect(() => {
    if (isComplete && state.hexagramResult) {
      const t = setTimeout(() => navigate('/result'), 900);
      return () => clearTimeout(t);
    }
  }, [isComplete, state.hexagramResult, navigate]);

  // ── 动画完成回调 ──────────────────────────────────────────────────────────
  const handleAnimationComplete = useCallback(() => {
    const p = pendingRef.current;
    if (!p) return;

    if (p.mode === 'single') {
      addThrow(p.result);
      const newCount = currentCount + 1;
      setLastLineDesc(getLineDisplay(p.result.sum).description);
      setLastLineIdx(currentCount);
      setShowLineResult(true);
      setIsAnimating(false);

      if (newCount === 6) {
        const allThrows = [...state.throws, p.result];
        setHexagramResult(computeHexagram(allThrows));
      }
    } else if (p.mode === 'all' && p.allResults) {
      setThrows(p.allResults);
      const last = p.allResults[5]!;
      setLastLineDesc(getLineDisplay(last.sum).description);
      setLastLineIdx(5);
      setShowLineResult(true);
      setIsAnimating(false);
      setHexagramResult(computeHexagram(p.allResults));
    }

    pendingRef.current = null;
  }, [addThrow, setThrows, setHexagramResult, currentCount, state.throws]);

  // ── 单次投掷 ──────────────────────────────────────────────────────────────
  const handleThrowOne = useCallback(() => {
    if (isAnimating || isComplete) return;
    setShowLineResult(false);

    const result = throwOnce();
    pendingRef.current = {
      result,
      mode: 'single',
    };
    setCoinResults(result.coins.map(c => c === 1 ? 3 : 2) as [CoinFace, CoinFace, CoinFace]);
    setIsAnimating(true);
  }, [isAnimating, isComplete]);

  // ── 一键成卦 ──────────────────────────────────────────────────────────────
  const handleThrowAll = useCallback(() => {
    if (isAnimating || isComplete) return;
    setShowLineResult(false);

    const results = throwAllSix();
    const last = results[results.length - 1]!;
    pendingRef.current = {
      result: last,
      allResults: results,
      mode: 'all',
    };
    // 展示最后一爻的硬币
    setCoinResults(last.coins.map(c => c === 1 ? 3 : 2) as [CoinFace, CoinFace, CoinFace]);
    setIsAnimating(true);
  }, [isAnimating, isComplete]);

  const lineLabels = ['初', '二', '三', '四', '五', '上'];

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'linear-gradient(180deg, #1c1408 0%, #140f06 60%, #0e0a04 100%)',
        overflow: 'hidden',
      }}
    >
      {/* ── 顶部问题条 ≤56px ──────────────────────────────────────────────── */}
      <div
        style={{
          position: 'absolute',
          top: 0, left: 0, right: 0,
          height: '56px',
          background: 'rgba(18,12,4,0.78)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          borderBottom: '1px solid rgba(200,168,75,0.18)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 18px',
          zIndex: 30,
        }}
      >
        <button
          onClick={() => navigate('/')}
          style={{
            color: 'rgba(200,168,75,0.6)',
            fontSize: '12px',
            fontFamily: '"Noto Serif SC", serif',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            letterSpacing: '0.08em',
            padding: '4px 6px',
          }}
        >
          ← 重问
        </button>

        <div
          style={{
            color: 'rgba(240,228,195,0.88)',
            fontSize: '13px',
            fontFamily: '"Noto Serif SC", serif',
            letterSpacing: '0.06em',
            maxWidth: '55%',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            textAlign: 'center',
          }}
        >
          {state.question}
        </div>

        <div
          style={{
            color: 'rgba(200,168,75,0.65)',
            fontSize: '12px',
            fontFamily: '"Noto Serif SC", serif',
            letterSpacing: '0.05em',
          }}
        >
          {isComplete ? '六爻已成' : `第 ${currentCount + 1} / 6 爻`}
        </div>
      </div>

      {/* ── 3D 投掷区域（主视觉，56px ~ 85vh）────────────────────────────── */}
      <div
        style={{
          position: 'absolute',
          top: '56px',
          left: 0,
          right: 0,
          bottom: 'calc(15vh)',
          zIndex: 10,
        }}
      >
        <CoinScene
          throwResults={coinResults}
          onAnimationComplete={handleAnimationComplete}
        />

        {/* 投掷中：极简提示，不遮挡硬币 */}
        {isAnimating && (
          <div
            style={{
              position: 'absolute',
              top: '14px',
              left: '50%',
              transform: 'translateX(-50%)',
              color: 'rgba(200,168,75,0.5)',
              fontSize: '18px',
              letterSpacing: '0.3em',
              pointerEvents: 'none',
              fontFamily: '"Noto Serif SC", serif',
            }}
          >
            · · ·
          </div>
        )}

        {/* 停住后：本爻结果浮层（Canvas 底部，不遮挡硬币主体） */}
        {showLineResult && lastLineDesc && !isAnimating && !isComplete && (
          <div
            style={{
              position: 'absolute',
              bottom: '18px',
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'rgba(14,9,3,0.80)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              border: '1px solid rgba(200,168,75,0.3)',
              borderRadius: '4px',
              padding: '8px 28px',
              color: 'rgba(240,220,160,0.95)',
              fontSize: '14px',
              fontFamily: '"Noto Serif SC", serif',
              letterSpacing: '0.14em',
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
              animation: 'fadeInUp 0.35s ease-out',
            }}
          >
            {lineLabels[lastLineIdx]}爻 · {lastLineDesc}
          </div>
        )}

        {/* 点击提示（未投掷时） */}
        {!isAnimating && !isComplete && currentCount === 0 && !showLineResult && (
          <div
            style={{
              position: 'absolute',
              bottom: '24px',
              left: '50%',
              transform: 'translateX(-50%)',
              color: 'rgba(200,168,75,0.35)',
              fontSize: '12px',
              fontFamily: '"Noto Serif SC", serif',
              letterSpacing: '0.12em',
              pointerEvents: 'none',
            }}
          >
            点击下方按钮开始投掷
          </div>
        )}
      </div>

      {/* ── 底部 HUD 进度层 ≤15vh ─────────────────────────────────────────── */}
      <div
        style={{
          position: 'absolute',
          bottom: 0, left: 0, right: 0,
          height: '15vh',
          minHeight: '90px',
          maxHeight: '130px',
          background: 'rgba(10,7,2,0.88)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderTop: '1px solid rgba(200,168,75,0.15)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 20px',
          gap: '16px',
          zIndex: 30,
        }}
      >
        {/* 左侧：六爻线条（自下而上） */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column-reverse',
            gap: '5px',
            width: '64px',
            flexShrink: 0,
          }}
        >
          {Array.from({ length: 6 }, (_, i) => (
            <HexLineHUD
              key={i}
              value={state.throws[i]?.sum ?? null}
              isActive={i === currentCount}
            />
          ))}
        </div>

        {/* 中间：按钮区 */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
          }}
        >
          {!isComplete ? (
            <>
              {/* 主投掷按钮 */}
              <button
                onClick={handleThrowOne}
                disabled={isAnimating}
                style={{
                  width: '100%',
                  maxWidth: '220px',
                  padding: '9px 0',
                  background: isAnimating
                    ? 'rgba(80,60,20,0.35)'
                    : 'linear-gradient(135deg, #7a5c10 0%, #c8a84b 50%, #7a5c10 100%)',
                  border: 'none',
                  borderRadius: '3px',
                  color: isAnimating ? 'rgba(200,168,75,0.35)' : '#1a1208',
                  fontSize: '14px',
                  fontFamily: '"Noto Serif SC", serif',
                  letterSpacing: '0.22em',
                  fontWeight: 700,
                  cursor: isAnimating ? 'not-allowed' : 'pointer',
                  boxShadow: isAnimating ? 'none' : '0 2px 14px rgba(200,168,75,0.25)',
                  transition: 'all 0.2s ease',
                }}
              >
                {isAnimating ? '投掷中…' : `投 第 ${currentCount + 1} 爻`}
              </button>

              {/* 一键成卦（次要按钮） */}
              {!isAnimating && (
                <button
                  onClick={handleThrowAll}
                  style={{
                    background: 'none',
                    border: '1px solid rgba(200,168,75,0.28)',
                    borderRadius: '3px',
                    color: 'rgba(200,168,75,0.55)',
                    fontSize: '11px',
                    fontFamily: '"Noto Serif SC", serif',
                    letterSpacing: '0.18em',
                    padding: '4px 20px',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(200,168,75,0.6)';
                    (e.currentTarget as HTMLButtonElement).style.color = 'rgba(200,168,75,0.85)';
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(200,168,75,0.28)';
                    (e.currentTarget as HTMLButtonElement).style.color = 'rgba(200,168,75,0.55)';
                  }}
                >
                  一键成卦
                </button>
              )}
            </>
          ) : (
            <div
              style={{
                color: 'rgba(200,168,75,0.8)',
                fontSize: '13px',
                fontFamily: '"Noto Serif SC", serif',
                letterSpacing: '0.18em',
              }}
            >
              ✦ 六爻已成，正在推演…
            </div>
          )}
        </div>

        {/* 右侧：爻位标注（自下而上） */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column-reverse',
            gap: '5px',
            width: '22px',
            flexShrink: 0,
            alignItems: 'center',
          }}
        >
          {lineLabels.map((label, i) => (
            <div
              key={i}
              style={{
                height: '9px',
                fontSize: '9px',
                fontFamily: '"Noto Serif SC", serif',
                lineHeight: '9px',
                color: i < currentCount
                  ? 'rgba(200,168,75,0.75)'
                  : i === currentCount
                  ? 'rgba(200,168,75,0.35)'
                  : 'rgba(255,255,255,0.1)',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              {label}
            </div>
          ))}
        </div>
      </div>

      {/* 全局 CSS 动画 */}
      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateX(-50%) translateY(8px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
    </div>
  );
}
