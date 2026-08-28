import { describe, expect, it } from 'vitest';
import {
  canReleaseGesture,
  GESTURE_THRESHOLDS,
  getGestureRequirements,
} from './gestureTransitions';

describe('手势投掷状态转换', () => {
  it('蓄力后的张掌使用更宽容且更快的确认门槛', () => {
    expect(getGestureRequirements('CHARGING', 'Open_Palm')).toEqual({
      minimumScore: GESTURE_THRESHOLDS.releaseScore,
      stableDuration: GESTURE_THRESHOLDS.releaseStableMs,
    });
    expect(getGestureRequirements('READY', 'Closed_Fist')).toEqual({
      minimumScore: GESTURE_THRESHOLDS.defaultScore,
      stableDuration: GESTURE_THRESHOLDS.defaultStableMs,
    });
  });

  it('张掌达到短时稳定且已完成最短蓄力时触发投掷', () => {
    expect(canReleaseGesture({
      status: 'CHARGING',
      gesture: 'Open_Palm',
      score: 0.55,
      stableForMs: 100,
      chargeForMs: 400,
    })).toBe(true);
  });

  it('未蓄力、分数过低或张掌时间过短时不会误投', () => {
    expect(canReleaseGesture({
      status: 'READY', gesture: 'Open_Palm', score: 0.9, stableForMs: 200, chargeForMs: 500,
    })).toBe(false);
    expect(canReleaseGesture({
      status: 'CHARGING', gesture: 'Open_Palm', score: 0.4, stableForMs: 200, chargeForMs: 500,
    })).toBe(false);
    expect(canReleaseGesture({
      status: 'CHARGING', gesture: 'Open_Palm', score: 0.8, stableForMs: 40, chargeForMs: 500,
    })).toBe(false);
  });
});
