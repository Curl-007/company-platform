import MetricStrip from '../../../components/common/MetricStrip';

export default function ManagementSummaryStrip({
  items,
}: {
  items: Array<{ label: string; value: string | number; caption?: string }>;
}) {
  return <MetricStrip items={items} className="product-metric-strip" />;
}
