import Panel from '../../../components/common/Panel';
import DataTable from '../../../components/common/DataTable';
import { useTranslation } from 'react-i18next';
import type { DashboardData } from '../../../types';
import type { ReportModel } from '../reportModel';
import { RequirementProgressTable, requirementColumns } from './ReportShared';

export default function DeliveryReport({
  data,
  reportModel,
}: {
  data: DashboardData;
  reportModel: ReportModel;
}) {
  const { t } = useTranslation();
  return (
    <div className="grid-2">
      <Panel title={t('features.reports.deliveryReport.lowRequirementsTitle')} subtitle={t('features.reports.deliveryReport.lowRequirementsSubtitle')}>
        <DataTable
          columns={requirementColumns}
          data={reportModel.lowRequirements}
          rowKey="id"
          emptyText={t('features.reports.deliveryReport.noLowRequirements')}
          defaultSortKey="completion"
        />
      </Panel>
      <RequirementProgressTable items={data.requirementProgress} />
    </div>
  );
}
