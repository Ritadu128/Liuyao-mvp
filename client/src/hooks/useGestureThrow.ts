/**
 * useGestureThrow.ts
 *
 * 手势投掷 Hook（MediaPipe GestureRecognizer）
 *
 * 蓄力逻辑：
 *   - 握拳（Closed_Fist）稳定 200ms → 进入 CHARGING，开始计时
 *   - 握拳持续时间 0→MAX_CHARGE_MS（默认 3000ms）线性映射到 power 0→1
 *   - 张掌（Open_Palm）稳定 200ms → 以当前 power 触发投掷
 *
 * 初始化：
 *   - 模型按需加载（调用 start() 时才初始化），避免进入页面就触发 WASM 日志
 */
import { useRef, useState, useCallback, useEffect } from 'react';
import { FilesetResolver, GestureRecognizer } from '@mediapipe/tasks-vision';

declare global {
  interface Window {
    startThrow?: (power: number) => void;
    onCameraDenied?: () => void;
  }
}

export type GestureStatus = 'IDLE' | 'READY' | 'CHARGING' | 'THROWING' | 'COOLDOWN';

// ── Configuration ──────────────────────────────────────────────────────────
const CONFIG = {
  frameInterval: 1000 / 20,   // ~20 fps
  stableDuration: 200,         // ms gesture must be stable before registering
  minChargeTime: 300,          // ms fist must be held before open-palm can fire
  maxChargeTime: 3000,         // ms for full power (100%)
  cooldownTime: 600,
  handLostTimeout: 1500,
};

// ── Hook ───────────────────────────────────────────────────────────────────
export function useGestureThrow(videoRef: React.RefObject<HTMLVideoElement | null>) {
  const [status, setStatus] = useState<GestureStatus>('IDLE');
  const [gestureEnabled, setGestureEnabled] = useState(false);
  const [powerPreview, setPowerPreview] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const recognizerRef = useRef<GestureRecognizer | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafIdRef = useRef<number>(0);
  const lastTimestampRef = useRef<number>(-1);

  const stateRef = useRef({
    status: 'IDLE' as GestureStatus,
    lastGesture: 'None',
    gestureStartTime: 0,
    chargeStartTime: 0,    // when fist became stable
    cooldownTimer: 0 as ReturnType<typeof setTimeout> | number,
    lastHandTime: Date.now(),
    lastProcessTime: 0,
  });

  // ── Helpers ──────────────────────────────────────────────────────────────
  const updateStatus = useCallback((s: GestureStatus) => {
    stateRef.current.status = s;
    setStatus(s);
  }, []);

  /** power = clamp(elapsed / maxChargeTime, 0, 1) */
  const getCurrentPower = useCallback(() => {
    const elapsed = Date.now() - stateRef.current.chargeStartTime;
    return Math.max(0, Math.min(1, elapsed / CONFIG.maxChargeTime));
  }, []);

  // ── Recognition loop ──────────────────────────────────────────────────────
  const processFrame = useCallback(() => {
    const video = videoRef.current;
    const recognizer = recognizerRef.current;

    if (
      !video || !recognizer ||
      video.readyState < 2 ||
      video.paused || video.ended ||
      video.videoWidth === 0
    ) {
      rafIdRef.current = requestAnimationFrame(processFrame);
      return;
    }

    const now = performance.now();
    if (now - stateRef.current.lastProcessTime < CONFIG.frameInterval) {
      rafIdRef.current = requestAnimationFrame(processFrame);
      return;
    }

    // Strictly monotonic timestamp required by MediaPipe
    const ts = Math.max(now, lastTimestampRef.current + 1);
    lastTimestampRef.current = ts;
    stateRef.current.lastProcessTime = now;

    let results;
    try {
      results = recognizer.recognizeForVideo(video, ts);
    } catch (e) {
      console.error('[GestureThrow] recognizeForVideo error:', e);
      rafIdRef.current = requestAnimationFrame(processFrame);
      return;
    }

    const hasHand = results.gestures.length > 0;
    const currentMs = Date.now();
    const state = stateRef.current;

    // ── Update power preview while charging ──────────────────────────────
    if (state.status === 'CHARGING') {
      setPowerPreview(getCurrentPower());
    }

    if (!hasHand) {
      if (currentMs - state.lastHandTime > CONFIG.handLostTimeout) {
        state.lastHandTime = currentMs;
        if (state.status === 'CHARGING') {
          updateStatus('READY');
          setPowerPreview(0);
        }
      }
    } else {
      state.lastHandTime = currentMs;
      const gestureCategory = results.gestures[0][0].categoryName;

      // Require gesture to be stable for stableDuration ms
      let stableGesture = 'None';
      if (gestureCategory === state.lastGesture) {
        if (currentMs - state.gestureStartTime >= CONFIG.stableDuration) {
          stableGesture = gestureCategory;
        }
      } else {
        state.lastGesture = gestureCategory;
        state.gestureStartTime = currentMs;
      }

      switch (state.status) {
        case 'READY':
          if (stableGesture === 'Closed_Fist') {
            updateStatus('CHARGING');
            state.chargeStartTime = currentMs;
            setPowerPreview(0);
            console.log('[GestureThrow] CHARGING started');
          }
          break;

        case 'CHARGING': {
          if (
            stableGesture === 'Open_Palm' &&
            currentMs - state.chargeStartTime >= CONFIG.minChargeTime
          ) {
            const power = getCurrentPower();
            console.log(`[GestureThrow] THROWING power=${(power * 100).toFixed(0)}%`);
            updateStatus('THROWING');
            setPowerPreview(power);
            window.startThrow?.(power);
            clearTimeout(state.cooldownTimer as number);
            state.cooldownTimer = setTimeout(() => {
              updateStatus('READY');
              setPowerPreview(0);
            }, CONFIG.cooldownTime);
          } else if (
            stableGesture !== 'None' &&
            stableGesture !== 'Closed_Fist' &&
            stableGesture !== 'Open_Palm'
          ) {
            // Unexpected gesture cancels charge
            updateStatus('READY');
            setPowerPreview(0);
          }
          break;
        }

        case 'THROWING':
        case 'COOLDOWN':
        case 'IDLE':
          break;
      }
    }

    rafIdRef.current = requestAnimationFrame(processFrame);
  }, [gestureEnabled, updateStatus, getCurrentPower]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Start / stop loop ────────────────────────────────────────────────────
  useEffect(() => {
    if (gestureEnabled) {
      lastTimestampRef.current = -1;
      rafIdRef.current = requestAnimationFrame(processFrame);
    } else {
      cancelAnimationFrame(rafIdRef.current);
    }
    return () => cancelAnimationFrame(rafIdRef.current);
  }, [gestureEnabled, processFrame]);

  // ── Camera + model start (on-demand) ─────────────────────────────────────
  const start = useCallback(async () => {
    if (!videoRef.current) return;
    setIsLoading(true);
    updateStatus('IDLE');

    try {
      // 1. Request camera first (fast, user-visible feedback)
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' },
      });
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      streamRef.current = stream;

      // 2. Load MediaPipe model on-demand (only if not already loaded)
      if (!recognizerRef.current) {
        console.log('[GestureThrow] Loading MediaPipe model…');
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.32/wasm'
        );
        let recognizer: GestureRecognizer | null = null;
        for (const delegate of ['GPU', 'CPU'] as const) {
          try {
            recognizer = await GestureRecognizer.createFromOptions(vision, {
              baseOptions: {
                modelAssetPath:
                  'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task',
                delegate,
              },
              runningMode: 'VIDEO',
              numHands: 1,
            });
            console.log(`[GestureThrow] Model loaded (delegate: ${delegate})`);
            break;
          } catch (e) {
            console.warn(`[GestureThrow] delegate ${delegate} failed, trying next…`, e);
          }
        }
        if (!recognizer) throw new Error('Failed to load MediaPipe model');
        recognizerRef.current = recognizer;
      }

      setIsLoading(false);
      setGestureEnabled(true);
      updateStatus('READY');
      console.log('[GestureThrow] Ready');
    } catch (err) {
      console.error('[GestureThrow] Start error:', err);
      setIsLoading(false);
      // Camera denied
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        window.onCameraDenied?.();
      }
      // Clean up stream if model load failed
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
      if (videoRef.current) videoRef.current.srcObject = null;
    }
  }, [updateStatus]);

  const stop = useCallback(() => {
    setGestureEnabled(false);
    updateStatus('IDLE');
    setPowerPreview(0);
    clearTimeout(stateRef.current.cooldownTimer as number);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    lastTimestampRef.current = -1;
    console.log('[GestureThrow] Stopped');
  }, [updateStatus]);

  return { gestureEnabled, status, powerPreview, isLoading, start, stop };
}
