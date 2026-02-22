import React, { useRef } from 'react';
import { useGestureThrow, GestureStatus } from '@/hooks/useGestureThrow';

const STATUS_CONFIG: Record<GestureStatus, { label: string; color: string; bg: string }> = {
  IDLE:     { label: '未启动',           color: '#999',    bg: 'rgba(0,0,0,0.04)' },
  READY:    { label: '待机 · 握拳蓄力', color: '#7C5C3A', bg: 'rgba(124,92,58,0.08)' },
  CHARGING: { label: '蓄力中…',          color: '#B8860B', bg: 'rgba(184,134,11,0.12)' },
  THROWING: { label: '投掷！',            color: '#8B2500', bg: 'rgba(139,37,0,0.12)' },
  COOLDOWN: { label: '冷却中',            color: '#888',    bg: 'rgba(0,0,0,0.05)' },
};

interface GestureThrowPanelProps {
  onThrow?: (power: number) => void;
}

export const GestureThrowPanel: React.FC<GestureThrowPanelProps> = ({ onThrow }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { gestureEnabled, status, powerPreview, isLoading, start, stop } =
    useGestureThrow(videoRef);

  React.useEffect(() => {
    window.startThrow = (power: number) => {
      console.log(`[GestureThrow] 投掷触发！蓄力: ${(power * 100).toFixed(0)}%`);
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
  const isCharging = status === 'CHARGING';

  return (
    <div
      style={{
        padding: '14px 18px',
        borderRadius: '10px',
        border: '1px solid rgba(124,92,58,0.25)',
        background: 'rgba(245,240,230,0.92)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        width: '220px',
        fontFamily: "'Noto Serif SC', serif",
        color: '#4A3728',
        boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
      }}
    >
      {/* 标题 */}
      <div style={{
        fontSize: '12px', letterSpacing: '0.15em',
        marginBottom: '10px', opacity: 0.65, textAlign: 'center',
      }}>
        ── 手 势 投 掷 ──
      </div>

      {/* 隐藏 video */}
      <video ref={videoRef} style={{ display: 'none' }} playsInline muted />

      {/* 状态指示 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '8px',
        padding: '7px 10px', borderRadius: '6px',
        background: cfg.bg, marginBottom: '10px',
        transition: 'background 0.3s',
      }}>
        <span style={{
          width: '7px', height: '7px', borderRadius: '50%',
          background: cfg.color, flexShrink: 0,
          animation: isCharging ? 'gesturePulse 0.7s ease-in-out infinite' : 'none',
          boxShadow: isCharging ? `0 0 5px ${cfg.color}` : 'none',
        }} />
        <span style={{ fontSize: '12px', color: cfg.color, fontWeight: 600 }}>
          {isLoading ? '模型加载中…' : cfg.label}
        </span>
      </div>

      {/* 蓄力进度条 */}
      <div style={{ marginBottom: '12px' }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          fontSize: '10px', opacity: 0.55, marginBottom: '4px',
        }}>
          <span>蓄力值</span>
          <span>{(powerPreview * 100).toFixed(0)}%</span>
        </div>
        <div style={{
          width: '100%', height: '5px',
          background: 'rgba(124,92,58,0.12)',
          borderRadius: '3px', overflow: 'hidden',
        }}>
          <div style={{
            height: '5px',
            background: isCharging
              ? `linear-gradient(90deg, #7C5C3A, #D4A017 ${powerPreview * 100}%, #B8860B)`
              : powerPreview > 0
              ? 'rgba(139,37,0,0.5)'
              : 'rgba(124,92,58,0.2)',
            width: `${powerPreview * 100}%`,
            borderRadius: '3px',
            transition: isCharging ? 'none' : 'width 0.2s ease',
          }} />
        </div>
        {/* 满蓄提示 */}
        {isCharging && powerPreview >= 0.99 && (
          <div style={{
            fontSize: '10px', color: '#8B2500', textAlign: 'center',
            marginTop: '3px', letterSpacing: '0.1em',
            animation: 'gestureFlash 0.5s ease-in-out infinite',
          }}>
            ✦ 满蓄！张掌释放
          </div>
        )}
      </div>

      {/* 按钮 */}
      {!gestureEnabled ? (
        <button
          onClick={start}
          disabled={isLoading}
          style={{
            width: '100%', padding: '8px 0',
            background: isLoading
              ? 'rgba(124,92,58,0.3)'
              : 'linear-gradient(135deg, #7C5C3A, #5C3D1E)',
            color: '#F5F0E6', border: 'none', borderRadius: '6px',
            fontSize: '12px', letterSpacing: '0.2em', cursor: isLoading ? 'wait' : 'pointer',
            fontFamily: "'Noto Serif SC', serif",
            transition: 'opacity 0.2s',
          }}
        >
          {isLoading ? '加 载 中…' : '启 动 手 势 识 别'}
        </button>
      ) : (
        <button
          onClick={stop}
          style={{
            width: '100%', padding: '8px 0',
            background: 'rgba(139,37,0,0.06)',
            color: '#8B2500', border: '1px solid rgba(139,37,0,0.25)',
            borderRadius: '6px', fontSize: '12px', letterSpacing: '0.2em',
            cursor: 'pointer', fontFamily: "'Noto Serif SC', serif",
          }}
        >
          关 闭 摄 像 头
        </button>
      )}

      {/* 操作说明 */}
      {gestureEnabled && status !== 'IDLE' && (
        <div style={{
          marginTop: '8px', fontSize: '10px', opacity: 0.5,
          lineHeight: 1.8, textAlign: 'center', letterSpacing: '0.05em',
        }}>
          握拳蓄力（最多3秒）→ 张掌投掷
        </div>
      )}

      <style>{`
        @keyframes gesturePulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(1.5); }
        }
        @keyframes gestureFlash {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
};
