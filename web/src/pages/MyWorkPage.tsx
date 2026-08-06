import MyWorkView from '../features/mywork/components/MyWorkView';
import PageFrame from '../components/common/PageFrame';

function MyWorkPage() {
  return (
    <PageFrame className="page-frame-mywork">
      <MyWorkView />
    </PageFrame>
  );
}

export default MyWorkPage;
