import { LABEL_WIDTH } from './timeline-math';

export type TimelineOrientation = 'horizontal' | 'vertical';

export { LABEL_WIDTH };

export const RULER_HEIGHT = 22;
export const RULER_GUTTER = 40;
export const LABEL_HEIGHT = 36;
export const TRACK_HEIGHT = 48;
export const TRACK_WIDTH = 88;

export function timeGutterPx(orientation: TimelineOrientation): number {
  return orientation === 'vertical' ? LABEL_HEIGHT : LABEL_WIDTH;
}

export function rulerCrossPx(orientation: TimelineOrientation): number {
  return orientation === 'vertical' ? RULER_GUTTER : RULER_HEIGHT;
}

export function trackBreadthPx(orientation: TimelineOrientation): number {
  return orientation === 'vertical' ? TRACK_WIDTH : TRACK_HEIGHT;
}

export function paneSizePx(
  orientation: TimelineOrientation,
  layoutWidth: number,
  layoutHeight: number,
): number {
  return orientation === 'vertical'
    ? Math.max(0, layoutHeight - LABEL_HEIGHT)
    : Math.max(0, layoutWidth - LABEL_WIDTH);
}

export function timeToPx(
  timeMs: number,
  viewStartMs: number,
  msPerPixel: number,
): number {
  'worklet';
  return (timeMs - viewStartMs) / (msPerPixel || 1);
}
