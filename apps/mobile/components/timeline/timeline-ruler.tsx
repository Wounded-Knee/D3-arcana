import { G, Line, Svg, Text as SvgText } from 'react-native-svg';

import { ticksForViewport } from './timeline-math';

type TimelineRulerProps = {
  width: number;
  height: number;
  viewStartMs: number;
  msPerPixel: number;
};

export function TimelineRuler({
  width,
  height,
  viewStartMs,
  msPerPixel,
}: TimelineRulerProps) {
  if (width <= 0) {
    return null;
  }

  const viewEndMs = viewStartMs + width * msPerPixel;
  const ticks = ticksForViewport(viewStartMs, viewEndMs, msPerPixel);

  return (
    <Svg width={width} height={height}>
      <Line
        x1={0}
        y1={height - 1}
        x2={width}
        y2={height - 1}
        stroke="#166534"
        strokeWidth={1}
      />
      {ticks.map((tick) => (
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
      ))}
    </Svg>
  );
}
