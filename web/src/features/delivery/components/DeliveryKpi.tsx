import type { ReactNode } from 'react';
import MetricCard, { type MetricCardTone } from '../../../components/common/MetricCard';

export default function DeliveryKpi({
  icon,
  label,
  value,
  meta,
  tone = 'info',
}: {
  icon: ReactNode;
  label: string;
  value: number;
  meta: string;
  tone?: Extract<MetricCardTone, 'info' | 'success' | 'risk'>;
}) {
  // Keep host class for existing delivery-kpi-* layout tokens.
  return (
    <MetricCard
      icon={icon}
      label={label}
      value={value}
      caption={meta}
      tone={tone}
      className={`delivery-kpi-card ${tone}`}
    />
  );
}
