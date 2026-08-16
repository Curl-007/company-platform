import { useEffect, useMemo, useState } from 'react';
import { Layers3 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import PageFrame from '../../../components/common/PageFrame';
import { Select } from '../../../components/ui';
import type { SessionUser } from '../../../types';
import { openDshView, readDshUiState, subscribeDshUiStore } from '../store/dshUiStore';
import DshDeclarativeViewRenderer from './DshDeclarativeViewRenderer';

export default function DshUiView({ user }: { user: SessionUser }) {
  const { t } = useTranslation();
  const [state, setState] = useState(() => readDshUiState(user.id));

  useEffect(() => {
    const refresh = () => setState(readDshUiState(user.id));
    refresh();
    return subscribeDshUiStore(user.id, refresh);
  }, [user.id]);

  const activeView = useMemo(
    () => state.views.find((view) => view.id === state.activeViewId) ?? state.views[0] ?? null,
    [state.activeViewId, state.views],
  );

  return (
    <PageFrame
      contentClassName="dsh-ui-page"
      actions={state.views.length ? (
        <div className="dsh-ui-toolbar">
          <label className="sr-only" htmlFor="dsh-ui-view-select">{t('features.dshUi.viewSelect')}</label>
          <Select
            id="dsh-ui-view-select"
            value={activeView?.id ?? ''}
            aria-label={t('features.dshUi.viewSelect')}
            onChange={(event) => openDshView(user.id, event.target.value)}
          >
            {state.views.map((view) => <option value={view.id} key={view.id}>{view.title}</option>)}
          </Select>
        </div>
      ) : undefined}
    >
      {activeView ? (
        <DshDeclarativeViewRenderer view={activeView} user={user} />
      ) : (
        <div className="dsh-ui-empty" role="status">
          <Layers3 size={28} aria-hidden="true" />
          <p>{t('features.dshUi.empty')}</p>
        </div>
      )}
    </PageFrame>
  );
}
