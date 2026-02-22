import { useEffect, useRef, useState, useCallback } from 'react';
import { FilesetResolver, GestureRecognizer } from '@mediapipe/tasks-vision';

declare global {
  interface Window {
    startThrow?: (power: number) => void;
    onCameraDenied?: () => void;
  }
}

export type GestureStatus = 'READY' | 'CHARGING' | 'THROWING' | 'COOLDOWN';

interface Point { time: number; x: number; y: number; }

export function useGestureThrow(videoRef: React.RefObject<HTMLVideoElement | null>) {
  const [status, setStatus] = useState<GestureStatus>('READY');
  const [gestureEnabled, setGestureEnabled] = useState(false);
  const [powerPreview, setPowerPreview] = useState(0);

  const recognizerRef = useRef<GestureRecognizer | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafIdRef = useRef<number>(0);

  const CONFIG = {
    fpsLimit: 20, frameInterval: 1000 / 20,
    stableDuration: 200, minChargeTime: 200,
    powerWindow: 300, vMin: 0.2, vMax: 1.2,
    cooldownTime: 500, handLostTimeout: 2000,
    distanceMin: 0.05, distanceMax: 0.4
  };

  const stateRef = useRef({
    status: 'READY' as GestureStatus, lastGesture: 'None',
    gestureStartTime: 0, chargeStartTime: 0, cooldownTimer: 0,
    lastHandTime: Date.now(), palmPath: [] as Point[], lastProcessTime: 0
  });

  useEffect(() => {
    let isMounted = true;
    const initModel = async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm');
        const recognizer = await GestureRecognizer.createFromOptions(vision, {
          baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task', delegate: 'GPU' },
          runningMode: 'VIDEO', numHands: 1
        });
        if (isMounted) recognizerRef.current = recognizer;
      } catch (err) { console.error('MediaPipe Init Error:', err); }
    };
    initModel();
    return () => { isMounted = false; };
  }, []);

  const updateStatus = (newStatus: GestureStatus) => {
    stateRef.current.status = newStatus;
    setStatus(newStatus);
  };

  const calculatePower = () => {
    const { palmPath } = stateRef.current;
    if (palmPath.length < 2) return 0;
    const now = Date.now();
    const validPoints = palmPath.filter(p => now - p.time <= CONFIG.powerWindow);
    if (validPoints.length < 2) return 0;
    const first = validPoints[0];
    const last = validPoints[validPoints.length - 1];
    const dt = (last.time - first.time) / 1000;
    if (dt <= 0) return 0;
    const distance = Math.sqrt(Math.pow(last.x - first.x, 2) + Math.pow(last.y - first.y, 2));
    const vAvg = distance / dt;
    return Math.max(0, Math.min(1, (vAvg - CONFIG.vMin) / (CONFIG.vMax - CONFIG.vMin)));
  };

  const processFrame = useCallback(() => {
    const video = videoRef.current;
    const recognizer = recognizerRef.current;
    if (!video || !recognizer || !gestureEnabled) return;

    const now = performance.now();
    if (now - stateRef.current.lastProcessTime < CONFIG.frameInterval) {
      rafIdRef.current = requestAnimationFrame(processFrame);
      return;
    }
    stateRef.current.lastProcessTime = now;

    const results = recognizer.recognizeForVideo(video, now);
    const hasHand = results.gestures.length > 0;
    const currentMs = Date.now();
    const state = stateRef.current;

    if (!hasHand) {
      if (currentMs - state.lastHandTime > CONFIG.handLostTimeout) {
        state.lastHandTime = currentMs;
        if (state.status === 'CHARGING') updateStatus('READY');
      }
    } else {
      state.lastHandTime = currentMs;
      const gestureCategory = results.gestures[0][0].categoryName;
      const landmarks = results.landmarks[0];
      const wrist = landmarks[0];
      const middleMcp = landmarks[9];
      const palmCenter = { time: currentMs, x: (wrist.x + middleMcp.x) / 2, y: (wrist.y + middleMcp.y) / 2 };

      state.palmPath.push(palmCenter);
      state.palmPath = state.palmPath.filter(p => currentMs - p.time <= CONFIG.powerWindow);

      if (state.status === 'CHARGING') setPowerPreview(calculatePower());

      let stableGesture = 'None';
      if (gestureCategory === state.lastGesture) {
        if (currentMs - state.gestureStartTime >= CONFIG.stableDuration) stableGesture = gestureCategory;
      } else {
        state.lastGesture = gestureCategory;
        state.gestureStartTime = currentMs;
      }

      switch (state.status) {
        case 'READY':
          if (stableGesture === 'Closed_Fist') {
            updateStatus('CHARGING');
            state.chargeStartTime = currentMs;
            state.palmPath = [];
          }
          break;
        case 'CHARGING':
          if (stableGesture === 'Open_Palm' && currentMs - state.chargeStartTime >= CONFIG.minChargeTime) {
            const power = calculatePower();
            updateStatus('THROWING');
            if (typeof window.startThrow === 'function') window.startThrow(power);
            setTimeout(() => {
              updateStatus('COOLDOWN');
              state.cooldownTimer = window.setTimeout(() => updateStatus('READY'), CONFIG.cooldownTime);
            }, 0);
          } else if (stableGesture !== 'None' && stableGesture !== 'Closed_Fist' && stableGesture !== 'Open_Palm') {
             updateStatus('READY');
          }
          break;
        case 'THROWING':
        case 'COOLDOWN':
          break;
      }
    }
    rafIdRef.current = requestAnimationFrame(processFrame);
  }, [gestureEnabled]);

  useEffect(() => {
    if (gestureEnabled) rafIdRef.current = requestAnimationFrame(processFrame);
    else {
      cancelAnimationFrame(rafIdRef.current);
      stateRef.current.palmPath = [];
      setPowerPreview(0);
    }
    return () => cancelAnimationFrame(rafIdRef.current);
  }, [gestureEnabled, processFrame]);

  const start = async () => {
    if (!videoRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' } });
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      streamRef.current = stream;
      setGestureEnabled(true);
      updateStatus('READY');
    } catch (err) {
      window.onCameraDenied?.();
    }
  };

  const stop = () => {
    setGestureEnabled(false);
    updateStatus('READY');
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    clearTimeout(stateRef.current.cooldownTimer);
  };

  return { gestureEnabled, status, powerPreview, start, stop };
}
