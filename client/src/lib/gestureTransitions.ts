export type RecognizedHandGesture = 'Closed_Fist' | 'Open_Palm' | string;
export type GestureRecognitionStatus = 'IDLE' | 'READY' | 'CHARGING' | 'THROWING' | 'COOLDOWN';

export const GESTURE_THRESHOLDS = {
  defaultScore: 0.62,
  releaseScore: 0.5,
  defaultStableMs: 160,
  releaseStableMs: 80,
  minimumChargeMs: 250,
} as const;

/**
 * 张掌释放采用比普通手势稍低的门槛与更短确认时间。
 * 握拳后手指运动会短暂降低模型置信度；保留滞回可避免用户明明张掌，
 * 状态却因某一帧分数下降而重新回到“请握拳”。
 */
export function getGestureRequirements(
  status: GestureRecognitionStatus,
  gesture: RecognizedHandGesture,
) {
  const isRelease = status === 'CHARGING' && gesture === 'Open_Palm';
  return {
    minimumScore: isRelease ? GESTURE_THRESHOLDS.releaseScore : GESTURE_THRESHOLDS.defaultScore,
    stableDuration: isRelease ? GESTURE_THRESHOLDS.releaseStableMs : GESTURE_THRESHOLDS.defaultStableMs,
  };
}

export function canReleaseGesture({
  status,
  gesture,
  score,
  stableForMs,
  chargeForMs,
}: {
  status: GestureRecognitionStatus;
  gesture: RecognizedHandGesture;
  score: number;
  stableForMs: number;
  chargeForMs: number;
}) {
  const requirements = getGestureRequirements(status, gesture);
  return status === 'CHARGING'
    && gesture === 'Open_Palm'
    && score >= requirements.minimumScore
    && stableForMs >= requirements.stableDuration
    && chargeForMs >= GESTURE_THRESHOLDS.minimumChargeMs;
}
