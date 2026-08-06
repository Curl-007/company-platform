import type { SessionUser } from '../types';
import MyWorkView from '../features/mywork/components/MyWorkView';
import PageFrame from '../components/common/PageFrame';

function MyWorkPage({ user }: { user?: SessionUser | null }) {
  return (
    <PageFrame className="page-frame-mywork">
      <MyWorkView user={user} />
    </PageFrame>
  );
}

export default MyWorkPage;
