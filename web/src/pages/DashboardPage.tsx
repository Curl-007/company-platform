import DashboardView from '../features/dashboard/components/DashboardView';
import PageFrame from '../components/common/PageFrame';

function DashboardPage() {
  return (
    <PageFrame
      className="page-frame-dashboard"
      contentClassName="page-frame-dashboard-content"
    >
      <DashboardView />
    </PageFrame>
  );
}

export default DashboardPage;
