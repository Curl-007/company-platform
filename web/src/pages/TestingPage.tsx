import TestingView from '../features/testing/components/TestingView';
import PageFrame from '../components/common/PageFrame';

function TestingPage() {
  return (
    <PageFrame className="page-frame-testing">
      <TestingView />
    </PageFrame>
  );
}

export default TestingPage;
