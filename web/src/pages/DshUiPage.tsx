import DshUiView from '../features/dshUi/components/DshUiView';
import type { SessionUser } from '../types';

export default function DshUiPage({ user }: { user?: SessionUser | null }) {
  return user ? <DshUiView user={user} /> : null;
}
