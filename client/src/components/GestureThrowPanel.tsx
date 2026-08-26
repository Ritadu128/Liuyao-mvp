import { useRef } from 'react';
import { type GestureStatus, useGestureThrow } from '@/hooks/useGestureThrow';

const STATUS_CONFIG: Record<GestureStatus, { label: string; color: string; background: string }> = {
  IDLE: { label: '未启动', color: '#82766a', background: 'rgba(0, 0, 0, 0.04)' },
  READY: { label: '摄像头已就绪 · 请握拳蓄力', color: '#6f522f', background: 'rgba(124, 92, 58, 0.09)' },
  CHARGING: { label: '蓄力中 · 保持握拳', color: '#a36b12', background: 'rgba(184, 134, 11, 0.14)' },
  THROWING: { label: '已释放 · 正在投掷', color: '#8b2500', background: 'rgba(139, 37, 0, 0.12)' },
  COOLDOWN: { label: '投掷冷却中', color: '#82766a', background: 'rgba(0, 0, 0, 0.05)' },
};

interface GestureThrowPanelProps {
  onThrow: (power: number) => void;
  disabled?: boolean;
}

export function GestureThrowPanel({ onThrow, disabled = false }: GestureThrowPanelProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const {
    gestureEnabled,
    status,
    powerPreview,
    isLoading,
    error,
    lastGesture,
    start,
    stop,
  } = useGestureThrow(videoRef, { onThrow });

  const config = STATUS_CONFIG[status];
  const isCharging = status === 'CHARGING';
  const actionDisabled = disabled || isLoading;

  return (
    <section
      aria-label="手势投掷控制"
      style={{
        width: '244px',
        padding: '12px',
        borderRadius: '10px',
        border: '1px solid rgba(124, 92, 58, 0.28)',
        background: 'rgba(245, 240, 230, 0.95)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        fontFamily: '"Noto Serif SC", serif',
        color: '#4a3728',
        boxShadow: '0 6px 22px rgba(61, 43, 21, 0.14)',
      }}
    >
      <div style={{ fontSize: '12px', letterSpacing: '0.16em', opacity: 0.7, textAlign: 'center', marginBottom: '8px' }}>
        ── 手 势 投 掷 ──
      </div>

      <div
        style={{
          position: 'relative',
          height: '128px',
          overflow: 'hidden',
          borderRadius: '7px',
          background: 'linear-gradient(135deg, rgba(99, 72, 40, 0.16), rgba(245, 240, 230, 0.7))',
          border: '1px solid rgba(124, 92, 58, 0.2)',
          marginBottom: '9px',
        }}
      >
        <video
          ref={videoRef}
          playsInline
          muted
          style={{
            display: gestureEnabled ? 'block' : 'none',
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transform: 'scaleX(-1)',
          }}
        />
        {!gestureEnabled && (
          <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center', padding: '12px', color: 'rgba(95, 70, 40, 0.7)', fontSize: '11px', lineHeight: 1.7 }}>
            <span>{isLoading ? '正在启动摄像头与手势模型…' : '启动后将显示摄像头画面\n握拳蓄力，张掌投掷'}</span>
          </div>
        )}
        {gestureEnabled && (
          <div style={{ position: 'absolute', left: '7px', bottom: '7px', padding: '3px 6px', borderRadius: '3px', background: 'rgba(45, 31, 16, 0.6)', color: '#fff8e7', fontSize: '10px', letterSpacing: '0.04em' }}>
            识别：{lastGesture}
          </div>
        )}
      </div>

      <div
        aria-live="polite"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '7px',
          padding: '7px 8px',
          borderRadius: '6px',
          background: config.background,
          marginBottom: '8px',
        }}
      >
        <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: config.color, flexShrink: 0, animation: isCharging ? 'gesturePulse 0.7s ease-in-out infinite' : 'none' }} />
        <span style={{ fontSize: '11px', color: config.color, fontWeight: 600, lineHeight: 1.4 }}>
          {isLoading ? '模型加载中…' : config.label}
        </span>
      </div>

      <div style={{ marginBottom: '8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', opacity: 0.62, marginBottom: '4px' }}>
          <span>蓄力值</span>
          <span>{Math.round(powerPreview * 100)}%</span>
        </div>
        <div style={{ width: '100%', height: '6px', background: 'rgba(124, 92, 58, 0.14)', borderRadius: '3px', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${powerPreview * 100}%`, borderRadius: '3px', background: 'linear-gradient(90deg, #7c5c3a, #d4a017, #8b2500)', transition: isCharging ? 'none' : 'width 160ms ease-out' }} />
        </div>
        {isCharging && powerPreview >= 0.99 && (
          <div style={{ color: '#8b2500', textAlign: 'center', fontSize: '10px', marginTop: '4px', letterSpacing: '0.08em' }}>
            已满蓄力 · 张掌释放
          </div>
        )}
      </div>

      {error && (
        <p role="alert" style={{ margin: '0 0 8px', color: '#9a3412', fontSize: '10px', lineHeight: 1.55, padding: '6px 7px', background: 'rgba(180, 83, 9, 0.09)', borderRadius: '5px' }}>
          {error}
        </p>
      )}

      {!gestureEnabled ? (
        <button
          onClick={start}
          disabled={actionDisabled}
          style={{
            width: '100%', padding: '8px 0', border: 'none', borderRadius: '6px',
            background: actionDisabled ? 'rgba(124, 92, 58, 0.3)' : 'linear-gradient(135deg, #7c5c3a, #5c3d1e)',
            color: '#f5f0e6', fontSize: '11px', letterSpacing: '0.18em',
            cursor: actionDisabled ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
          }}
        >
          {isLoading ? '加 载 中…' : disabled ? '投掷动画进行中' : '启 动 手 势 识 别'}
        </button>
      ) : (
        <button
          onClick={stop}
          style={{ width: '100%', padding: '8px 0', background: 'rgba(139, 37, 0, 0.06)', color: '#8b2500', border: '1px solid rgba(139, 37, 0, 0.28)', borderRadius: '6px', fontSize: '11px', letterSpacing: '0.18em', cursor: 'pointer', fontFamily: 'inherit' }}
        >
          关 闭 摄 像 头
        </button>
      )}

      {gestureEnabled && (
        <p style={{ margin: '8px 0 0', textAlign: 'center', fontSize: '10px', lineHeight: 1.6, opacity: 0.63 }}>
          稳定握拳后开始蓄力，张开手掌释放投掷。
        </p>
      )}

      <style>{`
        @keyframes gesturePulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.45; transform: scale(1.45); }
        }
      `}</style>
    </section>
  );
}
