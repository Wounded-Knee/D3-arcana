import { memo, useMemo } from 'react';
import { Path, Svg } from 'react-native-svg';

import { WAVEFORM_SAMPLE_INTERVAL_MS } from '@/lib/call/waveform-sampler';

import { BAR_WIDTH_PX } from './timeline-math';
import type { TimelineOrientation } from './timeline-layout';
import {
  amplitudeAtIndexed,
  indexChunks,
  isInSessionRanges,
  meanAmplitudeInRangeIndexed,
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
  orientation?: TimelineOrientation;
};

function buildWaveformPaths(
  width: number,
  height: number,
  viewStartMs: number,
  msPerPixel: number,
  callStartedAtMs: number,
  sessions: TimelineSession[],
  chunks: TimelineChunk[],
  orientation: TimelineOrientation,
): { active: string; silent: string } {
  const vertical = orientation === 'vertical';
  const timeLength = vertical ? height : width;
  const breadth = vertical ? width : height;
  const barCount = Math.max(1, Math.ceil(timeLength / BAR_WIDTH_PX));
  const mid = breadth / 2;
  const maxBarExtent = Math.max(1, breadth / 2 - 2);
  const barThickness = Math.max(1, BAR_WIDTH_PX - 1);
  const ranges = sessionRanges(sessions, callStartedAtMs);
  const index = indexChunks(chunks);
  let active = '';
  let silent = '';

  for (let barIndex = 0; barIndex < barCount; barIndex += 1) {
    const along = barIndex * BAR_WIDTH_PX;
    const startMs = viewStartMs + along * msPerPixel;
    const endMs = startMs + BAR_WIDTH_PX * msPerPixel;
    const midMs = (startMs + endMs) / 2;

    if (!isInSessionRanges(ranges, midMs)) {
      continue;
    }

    const rangeMs = endMs - startMs;
    const amplitude =
      rangeMs <= WAVEFORM_SAMPLE_INTERVAL_MS
        ? amplitudeAtIndexed(index, startMs)
        : meanAmplitudeInRangeIndexed(index, startMs, endMs);
    const barExtent = Math.max(1, (amplitude / 255) * maxBarExtent);
    const segment = vertical
      ? `M${mid - barExtent} ${along}h${barExtent * 2}v${barThickness}h${-barExtent * 2}z`
      : `M${along} ${mid - barExtent}h${barThickness}v${barExtent * 2}h${-barThickness}z`;

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
  orientation = 'horizontal',
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
            orientation,
          ),
    [
      width,
      height,
      viewStartMs,
      msPerPixel,
      callStartedAtMs,
      sessions,
      chunks,
      orientation,
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
