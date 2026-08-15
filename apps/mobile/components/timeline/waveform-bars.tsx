import { Rect, Svg } from 'react-native-svg';

import { WAVEFORM_SAMPLE_INTERVAL_MS } from '@/lib/call/waveform-sampler';

import { BAR_WIDTH_PX } from './timeline-math';
import {
  amplitudeAt,
  isInSession,
  maxAmplitudeInRange,
  type TimelineChunk,
  type TimelineSession,
} from './timeline-model';

type WaveformBarsProps = {
  width: number;
  height: number;
  viewStartMs: number;
  msPerPixel: number;
  callStartedAtMs: number;
  sessions: TimelineSession[];
  chunks: TimelineChunk[];
};

export function WaveformBars({
  width,
  height,
  viewStartMs,
  msPerPixel,
  callStartedAtMs,
  sessions,
  chunks,
}: WaveformBarsProps) {
  if (width <= 0 || height <= 0) {
    return null;
  }

  const barCount = Math.max(1, Math.ceil(width / BAR_WIDTH_PX));
  const midY = height / 2;
  const maxBarHeight = height / 2 - 2;
  const bars = [];

  for (let index = 0; index < barCount; index += 1) {
    const x = index * BAR_WIDTH_PX;
    const startMs = viewStartMs + x * msPerPixel;
    const endMs = startMs + BAR_WIDTH_PX * msPerPixel;
    const midMs = (startMs + endMs) / 2;

    if (!isInSession(sessions, callStartedAtMs, midMs)) {
      continue;
    }

    const rangeMs = endMs - startMs;
    const amplitude =
      rangeMs <= WAVEFORM_SAMPLE_INTERVAL_MS
        ? amplitudeAt(chunks, startMs)
        : maxAmplitudeInRange(chunks, startMs, endMs);
    const barHeight = Math.max(1, (amplitude / 255) * maxBarHeight);

    bars.push(
      <Rect
        key={index}
        x={x}
        y={midY - barHeight}
        width={Math.max(1, BAR_WIDTH_PX - 1)}
        height={barHeight * 2}
        fill="#86efac"
        opacity={amplitude === 0 ? 0.35 : 0.95}
      />,
    );
  }

  return (
    <Svg width={width} height={height}>
      {bars}
    </Svg>
  );
}
