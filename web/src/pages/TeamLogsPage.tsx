import TeamLogsView from '../features/workLogs/components/TeamLogsView';
import PageFrame from '../components/common/PageFrame';

function TeamLogsPage() {
  return (
    <PageFrame className="page-frame-teamlogs">
      <TeamLogsView />
    </PageFrame>
  );
}

export default TeamLogsPage;
