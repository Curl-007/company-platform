import type { SessionUser } from '../types';
import CapacityView from '../features/capacity/components/CapacityView';
import PageFrame from '../components/common/PageFrame';

function CapacityPage({ user }: { user?: SessionUser | null }) {
  return (
    <PageFrame className="page-frame-capacity">
      <CapacityView user={user} />
    </PageFrame>
  );
}

export default CapacityPage;
