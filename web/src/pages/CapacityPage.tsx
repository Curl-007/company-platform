import type { SessionUser } from '../types';
import CapacityView from '../features/capacity/components/CapacityView';

function CapacityPage({ user }: { user?: SessionUser | null }) {
  return <CapacityView user={user} />;
}

export default CapacityPage;
