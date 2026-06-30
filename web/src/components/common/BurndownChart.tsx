import { useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import type { BurndownData } from '../../types';

// Recharts 2.x component classes don't fully satisfy React 19's stricter JSX
// element type checks. Cast them all to React component types so JSX accepts
// them; runtime behavior is unaffected. Remove this block on Recharts v3.
type AnyFC = React.FC<Record<string, unknown>>;
const RC = {
  LineChart: LineChart as unknown as AnyFC,
  Line: Line as unknown as AnyFC,
  XAxis: XAxis as unknown as AnyFC,
  YAxis: YAxis as unknown as AnyFC,
  CartesianGrid: CartesianGrid as unknown as AnyFC,
  Tooltip: Tooltip as unknown as AnyFC,
  Legend: Legend as unknown as AnyFC,
  ReferenceLine: ReferenceLine as unknown as AnyFC,
};

// ---------------------------------------------------------------------------
// BurndownChart: ideal vs. actual remaining-hours line chart for a sprint.
//
// Recharts needs a single array of points keyed by date. We merge the ideal
// line and the actual remaining line on the date axis (sparse actual points
// are filled forward so the line is continuous).
// ---------------------------------------------------------------------------

interface BurndownChartProps {
  data: BurndownData;
  height?: number;
}

interface ChartPoint {
  date: string;
  label: string;
  ideal?: number;
  remaining?: number;
}

function shortDate(iso: string): string {
  return iso.length >= 10 ? iso.slice(5) : iso; // MM-DD
}

export default function BurndownChart({ data, height = 300 }: BurndownChartProps) {
  const chartData = useMemo<ChartPoint[]>(() => {
    // Index actual points by date for fast lookup.
    const actualByDate = new Map<string, number>();
    data.actual.forEach((p) => actualByDate.set(p.date, p.remaining));

    // Merge ideal line with actual, filling actual forward where missing.
    let lastActual: number | undefined = undefined;
    const points: ChartPoint[] = data.ideal.map((p) => {
      if (actualByDate.has(p.date)) lastActual = actualByDate.get(p.date);
      return { date: p.date, label: shortDate(p.date), ideal: p.ideal, remaining: lastActual };
    });

    // Append any actual points whose date is past the ideal span (sprint overrun).
    const lastIdealDate = data.ideal.length ? data.ideal[data.ideal.length - 1].date : '';
    data.actual
      .filter((p) => p.date > lastIdealDate)
      .forEach((p) => points.push({ date: p.date, label: shortDate(p.date), remaining: p.remaining }));

    return points;
  }, [data]);

  if (chartData.length === 0) {
    return <p className="text-secondary">燃尽数据不足，无法绘制图表。</p>;
  }

  return (
    <div className="burndown-chart">
      <div className="flex items-center gap-4" style={{ marginBottom: 8 }}>
        <span className="text-secondary" style={{ fontSize: 13 }}>
          总预估：<strong className="text-mono">{data.totalEstimate}h</strong>
        </span>
        <span className="text-secondary" style={{ fontSize: 13 }}>
          任务数：<strong className="text-mono">{data.taskCount}</strong>
        </span>
        <span className="text-secondary" style={{ fontSize: 13 }}>
          周期：<span className="text-mono">{shortDate(data.startDate)} → {shortDate(data.endDate)}</span>
        </span>
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <RC.LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 4, left: -8 }}>
          <RC.CartesianGrid strokeDasharray="3 3" stroke="var(--color-border, #e2e8f0)" />
          <RC.XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--color-text-secondary, #64748b)' }} />
          <RC.YAxis
            tick={{ fontSize: 11, fill: 'var(--color-text-secondary, #64748b)' }}
            label={{ value: '剩余工时(h)', angle: -90, position: 'insideLeft', style: { fontSize: 11, fill: 'var(--color-text-secondary, #64748b)' } }}
            allowDecimals={false}
          />
          <RC.Tooltip
            contentStyle={{
              borderRadius: 6,
              border: '1px solid var(--color-border, #e2e8f0)',
              fontSize: 12,
            }}
            labelFormatter={(_value: unknown, payload: Array<{ payload?: { date?: string } }>) => payload?.[0]?.payload?.date ?? ''}
          />
          <RC.Legend wrapperStyle={{ fontSize: 12 }} />
          <RC.ReferenceLine y={0} stroke="var(--color-border, #cbd5e1)" />
          <RC.Line
            type="monotone"
            dataKey="ideal"
            name="理想燃尽线"
            stroke="var(--color-text-secondary, #94a3b8)"
            strokeDasharray="5 4"
            dot={false}
            strokeWidth={2}
          />
          <RC.Line
            type="monotone"
            dataKey="remaining"
            name="实际剩余"
            stroke="var(--color-primary, #2563eb)"
            dot={{ r: 3 }}
            strokeWidth={2.5}
            connectNulls
          />
        </RC.LineChart>
      </ResponsiveContainer>
    </div>
  );
}
