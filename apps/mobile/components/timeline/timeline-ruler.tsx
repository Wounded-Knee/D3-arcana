import { memo } from 'react';
import { G, Line, Svg, Text as SvgText } from 'react-native-svg';

import { ticksForViewport } from './timeline-math';
import type { TimelineOrientation } from './timeline-layout';

type TimelineRulerProps = {
  width: number;
  height: number;
  viewStartMs: number;
  msPerPixel: number;
  orientation?: TimelineOrientation;
};

export const TimelineRuler = memo(function TimelineRuler({
  width,
  height,
  viewStartMs,
  msPerPixel,
  orientation = 'horizontal',
}: TimelineRulerProps) {
  if (width <= 0 || height <= 0) {
    return null;
  }

  const vertical = orientation === 'vertical';
  const timeLength = vertical ? height : width;
  const viewEndMs = viewStartMs + timeLength * msPerPixel;
  const ticks = ticksForViewport(viewStartMs, viewEndMs, msPerPixel);

  return (
    <Svg width={width} height={height}>
      {vertical ? (
        <Line
          x1={width - 1}
          y1={0}
          x2={width - 1}
          y2={height}
          stroke="#166534"
          strokeWidth={1}
        />
      ) : (
        <Line
          x1={0}
          y1={height - 1}
          x2={width}
          y2={height - 1}
          stroke="#166534"
          strokeWidth={1}
        />
      )}
      {ticks.map((tick) =>
        vertical ? (
          <G key={tick.offsetMs}>
            <Line
              x1={width - 6}
              y1={tick.x}
              x2={width}
              y2={tick.x}
              stroke="#86efac"
              strokeWidth={1}
            />
            <SvgText
              x={4}
              y={tick.x + 11}
              fill="#bbf7d0"
              fontSize={10}
            >
              {tick.label}
            </SvgText>
          </G>
        ) : (
          <G key={tick.offsetMs}>
            <Line
              x1={tick.x}
              y1={height - 6}
              x2={tick.x}
              y2={height}
              stroke="#86efac"
              strokeWidth={1}
            />
            <SvgText
              x={tick.x + 3}
              y={height - 8}
              fill="#bbf7d0"
              fontSize={10}
            >
              {tick.label}
            </SvgText>
          </G>
        ),
      )}
    </Svg>
  );
});
