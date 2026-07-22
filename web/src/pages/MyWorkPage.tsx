import type { SessionUser } from '../types';
import MyWorkView from '../features/mywork/components/MyWorkView';

function MyWorkPage({ user }: { user?: SessionUser | null }) {
  return <MyWorkView user={user} />;
}

export default MyWorkPage;
