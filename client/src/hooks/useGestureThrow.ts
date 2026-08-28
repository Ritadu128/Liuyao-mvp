import { useCallback, useEffect, useRef, useState } from 'react';
import { FilesetResolver, GestureRecognizer } from '@mediapipe/tasks-vision';

export type GestureStatus = 'IDLE' | 'READY' | 'CHARGING' | 'THROWING' | 'COOLDOWN';

type GestureThrowOptions = {
  onThrow?: (power: number) => void;
  disabled?: boolean;
};

const CONFIG = {
  frameInterval: 1_000 / 20,
  stableDuration: 200,
  minGestureScore: 0.65,
  minChargeTime: 300,
  maxChargeTime: 3_000,
  cooldownTime: 800,
  handLostTimeout: 1_200,
  cameraReadyTimeout: 12_000,
  modelReadyTimeout: 45_000,
};

const MEDIAPIPE_WASM_PATH = '/mediapipe/wasm';
const GESTURE_MODEL_PATH = '/mediapipe/gesture_recognizer.task';

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(
      value => {
        window.clearTimeout(timeout);
        resolve(value);
      },
      error => {
        window.clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

function waitForVideoReady(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error('CAMERA_READY_TIMEOUT'));
    }, CONFIG.cameraReadyTimeout);

    const handleReady = () => {
      if (video.videoWidth === 0) return;
      cleanup();
      resolve();
    };
    const handleError = () => {
      cleanup();
      reject(video.error ?? new Error('CAMERA_PLAYBACK_FAILED'));
    };
    const cleanup = () => {
      window.clearTimeout(timeout);
      video.removeEventListener('loadeddata', handleReady);
      video.removeEventListener('canplay', handleReady);
      video.removeEventListener('error', handleError);
    };

    video.addEventListener('loadeddata', handleReady);
    video.addEventListener('canplay', handleReady);
    video.addEventListener('error', handleError);
  });
}

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
  if (error instanceof Error) {
    if (error instanceof WebAssembly.CompileError || /WebAssembly|wasm|Content Security Policy/i.test(error.message)) {
      return '手势模型被浏览器安全策略阻止。请刷新页面后重新启动手势投掷。';
    }
    if (error.message === 'CAMERA_READY_TIMEOUT' || error.message === 'CAMERA_PLAYBACK_FAILED') {
      return '已取得摄像头权限，但画面没有成功启动。请关闭占用摄像头的应用，刷新页面后重试。';
    }
    if (error.message === 'GESTURE_MODEL_TIMEOUT') {
      return '摄像头已打开，但手势模型加载超时。请刷新页面后重试。';
    }
  }
  return '手势识别启动失败。请检查摄像头和浏览器权限后重试。';
}

export function useGestureThrow(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  { onThrow, disabled = false }: GestureThrowOptions = {},
) {
  const [status, setStatus] = useState<GestureStatus>('IDLE');
  const [gestureEnabled, setGestureEnabled] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [powerPreview, setPowerPreview] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastGesture, setLastGesture] = useState('未检测到手势');

  const recognizerRef = useRef<GestureRecognizer | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafIdRef = useRef<number>(0);
  const lastTimestampRef = useRef(-1);
  const onThrowRef = useRef(onThrow);
  const disabledRef = useRef(disabled);
  const startSessionRef = useRef(0);

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

  useEffect(() => {
    disabledRef.current = disabled;
  }, [disabled]);

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

    if (disabledRef.current && (state.status === 'READY' || state.status === 'CHARGING')) {
      cancelCharge();
      resetGestureStability();
      rafIdRef.current = requestAnimationFrame(processFrame);
      return;
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

  const releaseCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.srcObject = null;
    }
  }, [videoRef]);

  const stop = useCallback(() => {
    startSessionRef.current += 1;
    setGestureEnabled(false);
    setCameraActive(false);
    setIsLoading(false);
    setError(null);
    updateStatus('IDLE');
    setPowerPreview(0);
    setLastGesture('未检测到手势');
    clearTimeout(stateRef.current.cooldownTimer as number);
    resetGestureStability();
    releaseCamera();
    lastTimestampRef.current = -1;
  }, [releaseCamera, resetGestureStability, updateStatus]);

  const start = useCallback(async () => {
    const video = videoRef.current;
    if (!video || isLoading || gestureEnabled) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('当前浏览器不支持摄像头访问。请使用最新版 Chrome、Edge 或 Safari。');
      return;
    }

    setError(null);
    setIsLoading(true);
    setCameraActive(false);
    updateStatus('IDLE');
    releaseCamera();
    const session = ++startSessionRef.current;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
      });
      if (session !== startSessionRef.current) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }

      streamRef.current = stream;
      video.srcObject = stream;
      await withTimeout(video.play(), CONFIG.cameraReadyTimeout, 'CAMERA_PLAYBACK_FAILED');
      await waitForVideoReady(video);
      if (session !== startSessionRef.current) return;

      setCameraActive(true);
      stream.getVideoTracks().forEach(track => {
        track.addEventListener('ended', () => {
          if (session !== startSessionRef.current) return;
          stop();
          setError('摄像头连接已中断。请检查设备后重新启动手势投掷。');
        }, { once: true });
      });

      if (!recognizerRef.current) {
        const vision = await withTimeout(
          FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_PATH),
          CONFIG.modelReadyTimeout,
          'GESTURE_MODEL_TIMEOUT',
        );
        let recognizer: GestureRecognizer | null = null;
        for (const delegate of ['GPU', 'CPU'] as const) {
          try {
            recognizer = await withTimeout(
              GestureRecognizer.createFromOptions(vision, {
                baseOptions: { modelAssetPath: GESTURE_MODEL_PATH, delegate },
                runningMode: 'VIDEO',
                numHands: 1,
              }),
              CONFIG.modelReadyTimeout,
              'GESTURE_MODEL_TIMEOUT',
            );
            break;
          } catch (error) {
            console.warn(`[GestureThrow] ${delegate} delegate unavailable; trying fallback.`, error);
          }
        }
        if (!recognizer) throw new Error('Gesture recognizer could not be initialized');
        if (session !== startSessionRef.current) {
          recognizer.close();
          return;
        }
        recognizerRef.current = recognizer;
      }

      if (session !== startSessionRef.current) return;

      stateRef.current.lastHandTime = Date.now();
      stateRef.current.lastProcessTime = 0;
      resetGestureStability();
      setGestureEnabled(true);
      updateStatus('READY');
    } catch (startError) {
      if (session !== startSessionRef.current) return;
      console.error('[GestureThrow] start error:', startError);
      startSessionRef.current += 1;
      setError(getCameraErrorMessage(startError));
      setGestureEnabled(false);
      setCameraActive(false);
      setIsLoading(false);
      updateStatus('IDLE');
      releaseCamera();
    } finally {
      if (session === startSessionRef.current) setIsLoading(false);
    }
  }, [gestureEnabled, isLoading, releaseCamera, resetGestureStability, stop, updateStatus, videoRef]);

  useEffect(() => () => {
    startSessionRef.current += 1;
    cancelAnimationFrame(rafIdRef.current);
    clearTimeout(stateRef.current.cooldownTimer as number);
    releaseCamera();
    recognizerRef.current?.close();
    recognizerRef.current = null;
  }, [releaseCamera]);

  return {
    gestureEnabled,
    cameraActive,
    status,
    powerPreview,
    isLoading,
    error,
    lastGesture,
    start,
    stop,
  };
}
