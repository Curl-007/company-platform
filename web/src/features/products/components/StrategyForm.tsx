import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  fetchProducts,
  type StrategyInput,
} from '../api';
import { strategyStatusOptions, type StrategyKind, type StrategyRecord } from '../productModel';
import { fetchProjects } from '../../projects/api';
import { getSessionUser } from '../../../services/auth';
import { useAsync } from '../../../hooks/useAsync';
import { ApiError } from '../../../services/api';
import Overlay from '../../../components/common/Overlay';
import Panel from '../../../components/common/Panel';
import {
  PROJECT_STATUS_LABELS,
  ROADMAP_STATUS_LABELS,
  labelOf,
} from '../../../constants/enums';
import type { Portfolio, Product, Program, Project } from '../../../types';

export default function StrategyForm({
  kind,
  initial,
  onClose,
  onSubmit,
}: {
  kind: StrategyKind;
  initial?: StrategyRecord | null;
  onClose: () => void;
  onSubmit: (input: StrategyInput) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(initial?.name ?? '');
  const [owner, setOwner] = useState(initial?.owner ?? getSessionUser()?.name ?? '');
  const [objective, setObjective] = useState(initial?.objective ?? '');
  const [status, setStatus] = useState(initial?.status ?? (kind === 'program' ? 'planning' : 'planned'));
  const [linkedIds, setLinkedIds] = useState<string[]>(kind === 'program'
    ? ((initial as Program | undefined)?.projectIds ?? [])
    : ((initial as Portfolio | undefined)?.productIds ?? []));
  const [risksText, setRisksText] = useState((initial as Program | undefined)?.risks?.join('\n') ?? '');
  const [roadmapText, setRoadmapText] = useState(((initial as Portfolio | undefined)?.roadmap ?? [])
    .map((item) => [item.title ?? '', item.version ?? '', item.quarter ?? '', item.status ?? 'planned'].join(' | ')).join('\n'));
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const projectOptions = useAsync<Project[]>(fetchProjects, [], { cacheKey: 'projects:list' });
  const productOptions = useAsync<Product[]>(fetchProducts, [], { cacheKey: 'products:list' });
  const links = kind === 'program' ? (projectOptions.data ?? []) : (productOptions.data ?? []);

  function toggleLink(id: string) {
    setLinkedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  async function submit() {
    if (!name.trim() || !owner.trim() || !objective.trim()) {
      setFormError(t('features.products.strategyForm.fillRequired'));
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      const roadmap = roadmapText.split('\n').map((line) => line.split('|').map((item) => item.trim()))
        .filter((parts) => parts.some(Boolean))
        .map(([title, version, quarter, itemStatus]) => ({ title, version, quarter, status: itemStatus || 'planned' }));
      await onSubmit({
        name: name.trim(), owner: owner.trim(), objective: objective.trim(), status, risks: risksText.split('\n').map((item) => item.trim()).filter(Boolean),
        ...(kind === 'program' ? { projectIds: linkedIds } : { productIds: linkedIds, roadmap }),
      });
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : t('features.products.strategyForm.saveFailed'));
      setSubmitting(false);
    }
  }

  const linkLabel = kind === 'program' ? t('features.products.strategyForm.linkProjects') : t('features.products.strategyForm.linkProducts');
  const title = initial
    ? kind === 'program' ? t('features.products.strategyForm.editProgram') : t('features.products.strategyForm.editPortfolio')
    : kind === 'program' ? t('features.products.strategyForm.newProgram') : t('features.products.strategyForm.newPortfolio');
  return (
    <Overlay onClose={onClose}>
      <Panel title={title} subtitle={t('features.products.strategyForm.formSubtitle')}>
        {formError ? <div className="form-error" style={{ marginBottom: 8 }}>{formError}</div> : null}
        <div className="form-row">
          <div className="form-group"><label className="form-label">{t('features.products.strategyForm.nameLabel')}</label><input className="form-input" value={name} onChange={(event) => setName(event.target.value)} /></div>
          <div className="form-group"><label className="form-label">{t('features.products.strategyForm.ownerLabel')}</label><input className="form-input" value={owner} onChange={(event) => setOwner(event.target.value)} /></div>
        </div>
        <div className="form-row">
          <div className="form-group"><label className="form-label">{t('features.products.strategyForm.statusLabel')}</label><select className="form-select" value={status} onChange={(event) => setStatus(event.target.value)}>{strategyStatusOptions(kind).map((item) => <option key={item} value={item}>{kind === 'program' ? labelOf(PROJECT_STATUS_LABELS, item) : labelOf(ROADMAP_STATUS_LABELS, item)}</option>)}</select></div>
        </div>
        <div className="form-group"><label className="form-label">{t('features.products.strategyForm.objectiveLabel')}</label><textarea className="form-textarea" rows={3} value={objective} onChange={(event) => setObjective(event.target.value)} placeholder={t('features.products.strategyForm.objectivePlaceholder')} /></div>
        <div className="form-group">
          <label className="form-label">{linkLabel}</label>
          <div className="management-chip-list" style={{ maxHeight: 180, overflow: 'auto' }}>
            {links.map((item) => <label key={item.id} className="tag" style={{ cursor: 'pointer' }}><input type="checkbox" checked={linkedIds.includes(item.id)} onChange={() => toggleLink(item.id)} style={{ marginRight: 5 }} />{item.name}</label>)}
            {!links.length ? <span className="text-secondary">{t('features.products.strategyForm.noLinks')}</span> : null}
          </div>
        </div>
        {kind === 'program' ? <div className="form-group"><label className="form-label">{t('features.products.strategyForm.risksLabel')}</label><textarea className="form-textarea" rows={3} value={risksText} onChange={(event) => setRisksText(event.target.value)} /></div> : null}
        {kind === 'portfolio' ? <div className="form-group"><label className="form-label">{t('features.products.strategyForm.roadmapLabel')}</label><textarea className="form-textarea" rows={4} value={roadmapText} onChange={(event) => setRoadmapText(event.target.value)} placeholder={t('features.products.strategyForm.roadmapPlaceholder')} /></div> : null}
        <div className="flex items-center gap-2" style={{ justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary btn-sm" onClick={onClose} disabled={submitting}>{t('common.cancel')}</button>
          <button className="btn btn-primary btn-sm" onClick={submit} disabled={submitting}>{submitting ? t('features.products.strategyForm.saving') : t('common.save')}</button>
        </div>
      </Panel>
    </Overlay>
  );
}
