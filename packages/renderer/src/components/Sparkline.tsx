import { useId } from "react";

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  label?: string;
}

export function Sparkline({
  data,
  width = 120,
  height = 32,
  color = "var(--accent)",
  label,
}: SparklineProps) {
  const gradientId = useId();

  if (data.length < 2) {
    return (
      <div className="sparkline-container">
        {label && <span className="sparkline-label">{label}</span>}
        <svg width={width} height={height} className="sparkline-svg">
          <text
            x={width / 2}
            y={height / 2 + 4}
            textAnchor="middle"
            fill="var(--text-muted)"
            fontSize={9}
          >
            waiting...
          </text>
        </svg>
      </div>
    );
  }

  const padding = 2;
  const innerW = width - padding * 2;
  const innerH = height - padding * 2;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data.map((val, i) => {
    const x = padding + (i / (data.length - 1)) * innerW;
    const y = padding + innerH - ((val - min) / range) * innerH;
    return `${x},${y}`;
  });

  const polyline = points.join(" ");

  // Create a filled area path
  const firstX = padding;
  const lastX = padding + innerW;
  const areaPath = `M ${firstX},${height} L ${points.join(" L ")} L ${lastX},${height} Z`;

  const lastValue = data[data.length - 1];

  return (
    <div className="sparkline-container">
      {label && <span className="sparkline-label">{label}</span>}
      <svg width={width} height={height} className="sparkline-svg">
        <defs>
          <linearGradient id={`grad-${gradientId}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <path d={areaPath} fill={`url(#grad-${gradientId})`} />
        <polyline
          points={polyline}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Current value dot */}
        <circle
          cx={padding + innerW}
          cy={padding + innerH - ((lastValue - min) / range) * innerH}
          r={2.5}
          fill={color}
        />
      </svg>
      <span className="sparkline-value" style={{ color }}>
        {Number.isInteger(lastValue) ? lastValue : lastValue.toFixed(1)}
      </span>
    </div>
  );
}
