import DynamicView from '../features/audit/components/DynamicView';
import PageFrame from '../components/common/PageFrame';

function DynamicPage() {
  return (
    <PageFrame className="page-frame-dynamic">
      <DynamicView />
    </PageFrame>
  );
}

export default DynamicPage;
