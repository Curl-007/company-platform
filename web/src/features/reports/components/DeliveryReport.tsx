import Panel from '../../../components/common/Panel';
import DataTable from '../../../components/common/DataTable';
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
  return (
    <div className="grid-2">
      <Panel title="低进展需求" subtitle="按完成度升序">
        <DataTable
          columns={requirementColumns}
          data={reportModel.lowRequirements}
          rowKey="id"
          emptyText="暂无低进展需求。"
          defaultSortKey="completion"
        />
      </Panel>
      <RequirementProgressTable items={data.requirementProgress} />
    </div>
  );
}
