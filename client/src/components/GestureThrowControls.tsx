import { useEffect, useState } from 'react';
import { Hand, X } from 'lucide-react';
import type { GestureStatus } from '@/hooks/useGestureThrow';

const STATUS_CONFIG: Record<GestureStatus, { label: string; color: string }> = {
  IDLE: { label: '正在准备手势投掷…', color: '#8a6a2f' },
  READY: { label: '请握拳蓄力', color: '#7a5c10' },
  CHARGING: { label: '张开手掌投掷', color: '#a66f08' },
  THROWING: { label: '投掷中', color: '#8b4b16' },
  COOLDOWN: { label: '准备下一爻', color: '#82766a' },
};

interface GestureThrowIndicatorProps {
  gestureEnabled: boolean;
  cameraActive: boolean;
  status: GestureStatus;
  powerPreview: number;
  isLoading: boolean;
  error: string | null;
  disabled?: boolean;
}

export function GestureThrowIndicator({
  gestureEnabled,
  cameraActive,
  status,
  powerPreview,
  isLoading,
  error,
  disabled = false,
}: GestureThrowIndicatorProps) {
  const [loadingSeconds, setLoadingSeconds] = useState(0);

  useEffect(() => {
    if (!isLoading) {
      setLoadingSeconds(0);
      return;
    }
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setLoadingSeconds(Math.floor((Date.now() - startedAt) / 1_000));
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [isLoading]);

  if (!gestureEnabled && !isLoading && !error) return null;

  const config = STATUS_CONFIG[status];
  const label = error
    ? error
    : isLoading
      ? cameraActive
        ? `摄像头已开启 · 正在准备手势识别（${loadingSeconds}秒）`
        : '正在请求并启动摄像头…'
      : disabled && status === 'READY'
        ? '投掷动画进行中…'
        : config.label;
  const color = error ? '#9a3412' : config.color;
  const isCharging = status === 'CHARGING';

  return (
    <div
      aria-live="polite"
      role={error ? 'alert' : 'status'}
      style={{
        width: 'min(360px, calc(100vw - 32px))',
        padding: '9px 12px',
        borderRadius: '7px',
        border: `1px solid ${error ? 'rgba(154,52,18,0.26)' : 'rgba(160,120,60,0.28)'}`,
        background: 'rgba(245,240,230,0.90)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        boxShadow: '0 4px 18px rgba(90,62,20,0.10)',
        color,
        fontFamily: '"Noto Serif SC", serif',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '9px', minWidth: 0 }}>
        <span
          aria-hidden="true"
          style={{
            width: '7px',
            height: '7px',
            flexShrink: 0,
            borderRadius: '50%',
            background: color,
            animation: isCharging || isLoading ? 'gesturePulse 0.7s ease-in-out infinite' : 'none',
          }}
        />
        <span style={{ flexShrink: error ? 1 : 0, fontSize: '11px', fontWeight: 600, lineHeight: 1.45, whiteSpace: error ? 'normal' : 'nowrap' }}>
          {label}
        </span>
        {!error && <div
            aria-label={`蓄力值 ${Math.round(powerPreview * 100)}%`}
            style={{
              flex: 1,
              minWidth: '72px',
              height: '5px',
              overflow: 'hidden',
              borderRadius: '3px',
              background: 'rgba(124,92,58,0.13)',
            }}
          >
          <div
            style={{
              width: isLoading ? '42%' : `${powerPreview * 100}%`,
              height: '100%',
              borderRadius: '3px',
              background: 'linear-gradient(90deg, #9b7617, #e1bf51, #9b7617)',
              backgroundSize: isLoading ? '200% 100%' : '100% 100%',
              animation: isLoading ? 'gestureLoading 1.1s linear infinite' : 'none',
              transition: isCharging ? 'none' : 'width 160ms ease-out',
            }}
          />
        </div>}
      </div>

      <style>{`
        @keyframes gesturePulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.42; transform: scale(1.4); }
        }
        @keyframes gestureLoading {
          from { transform: translateX(-105%); }
          to { transform: translateX(245%); }
        }
      `}</style>
    </div>
  );
}

interface GestureThrowButtonProps {
  gestureEnabled: boolean;
  isLoading: boolean;
  disabled?: boolean;
  onStart: () => void;
  onStop: () => void;
}

export function GestureThrowButton({
  gestureEnabled,
  isLoading,
  disabled = false,
  onStart,
  onStop,
}: GestureThrowButtonProps) {
  const isActive = gestureEnabled || isLoading;
  const actionDisabled = disabled && !isActive;
  const label = isLoading ? '取消启动' : gestureEnabled ? '关闭手势' : '手势投掷';

  return (
    <button
      type="button"
      onClick={isActive ? onStop : onStart}
      disabled={actionDisabled}
      aria-pressed={gestureEnabled}
      title={gestureEnabled ? '关闭摄像头与手势识别' : '开启摄像头，用握拳和张掌完成投掷'}
      style={{
        flex: 1,
        minWidth: 0,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '5px',
        padding: '5px 9px',
        border: `1px solid ${isActive ? 'rgba(151,108,20,0.56)' : 'rgba(160,120,60,0.32)'}`,
        borderRadius: '3px',
        background: isActive ? 'rgba(200,168,75,0.14)' : 'none',
        color: actionDisabled ? 'rgba(120,85,20,0.30)' : isActive ? '#775411' : 'rgba(120,85,20,0.66)',
        fontSize: '10px',
        fontFamily: '"Noto Serif SC", serif',
        letterSpacing: '0.08em',
        cursor: actionDisabled ? 'not-allowed' : 'pointer',
        transition: 'all 0.2s ease',
        whiteSpace: 'nowrap',
      }}
    >
      {isActive ? <X size={13} strokeWidth={1.7} /> : <Hand size={13} strokeWidth={1.7} />}
      <span>{label}</span>
    </button>
  );
}
