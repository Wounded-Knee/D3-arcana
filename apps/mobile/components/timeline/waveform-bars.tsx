import { memo, useMemo } from 'react';
import { Path, Svg } from 'react-native-svg';

import { WAVEFORM_SAMPLE_INTERVAL_MS } from '@/lib/call/waveform-sampler';

import { BAR_WIDTH_PX } from './timeline-math';
import {
  amplitudeAtIndexed,
  indexChunks,
  isInSessionRanges,
  maxAmplitudeInRangeIndexed,
  sessionRanges,
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

function buildWaveformPaths(
  width: number,
  height: number,
  viewStartMs: number,
  msPerPixel: number,
  callStartedAtMs: number,
  sessions: TimelineSession[],
  chunks: TimelineChunk[],
): { active: string; silent: string } {
  const barCount = Math.max(1, Math.ceil(width / BAR_WIDTH_PX));
  const midY = height / 2;
  const maxBarHeight = height / 2 - 2;
  const barWidth = Math.max(1, BAR_WIDTH_PX - 1);
  const ranges = sessionRanges(sessions, callStartedAtMs);
  const index = indexChunks(chunks);
  let active = '';
  let silent = '';

  for (let barIndex = 0; barIndex < barCount; barIndex += 1) {
    const x = barIndex * BAR_WIDTH_PX;
    const startMs = viewStartMs + x * msPerPixel;
    const endMs = startMs + BAR_WIDTH_PX * msPerPixel;
    const midMs = (startMs + endMs) / 2;

    if (!isInSessionRanges(ranges, midMs)) {
      continue;
    }

    const rangeMs = endMs - startMs;
    const amplitude =
      rangeMs <= WAVEFORM_SAMPLE_INTERVAL_MS
        ? amplitudeAtIndexed(index, startMs)
        : maxAmplitudeInRangeIndexed(index, startMs, endMs);
    const barHeight = Math.max(1, (amplitude / 255) * maxBarHeight);
    const segment = `M${x} ${midY - barHeight}h${barWidth}v${barHeight * 2}h${-barWidth}z`;

    if (amplitude === 0) {
      silent += segment;
    } else {
      active += segment;
    }
  }

  return { active, silent };
}

export const WaveformBars = memo(function WaveformBars({
  width,
  height,
  viewStartMs,
  msPerPixel,
  callStartedAtMs,
  sessions,
  chunks,
}: WaveformBarsProps) {
  const paths = useMemo(
    () =>
      width <= 0 || height <= 0
        ? { active: '', silent: '' }
        : buildWaveformPaths(
            width,
            height,
            viewStartMs,
            msPerPixel,
            callStartedAtMs,
            sessions,
            chunks,
          ),
    [
      width,
      height,
      viewStartMs,
      msPerPixel,
      callStartedAtMs,
      sessions,
      chunks,
    ],
  );

  if (width <= 0 || height <= 0) {
    return null;
  }

  return (
    <Svg width={width} height={height}>
      {paths.silent ? (
        <Path d={paths.silent} fill="#86efac" opacity={0.35} />
      ) : null}
      {paths.active ? (
        <Path d={paths.active} fill="#86efac" opacity={0.95} />
      ) : null}
    </Svg>
  );
});
