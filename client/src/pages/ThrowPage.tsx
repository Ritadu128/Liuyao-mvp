/**
 * ThrowPage.tsx — 沉浸优先投掷页
 *
 * 布局：
 *   [顶部 56px] 半透明问题条
 *   [中间 75-85vh] Three.js 3D 投掷区域（主视觉）
 *   [底部 ≤15vh] HUD 进度层
 *
 * 状态机修复要点：
 *   - 用 throwsRef（useRef）同步跟踪已投掷数组，避免 React state 异步更新导致
 *     handleAnimationComplete 中读到旧 currentCount 而漏掉 finalizeCasting
 *   - finalizeCasting(allThrows) 是唯一出口：计算卦象 → setHexagramResult → 跳转
 *   - 逐次/一键共用同一 finalizeCasting，不存在两套实现
 *   - 关键节点均有 console.log（step、currentLine、isCasting、apiStatus）
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useDivination } from '@/contexts/DivinationContext';
import { throwOnce, throwAllSix, computeHexagram, getLineDisplay } from '@/lib/liuyao';
import CoinScene, { type CoinFace } from '@/components/CoinScene';
import { GestureThrowPanel } from '@/components/GestureThrowPanel';
import type { ThrowResult } from '@/lib/liuyao';

// ─── 六爻线条（HUD 内使用）────────────────────────────────────────────────
function HexLineHUD({ value, isActive }: { value: number | null; isActive: boolean }) {
  const isYin     = value !== null && (value === 6 || value === 8);
  const isDynamic = value !== null && (value === 6 || value === 9);
  const lineColor  = isDynamic ? '#c87820' : 'rgba(80,50,10,0.82)';
  const emptyColor = isActive  ? 'rgba(180,140,60,0.45)' : 'rgba(120,90,40,0.18)';

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

  const [coinResults, setCoinResults]       = useState<[CoinFace, CoinFace, CoinFace] | null>(null);
  const [isAnimating, setIsAnimating]       = useState(false);
  const [showLineResult, setShowLineResult] = useState(false);
  const [lastLineDesc, setLastLineDesc]     = useState('');
  const [lastLineIdx, setLastLineIdx]       = useState(0);
  // 用于强制刷新顶部计数显示
  const [throwCount, setThrowCount]         = useState(0);

  /**
   * throwsRef 是 throws 数组的同步镜像。
   * React state 更新是异步的，在 handleAnimationComplete 中
   * 直接读 state.throws 会得到旧值，因此用 ref 保证读到最新数组。
   */
  const throwsRef = useRef<ThrowResult[]>([]);

  // 手势投掷回调：触发单次投掷（power 暂不影响结果）
  const handleGestureThrow = useCallback((_power: number) => {
    handleThrowOne();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 待提交的投掷结果（等动画结束后再更新状态）
  const pendingRef = useRef<{
    result: ThrowResult;
    allResults?: ThrowResult[];
    mode: 'single' | 'all';
  } | null>(null);

  // 没有问题时跳回提问页
  useEffect(() => {
    if (!state.question) navigate('/');
  }, [state.question, navigate]);

  // 六爻完成后跳转结果页（hexagramResult 由 finalizeCasting 写入）
  useEffect(() => {
    if (state.hexagramResult) {
      console.log('[ThrowPage] hexagramResult 已设置，900ms 后跳转结果页');
      const t = setTimeout(() => navigate('/result'), 900);
      return () => clearTimeout(t);
    }
  }, [state.hexagramResult, navigate]);

  // ── 统一的 finalizeCasting 出口 ──────────────────────────────────────────
  /**
   * 六爻全部完成后的唯一出口。
   * 逐次模式和一键模式都调用这里，避免两套实现分叉。
   */
  const finalizeCasting = useCallback((allThrows: ThrowResult[]) => {
    console.log('[ThrowPage] finalizeCasting 触发 | 爻数:', allThrows.length,
      '| 爻值:', allThrows.map(t => t.sum).join(','));
    const hexResult = computeHexagram(allThrows);
    console.log('[ThrowPage] 本卦:', hexResult.originalBits,
      '| 变卦:', hexResult.changedBits,
      '| 动爻:', hexResult.movingLines);
    setHexagramResult(hexResult);
  }, [setHexagramResult]);

  // ── 动画完成回调 ──────────────────────────────────────────────────────────
  const handleAnimationComplete = useCallback(() => {
    const p = pendingRef.current;
    if (!p) {
      console.warn('[ThrowPage] handleAnimationComplete: pendingRef 为空，忽略');
      return;
    }

    setIsAnimating(false);

    if (p.mode === 'single') {
      // 将本次结果追加到 ref（同步，不受 React 批处理影响）
      const newThrows = [...throwsRef.current, p.result];
      throwsRef.current = newThrows;

      // 同步更新 context（异步，仅用于 HUD 展示）
      addThrow(p.result);
      setThrowCount(newThrows.length);

      const newCount = newThrows.length;
      console.log('[ThrowPage] 单次投掷完成 | step:', newCount,
        '| sum:', p.result.sum,
        '| isMoving:', p.result.isMoving);

      setLastLineDesc(getLineDisplay(p.result.sum).description);
      setLastLineIdx(newCount - 1);
      setShowLineResult(true);

      if (newCount === 6) {
        console.log('[ThrowPage] 第6爻完成，触发 finalizeCasting');
        finalizeCasting(newThrows);
      }

    } else if (p.mode === 'all' && p.allResults) {
      throwsRef.current = p.allResults;
      setThrows(p.allResults);
      setThrowCount(6);

      const last = p.allResults[5]!;
      console.log('[ThrowPage] 一键成卦完成 | 6爻值:',
        p.allResults.map(t => t.sum).join(','));

      setLastLineDesc(getLineDisplay(last.sum).description);
      setLastLineIdx(5);
      setShowLineResult(true);

      finalizeCasting(p.allResults);
    }

    pendingRef.current = null;
  }, [addThrow, setThrows, finalizeCasting]);

  // ── 单次投掷 ──────────────────────────────────────────────────────────────
  const handleThrowOne = useCallback(() => {
    const currentCount = throwsRef.current.length;
    if (isAnimating || currentCount >= 6) return;

    setShowLineResult(false);
    const result = throwOnce();

    console.log('[ThrowPage] 开始投掷第', currentCount + 1, '爻 | sum:', result.sum,
      '| isMoving:', result.isMoving);

    pendingRef.current = { result, mode: 'single' };
    setCoinResults(result.coins.map(c => c === 1 ? 3 : 2) as [CoinFace, CoinFace, CoinFace]);
    setIsAnimating(true);
  }, [isAnimating]);

  // ── 一键成卦 ──────────────────────────────────────────────────────────────
  const handleThrowAll = useCallback(() => {
    const currentCount = throwsRef.current.length;
    if (isAnimating || currentCount >= 6) return;

    setShowLineResult(false);
    const results = throwAllSix();
    const last    = results[results.length - 1]!;

    console.log('[ThrowPage] 一键成卦 | 6爻值:', results.map(t => t.sum).join(','));

    pendingRef.current = { result: last, allResults: results, mode: 'all' };
    setCoinResults(last.coins.map(c => c === 1 ? 3 : 2) as [CoinFace, CoinFace, CoinFace]);
    setIsAnimating(true);
  }, [isAnimating]);

  // HUD 展示用：从 ref 读（同步）
  const currentCount = throwCount;
  const lineLabels   = ['初', '二', '三', '四', '五', '上'];
  const isCastingDone = currentCount >= 6;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'radial-gradient(ellipse at 50% 40%, #F5F0E6 0%, #EFE6D6 55%, #E5D9C4 100%)',
        overflow: 'hidden',
      }}
    >
      {/* ── 顶部问题条 ≤56px ──────────────────────────────────────────────── */}
      <div
        style={{
          position: 'absolute',
          top: 0, left: 0, right: 0,
          height: '56px',
          background: 'rgba(245,240,230,0.88)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          borderBottom: '1px solid rgba(160,120,60,0.22)',
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
            color: 'rgba(120,80,20,0.70)',
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
            color: 'rgba(60,35,10,0.88)',
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
            color: 'rgba(140,100,30,0.75)',
            fontSize: '12px',
            fontFamily: '"Noto Serif SC", serif',
            letterSpacing: '0.05em',
          }}
        >
          {isCastingDone ? '六爻已成' : `第 ${currentCount + 1} / 6 爻`}
        </div>
      </div>

      {/* ── 3D 投掷区域（主视觉）────────────────────────────────────────── */}
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

        {/* 投掷中：极简提示 */}
        {isAnimating && (
          <div
            style={{
              position: 'absolute',
              top: '14px',
              left: '50%',
              transform: 'translateX(-50%)',
              color: 'rgba(140,100,30,0.55)',
              fontSize: '18px',
              letterSpacing: '0.3em',
              pointerEvents: 'none',
              fontFamily: '"Noto Serif SC", serif',
            }}
          >
            · · ·
          </div>
        )}

        {/* 停住后：本爻结果浮层 */}
        {showLineResult && lastLineDesc && !isAnimating && !isCastingDone && (
          <div
            style={{
              position: 'absolute',
              bottom: '18px',
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'rgba(245,240,230,0.92)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              border: '1px solid rgba(160,120,60,0.35)',
              borderRadius: '4px',
              padding: '8px 28px',
              color: 'rgba(80,45,10,0.95)',
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
        {!isAnimating && currentCount === 0 && !showLineResult && (
          <div
            style={{
              position: 'absolute',
              bottom: '24px',
              left: '50%',
              transform: 'translateX(-50%)',
              color: 'rgba(140,100,30,0.40)',
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
          background: 'rgba(245,240,230,0.92)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderTop: '1px solid rgba(160,120,60,0.20)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 20px',
          gap: '16px',
          zIndex: 30,
        }}
      >
        {/* 左侧：六爻线条（自下而上，从 context state 读，仅展示用） */}
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
              isActive={i === state.throws.length}
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
          {!isCastingDone ? (
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
                    ? 'rgba(180,150,80,0.22)'
                    : 'linear-gradient(135deg, #7a5c10 0%, #c8a84b 50%, #7a5c10 100%)',
                  border: 'none',
                  borderRadius: '3px',
                  color: isAnimating ? 'rgba(140,100,30,0.40)' : '#1a1208',
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
                    border: '1px solid rgba(160,120,60,0.32)',
                    borderRadius: '3px',
                    color: 'rgba(120,85,20,0.60)',
                    fontSize: '11px',
                    fontFamily: '"Noto Serif SC", serif',
                    letterSpacing: '0.18em',
                    padding: '4px 20px',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(160,120,60,0.65)';
                    (e.currentTarget as HTMLButtonElement).style.color = 'rgba(120,85,20,0.90)';
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(160,120,60,0.32)';
                    (e.currentTarget as HTMLButtonElement).style.color = 'rgba(120,85,20,0.60)';
                  }}
                >
                  一键成卦
                </button>
              )}
            </>
          ) : (
            <div
              style={{
                color: 'rgba(120,85,20,0.85)',
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
                color: i < state.throws.length
                  ? 'rgba(140,100,30,0.80)'
                  : i === state.throws.length
                  ? 'rgba(140,100,30,0.38)'
                  : 'rgba(80,50,10,0.15)',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              {label}
            </div>
          ))}
        </div>
      </div>
      {/* ── 手势投掷面板（右下角浮层）── */}
      <div
        style={{
          position: 'absolute',
          bottom: 'calc(15vh + 16px)',
          right: '16px',
          zIndex: 40,
        }}
      >
        <GestureThrowPanel onThrow={handleGestureThrow} />
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
