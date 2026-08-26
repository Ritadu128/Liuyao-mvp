import { useCallback, useEffect, useRef, useState } from 'react';
import { FilesetResolver, GestureRecognizer } from '@mediapipe/tasks-vision';

export type GestureStatus = 'IDLE' | 'READY' | 'CHARGING' | 'THROWING' | 'COOLDOWN';

type GestureThrowOptions = {
  onThrow?: (power: number) => void;
};

const CONFIG = {
  frameInterval: 1_000 / 20,
  stableDuration: 200,
  minGestureScore: 0.65,
  minChargeTime: 300,
  maxChargeTime: 3_000,
  cooldownTime: 800,
  handLostTimeout: 1_200,
};

function getCameraErrorMessage(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
      return '摄像头权限被拒绝。请在浏览器地址栏允许摄像头后重新启动。';
    }
    if (error.name === 'NotFoundError') {
      return '未检测到可用摄像头。请连接摄像头后重试。';
    }
    if (error.name === 'NotReadableError') {
      return '摄像头正被其他应用占用。请关闭其他占用后重试。';
    }
  }
  return '手势识别启动失败。请检查摄像头、网络连接和浏览器权限后重试。';
}

export function useGestureThrow(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  { onThrow }: GestureThrowOptions = {},
) {
  const [status, setStatus] = useState<GestureStatus>('IDLE');
  const [gestureEnabled, setGestureEnabled] = useState(false);
  const [powerPreview, setPowerPreview] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastGesture, setLastGesture] = useState('未检测到手势');

  const recognizerRef = useRef<GestureRecognizer | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafIdRef = useRef<number>(0);
  const lastTimestampRef = useRef(-1);
  const onThrowRef = useRef(onThrow);

  const stateRef = useRef({
    status: 'IDLE' as GestureStatus,
    lastGesture: 'None',
    gestureStartTime: 0,
    chargeStartTime: 0,
    cooldownTimer: 0 as ReturnType<typeof setTimeout> | number,
    lastHandTime: Date.now(),
    lastProcessTime: 0,
  });

  useEffect(() => {
    onThrowRef.current = onThrow;
  }, [onThrow]);

  const updateStatus = useCallback((nextStatus: GestureStatus) => {
    stateRef.current.status = nextStatus;
    setStatus(nextStatus);
  }, []);

  const resetGestureStability = useCallback(() => {
    stateRef.current.lastGesture = 'None';
    stateRef.current.gestureStartTime = 0;
  }, []);

  const getCurrentPower = useCallback(() => {
    const elapsed = Date.now() - stateRef.current.chargeStartTime;
    return Math.max(0, Math.min(1, elapsed / CONFIG.maxChargeTime));
  }, []);

  const cancelCharge = useCallback(() => {
    if (stateRef.current.status === 'CHARGING') {
      updateStatus('READY');
      setPowerPreview(0);
    }
  }, [updateStatus]);

  const processFrame = useCallback(() => {
    const video = videoRef.current;
    const recognizer = recognizerRef.current;

    if (!video || !recognizer || video.readyState < 2 || video.paused || video.ended || video.videoWidth === 0) {
      rafIdRef.current = requestAnimationFrame(processFrame);
      return;
    }

    const now = performance.now();
    if (now - stateRef.current.lastProcessTime < CONFIG.frameInterval) {
      rafIdRef.current = requestAnimationFrame(processFrame);
      return;
    }

    const timestamp = Math.max(now, lastTimestampRef.current + 1);
    lastTimestampRef.current = timestamp;
    stateRef.current.lastProcessTime = now;

    let results;
    try {
      results = recognizer.recognizeForVideo(video, timestamp);
    } catch (error) {
      console.error('[GestureThrow] recognizeForVideo error:', error);
      rafIdRef.current = requestAnimationFrame(processFrame);
      return;
    }

    const currentMs = Date.now();
    const state = stateRef.current;
    const topGesture = results.gestures[0]?.[0];
    const hasReliableGesture = Boolean(topGesture && (topGesture.score ?? 0) >= CONFIG.minGestureScore);

    if (state.status === 'CHARGING') {
      setPowerPreview(getCurrentPower());
    }

    if (!hasReliableGesture) {
      setLastGesture('未检测到稳定手势');
      if (currentMs - state.lastHandTime > CONFIG.handLostTimeout) {
        state.lastHandTime = currentMs;
        resetGestureStability();
        cancelCharge();
      }
      rafIdRef.current = requestAnimationFrame(processFrame);
      return;
    }

    state.lastHandTime = currentMs;
    const gestureCategory = topGesture.categoryName;
    const gestureLabel = gestureCategory === 'Closed_Fist'
      ? '握拳'
      : gestureCategory === 'Open_Palm'
        ? '张掌'
        : '其他手势';
    setLastGesture(gestureLabel);

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
        }
        break;

      case 'CHARGING':
        if (stableGesture === 'Open_Palm' && currentMs - state.chargeStartTime >= CONFIG.minChargeTime) {
          const power = getCurrentPower();
          updateStatus('THROWING');
          setPowerPreview(power);
          onThrowRef.current?.(power);
          clearTimeout(state.cooldownTimer as number);
          state.cooldownTimer = setTimeout(() => {
            updateStatus('COOLDOWN');
            setPowerPreview(0);
            resetGestureStability();
            state.cooldownTimer = setTimeout(() => updateStatus('READY'), CONFIG.cooldownTime);
          }, CONFIG.cooldownTime);
        } else if (stableGesture !== 'None' && stableGesture !== 'Closed_Fist' && stableGesture !== 'Open_Palm') {
          cancelCharge();
        }
        break;

      case 'THROWING':
      case 'COOLDOWN':
      case 'IDLE':
        break;
    }

    rafIdRef.current = requestAnimationFrame(processFrame);
  }, [cancelCharge, getCurrentPower, resetGestureStability, updateStatus, videoRef]);

  useEffect(() => {
    if (gestureEnabled) {
      lastTimestampRef.current = -1;
      rafIdRef.current = requestAnimationFrame(processFrame);
    } else {
      cancelAnimationFrame(rafIdRef.current);
    }
    return () => cancelAnimationFrame(rafIdRef.current);
  }, [gestureEnabled, processFrame]);

  const stop = useCallback(() => {
    setGestureEnabled(false);
    updateStatus('IDLE');
    setPowerPreview(0);
    setLastGesture('未检测到手势');
    clearTimeout(stateRef.current.cooldownTimer as number);
    resetGestureStability();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    lastTimestampRef.current = -1;
  }, [resetGestureStability, updateStatus, videoRef]);

  const start = useCallback(async () => {
    if (!videoRef.current || isLoading) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('当前浏览器不支持摄像头访问。请使用最新版 Chrome、Edge 或 Safari。');
      return;
    }

    setError(null);
    setIsLoading(true);
    updateStatus('IDLE');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
      });
      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();

      if (!recognizerRef.current) {
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.32/wasm',
        );
        let recognizer: GestureRecognizer | null = null;
        for (const delegate of ['GPU', 'CPU'] as const) {
          try {
            recognizer = await GestureRecognizer.createFromOptions(vision, {
              baseOptions: {
                modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task',
                delegate,
              },
              runningMode: 'VIDEO',
              numHands: 1,
            });
            break;
          } catch (error) {
            console.warn(`[GestureThrow] ${delegate} delegate unavailable; trying fallback.`, error);
          }
        }
        if (!recognizer) throw new Error('Gesture recognizer could not be initialized');
        recognizerRef.current = recognizer;
      }

      stateRef.current.lastHandTime = Date.now();
      stateRef.current.lastProcessTime = 0;
      resetGestureStability();
      setGestureEnabled(true);
      updateStatus('READY');
    } catch (startError) {
      console.error('[GestureThrow] start error:', startError);
      setError(getCameraErrorMessage(startError));
      stop();
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, resetGestureStability, stop, updateStatus, videoRef]);

  useEffect(() => () => stop(), [stop]);

  return {
    gestureEnabled,
    status,
    powerPreview,
    isLoading,
    error,
    lastGesture,
    start,
    stop,
  };
}
