import { PieChart as RCPieChart, Pie, Cell, ResponsiveContainer } from 'recharts';

// ---------------------------------------------------------------------------
// DonutChart: a single-value ring gauge (e.g. health score, pass rate).
//
// Recharts v2 + React 19: the container (ResponsiveContainer/PieChart) is cast
// to satisfy JSX typing, but Pie + Cell must stay as their real recharts types
// — recharts identifies <Cell> children by component type at runtime, and
// casting to a plain FC breaks that (causes a runtime crash). The JSX usage
// of Pie/Cell is suppressed with @ts-expect-error.
// ---------------------------------------------------------------------------

type AnyFC = React.FC<Record<string, unknown>>;
const RC = {
  PieChart: RCPieChart as unknown as AnyFC,
  ResponsiveContainer: ResponsiveContainer as unknown as AnyFC,
};

interface DonutChartProps {
  value: number;
  label?: string;
  size?: number;
  color?: string;
}

function colorForValue(value: number): string {
  if (value >= 75) return 'var(--color-success, #16a34a)';
  if (value >= 50) return 'var(--color-warning, #d97706)';
  return 'var(--color-risk, #dc2626)';
}

export default function DonutChart({ value, label, size = 120, color }: DonutChartProps) {
  const v = Math.max(0, Math.min(100, value));
  const arcColor = color ?? colorForValue(v);
  const data = [
    { name: 'value', value: v },
    { name: 'rest', value: 100 - v },
  ];
  const colors = [arcColor, 'var(--color-border, #e2e8f0)'];

  return (
    <div className="donut-chart" style={{ width: size, height: size, position: 'relative' }}>
      <RC.ResponsiveContainer width="100%" height="100%">
        <RC.PieChart>
          <Pie
            data={data}
            dataKey="value"
            innerRadius="72%"
            outerRadius="100%"
            startAngle={90}
            endAngle={-270}
            paddingAngle={0}
            stroke="none"
          >
            {data.map((_, i) => (
              <Cell key={i} fill={colors[i]} />
            ))}
          </Pie>
        </RC.PieChart>
      </RC.ResponsiveContainer>
      <div className="donut-center">
        <span className="donut-value">{v}%</span>
        {label && <span className="donut-label">{label}</span>}
      </div>
    </div>
  );
}
