import React, { useRef } from 'react';
import { useGestureThrow, GestureStatus } from '@/hooks/useGestureThrow';

// 状态标签与颜色映射（宣纸风格）
const STATUS_CONFIG: Record<GestureStatus, { label: string; color: string; bg: string }> = {
  READY:    { label: '待机 · 握拳蓄力', color: '#7C5C3A', bg: 'rgba(124,92,58,0.08)' },
  CHARGING: { label: '蓄力中…',          color: '#B8860B', bg: 'rgba(184,134,11,0.12)' },
  THROWING: { label: '投掷！',            color: '#8B2500', bg: 'rgba(139,37,0,0.12)' },
  COOLDOWN: { label: '冷却中',            color: '#888',    bg: 'rgba(0,0,0,0.05)' },
};

interface GestureThrowPanelProps {
  /** 当手势触发投掷时的回调，power ∈ [0, 1] */
  onThrow?: (power: number) => void;
}

export const GestureThrowPanel: React.FC<GestureThrowPanelProps> = ({ onThrow }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { gestureEnabled, status, powerPreview, start, stop } = useGestureThrow(videoRef);

  // 将 window.startThrow 绑定到 onThrow 回调
  React.useEffect(() => {
    window.startThrow = (power: number) => {
      console.log(`[GestureThrow] 投掷触发！力度: ${(power * 100).toFixed(0)}%`);
      onThrow?.(power);
    };
    window.onCameraDenied = () => {
      alert('请允许使用摄像头才能使用手势投掷功能！');
    };
    return () => {
      window.startThrow = undefined;
      window.onCameraDenied = undefined;
    };
  }, [onThrow]);

  const cfg = STATUS_CONFIG[status];

  return (
    <div
      style={{
        padding: '14px 18px',
        borderRadius: '10px',
        border: '1px solid rgba(124,92,58,0.25)',
        background: 'rgba(245,240,230,0.92)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        maxWidth: '280px',
        fontFamily: "'Noto Serif SC', serif",
        color: '#4A3728',
        boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
      }}
    >
      {/* 标题 */}
      <div style={{ fontSize: '13px', letterSpacing: '0.15em', marginBottom: '12px', opacity: 0.7, textAlign: 'center' }}>
        ── 手 势 投 掷 ──
      </div>

      {/* 隐藏的 video 元素 */}
      <video ref={videoRef} style={{ display: 'none' }} playsInline muted />

      {/* 状态显示 */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '8px 12px', borderRadius: '6px',
          background: cfg.bg, marginBottom: '12px',
          transition: 'background 0.3s',
        }}
      >
        <span style={{
          width: '8px', height: '8px', borderRadius: '50%',
          background: cfg.color, flexShrink: 0,
          boxShadow: status === 'CHARGING' ? `0 0 6px ${cfg.color}` : 'none',
          animation: status === 'CHARGING' ? 'gesturePulse 0.8s ease-in-out infinite' : 'none',
        }} />
        <span style={{ fontSize: '13px', color: cfg.color, fontWeight: 600 }}>
          {cfg.label}
        </span>
      </div>

      {/* 蓄力进度条 */}
      <div style={{ marginBottom: '14px' }}>
        <div style={{ fontSize: '11px', opacity: 0.6, marginBottom: '5px', letterSpacing: '0.1em' }}>
          蓄力值 {(powerPreview * 100).toFixed(0)}%
        </div>
        <div style={{
          width: '100%', height: '6px',
          background: 'rgba(124,92,58,0.15)',
          borderRadius: '3px', overflow: 'hidden',
        }}>
          <div style={{
            height: '6px',
            background: status === 'CHARGING'
              ? 'linear-gradient(90deg, #B8860B, #D4A017)'
              : 'rgba(124,92,58,0.3)',
            width: `${powerPreview * 100}%`,
            borderRadius: '3px',
            transition: 'width 0.1s linear',
          }} />
        </div>
      </div>

      {/* 操作按钮 */}
      {!gestureEnabled ? (
        <button
          onClick={start}
          style={{
            width: '100%', padding: '9px 0',
            background: 'linear-gradient(135deg, #7C5C3A, #5C3D1E)',
            color: '#F5F0E6', border: 'none', borderRadius: '6px',
            fontSize: '13px', letterSpacing: '0.2em', cursor: 'pointer',
            fontFamily: "'Noto Serif SC', serif",
          }}
        >
          启 动 手 势 识 别
        </button>
      ) : (
        <button
          onClick={stop}
          style={{
            width: '100%', padding: '9px 0',
            background: 'rgba(139,37,0,0.08)',
            color: '#8B2500', border: '1px solid rgba(139,37,0,0.3)',
            borderRadius: '6px', fontSize: '13px', letterSpacing: '0.2em',
            cursor: 'pointer', fontFamily: "'Noto Serif SC', serif",
          }}
        >
          关 闭 摄 像 头
        </button>
      )}

      {/* 使用说明 */}
      {gestureEnabled && (
        <div style={{ marginTop: '10px', fontSize: '11px', opacity: 0.55, lineHeight: 1.7, textAlign: 'center' }}>
          握拳 → 蓄力 → 张掌 → 投掷
        </div>
      )}

      <style>{`
        @keyframes gesturePulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.4); }
        }
      `}</style>
    </div>
  );
};
