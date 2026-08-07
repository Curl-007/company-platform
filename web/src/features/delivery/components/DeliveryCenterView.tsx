import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  Package,
  Plus,
  Rocket,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import {
  deleteBuild,
  deleteRelease,
  fetchBuilds,
  fetchDeliveryGates,
  fetchReleases,
  updateBuildStatus,
  updateReleaseStatus,
} from '../api';
import DeliveryAiPanel from './DeliveryAiPanel';
import DeliveryFilters from './DeliveryFilters';
import DeliveryRecordList from './DeliveryRecordList';
import GateBoard from './GateBoard';
import DeliveryDetail from './DeliveryDetail';
import CreateBuildDialog from './CreateBuildDialog';
import CreateReleaseDialog from './CreateReleaseDialog';
import DeliveryOverview from './DeliveryOverview';
import {
  BUILD_STATUS_OPTIONS,
  RELEASE_STATUS_OPTIONS,
  buildDeliveryAiPrompt,
  buildPipelineStages,
  buildRecords,
  currentDeliveryRoute,
  initialDeliveryTab,
  type DeliveryKind,
  type DeliveryRecord,
  type DeliveryTab,
} from '../deliveryPageModel';
import { fetchProjects } from '../../projects/api';
import { fetchRequirements } from '../../requirements/api';
import { fetchProducts } from '../../products/api';
import { fetchDefects } from '../../testing/api';
import { ApiError } from '../../../services/api';
import { getSessionUser } from '../../../services/auth';
import { useAsync } from '../../../hooks/useAsync';
import Panel from '../../../components/common/Panel';
import PageState from '../../../components/common/PageState';
import { useToast } from '../../../components/common/Toast';
import { useConfirm } from '../../../components/common/ConfirmDialog';
import { canOperate } from '../../../constants/roles';
import type { Build, Defect, DeliveryGateResult, Product, Project, Release, Requirement } from '../../../types';

const DELIVERY_TABS: Array<{ key: DeliveryTab; label: string; icon: typeof Package }> = [
  { key: 'overview', label: 'features.delivery.deliveryCenterView.tabOverview', icon: Sparkles },
  { key: 'builds', label: 'features.delivery.deliveryCenterView.tabBuilds', icon: Package },
  { key: 'releases', label: 'features.delivery.deliveryCenterView.tabReleases', icon: Rocket },
  { key: 'gates', label: 'features.delivery.deliveryCenterView.tabGates', icon: ShieldCheck },
];

function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
  const tablist = event.currentTarget.closest('[role="tablist"]');
  const tabs = tablist ? Array.from(tablist.querySelectorAll<HTMLButtonElement>('[role="tab"]')) : [];
  const currentIndex = tabs.indexOf(event.currentTarget);
  if (currentIndex < 0) return;

  let nextIndex: number;
  if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabs.length;
  else if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
  else if (event.key === 'Home') nextIndex = 0;
  else if (event.key === 'End') nextIndex = tabs.length - 1;
  else return;

  event.preventDefault();
  tabs[nextIndex].focus();
  tabs[nextIndex].click();
}

export default function DeliveryCenterView() {
  const { t } = useTranslation();
  const toast = useToast();
  const confirm = useConfirm();
  const sessionUser = getSessionUser();
  const canManageDelivery = canOperate(sessionUser, 'delivery:manage');
  const canUseAi = canOperate(sessionUser, 'ai:analyze');
  const [tab, setTab] = useState<DeliveryTab>(() => initialDeliveryTab());
  const [route, setRoute] = useState(() => currentDeliveryRoute());
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [kindFilter, setKindFilter] = useState<'' | DeliveryKind>('');
  const [selected, setSelected] = useState<DeliveryRecord | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [creatingBuild, setCreatingBuild] = useState(false);
  const [creatingRelease, setCreatingRelease] = useState(false);

  const projectsState = useAsync<Project[]>(fetchProjects, [], { cacheKey: 'projects:list' });
  const productsState = useAsync<Product[]>(fetchProducts, [], { cacheKey: 'products:list' });
  const buildsState = useAsync<Build[]>(() => fetchBuilds(), [], { cacheKey: 'delivery:builds' });
  const releasesState = useAsync<Release[]>(() => fetchReleases(), [], { cacheKey: 'delivery:releases' });
  const gatesState = useAsync<DeliveryGateResult[]>(() => fetchDeliveryGates(), [], { cacheKey: 'delivery:gates' });
  const requirementsState = useAsync<Requirement[]>(() => fetchRequirements(), [], { cacheKey: 'requirements:list' });
  const defectsState = useAsync<Defect[]>(() => fetchDefects(), [], { cacheKey: 'defects:list' });

  const projects = projectsState.data ?? [];
  const products = productsState.data ?? [];
  const builds = buildsState.data ?? [];
  const releases = releasesState.data ?? [];
  const gateResults = gatesState.data ?? [];
  const requirements = requirementsState.data ?? [];
  const defects = defectsState.data ?? [];
  const loading = projectsState.loading || productsState.loading || buildsState.loading || releasesState.loading || gatesState.loading;
  const error = projectsState.error || productsState.error || buildsState.error || releasesState.error || gatesState.error;

  const records = useMemo(() => buildRecords(builds, releases, projects, products), [builds, products, projects, releases]);
  const releaseBuildIds = useMemo(() => new Set(releases.map((item) => item.buildId).filter(Boolean)), [releases]);
  const gateMap = useMemo(() => new Map(gateResults.map((item) => [`${item.kind}:${item.id}`, item])), [gateResults]);

  useEffect(() => {
    function syncRoute() {
      setRoute(currentDeliveryRoute());
    }
    syncRoute();
    window.addEventListener('hashchange', syncRoute);
    return () => window.removeEventListener('hashchange', syncRoute);
  }, []);

  useEffect(() => {
    if (route.page === 'builds') setTab('builds');
    if (route.page === 'releases') setTab('releases');
  }, [route.page]);

  useEffect(() => {
    if (!route.focusId || loading) return;
    const focus = route.focusId.toLowerCase();
    const record = records.find((item) => {
      return [item.id, item.buildId ?? '', item.version ?? ''].some((value) => value.toLowerCase() === focus);
    });
    if (!record) return;
    setTab(record.kind === 'build' ? 'builds' : 'releases');
    setSelected((current) => (current?.id === record.id && current.kind === record.kind ? current : record));
  }, [loading, records, route.focusId]);

  const filteredRecords = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    return records.filter((record) => {
      const matchesKind = !kindFilter || record.kind === kindFilter;
      const matchesStatus = !statusFilter || record.status === statusFilter;
      const matchesKeyword = !q || [
        record.title,
        record.version ?? '',
        record.ownerLabel,
        record.id,
        record.buildId ?? '',
        ...record.linkedStories,
        ...record.linkedBugs,
      ].some((item) => item.toLowerCase().includes(q));
      return matchesKind && matchesStatus && matchesKeyword;
    });
  }, [keyword, kindFilter, records, statusFilter]);

  const summary = useMemo(() => {
    const released = releases.filter((item) => item.status === 'released').length;
    const inValidation = builds.filter((item) => item.status === 'testing').length
      + releases.filter((item) => item.status === 'staging').length;
    const blockedGates = gateResults.filter((item) => !item.ready).length;
    const failedBuilds = builds.filter((item) => item.status === 'failed').length;
    const rollbacks = releases.filter((item) => item.status === 'rollback').length;
    const risks = failedBuilds + rollbacks + blockedGates;
    const candidates = builds.filter((item) => item.status === 'released' && !releaseBuildIds.has(item.id)).length;
    return {
      builds: builds.length,
      releases: releases.length,
      released,
      inValidation,
      risks,
      candidates,
      blockedGates,
      failedBuilds,
      rollbacks,
    };
  }, [builds, gateResults, releaseBuildIds, releases]);

  const pipelineStages = useMemo(
    () => buildPipelineStages(records, releaseBuildIds),
    [records, releaseBuildIds],
  );

  const tabRecords = useMemo(() => {
    if (tab === 'builds') return filteredRecords.filter((item) => item.kind === 'build');
    if (tab === 'releases') return filteredRecords.filter((item) => item.kind === 'release');
    return filteredRecords;
  }, [filteredRecords, tab]);

  function reloadAll() {
    buildsState.reload();
    releasesState.reload();
    gatesState.reload();
    requirementsState.reload();
    defectsState.reload();
  }

  function openRecord(record: DeliveryRecord | null) {
    setStatusError(null);
    if (record) {
      setSelected({
        ...record,
        linkedStories: Array.isArray(record.linkedStories) ? record.linkedStories : [],
        linkedBugs: Array.isArray(record.linkedBugs) ? record.linkedBugs : [],
        title: record.title || record.id,
        ownerLabel: record.ownerLabel || (record.kind === 'build' ? t('features.delivery.deliveryPageModel.noLinkedProject') : t('features.delivery.deliveryPageModel.noLinkedProduct')),
      });
      return;
    }
    setSelected(null);
  }

  async function handleStatus(record: DeliveryRecord, status: string) {
    if (!canManageDelivery) {
      toast.error(t('features.delivery.deliveryCenterView.noPermissionStatus'));
      return;
    }
    setStatusError(null);
    try {
      if (record.kind === 'build') await updateBuildStatus(record.id, status);
      else await updateReleaseStatus(record.id, status);
      toast.success(t('features.delivery.deliveryCenterView.statusUpdated'));
      setSelected(null);
      reloadAll();
    } catch (err: unknown) {
      const message = err instanceof ApiError ? err.message : t('features.delivery.deliveryCenterView.statusUpdateFailed');
      setStatusError(message);
      toast.error(message);
    }
  }

  async function handleDelete(record: DeliveryRecord) {
    if (!canManageDelivery) {
      toast.error(t('features.delivery.deliveryCenterView.noPermissionDelete'));
      return;
    }
    const confirmed = await confirm({
      title: t('features.delivery.deliveryCenterView.deleteConfirm', {
        kind: record.kind === 'build' ? t('features.delivery.deliveryCenterView.build') : t('features.delivery.deliveryCenterView.release'),
        name: record.title,
      }),
      description: t('features.delivery.deliveryCenterView.deleteConfirmDesc'),
      confirmText: t('common.delete'),
      tone: 'danger',
    });
    if (!confirmed) return;
    try {
      if (record.kind === 'build') await deleteBuild(record.id);
      else await deleteRelease(record.id);
      toast.success(t('features.delivery.deliveryCenterView.recordDeleted'));
      setSelected(null);
      reloadAll();
    } catch (err: unknown) {
      toast.error(err instanceof ApiError ? err.message : t('features.delivery.deliveryCenterView.deleteFailed'));
    }
  }

  const statusChoices = Array.from(new Set([...BUILD_STATUS_OPTIONS, ...RELEASE_STATUS_OPTIONS]));

  return (
    <div className="dl-workbench delivery-center-page">
      <section className="dl-signal-strip" aria-label={t('features.delivery.deliveryCenterView.overviewAria')}>
        <div className="dl-signal">
          <span className="dl-signal-label"><Package size={13} aria-hidden="true" /> {t('features.delivery.deliveryCenterView.builds')}</span>
          <strong>{summary.builds}</strong>
          <em>{t('features.delivery.deliveryCenterView.candidates', { count: summary.candidates })}</em>
        </div>
        <div className="dl-signal">
          <span className="dl-signal-label"><Rocket size={13} aria-hidden="true" /> {t('features.delivery.deliveryCenterView.releases')}</span>
          <strong>{summary.releases}</strong>
          <em>{t('features.delivery.deliveryCenterView.released', { count: summary.released })}</em>
        </div>
        <div className={`dl-signal ${summary.inValidation > 0 ? 'is-info' : ''}`}>
          <span className="dl-signal-label"><ShieldCheck size={13} aria-hidden="true" /> {t('features.delivery.deliveryCenterView.inValidation')}</span>
          <strong>{summary.inValidation}</strong>
          <em>{t('features.delivery.deliveryCenterView.testingStaging')}</em>
        </div>
        <div className={`dl-signal ${summary.blockedGates > 0 ? 'is-warn' : ''}`}>
          <span className="dl-signal-label"><ShieldCheck size={13} aria-hidden="true" /> {t('features.delivery.deliveryCenterView.blockedGates')}</span>
          <strong>{summary.blockedGates}</strong>
          <em>{t('features.delivery.deliveryCenterView.gatesPending')}</em>
        </div>
        <div className={`dl-signal ${summary.risks > 0 ? 'is-risk' : ''}`}>
          <span className="dl-signal-label"><AlertTriangle size={13} aria-hidden="true" /> {t('features.delivery.deliveryCenterView.risks')}</span>
          <strong>{summary.risks}</strong>
          <em>{t('features.delivery.deliveryCenterView.risksDetail', { failed: summary.failedBuilds, rollbacks: summary.rollbacks })}</em>
        </div>
      </section>

      {canUseAi ? (
        <DeliveryAiPanel
          prompt={buildDeliveryAiPrompt(records, gateResults, requirements, defects)}
          candidateCount={summary.candidates}
          blockedGateCount={summary.blockedGates}
          openDefectCount={defects.filter((item) => item.status !== 'closed').length}
          loading={loading}
          error={error}
          onReload={reloadAll}
        />
      ) : null}

      <div className="dl-toolbar">
        <div className="dl-tab-row" role="tablist" aria-label={t('features.delivery.deliveryCenterView.viewAria')}>
          {DELIVERY_TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              id={`delivery-tab-${key}`}
              type="button"
              role="tab"
              className={`dl-tab-chip ${tab === key ? 'is-active' : ''}`}
              aria-selected={tab === key}
              aria-controls={`delivery-panel-${key}`}
              tabIndex={tab === key ? 0 : -1}
              onClick={() => setTab(key)}
              onKeyDown={handleTabKeyDown}
            >
              <Icon size={14} aria-hidden="true" />
              {t(label)}
            </button>
          ))}
        </div>
        {canManageDelivery ? (
          <div className="dl-actions">
            <button className="btn btn-secondary btn-sm btn-with-icon" onClick={() => setCreatingBuild(true)}>
              <Plus size={14} aria-hidden="true" /> {t('features.delivery.deliveryCenterView.newBuild')}
            </button>
            <button className="btn btn-primary btn-sm btn-with-icon" onClick={() => setCreatingRelease(true)}>
              <Rocket size={14} aria-hidden="true" /> {t('features.delivery.deliveryCenterView.newRelease')}
            </button>
          </div>
        ) : null}
      </div>

      {DELIVERY_TABS.map(({ key }) => (
        <div
          key={key}
          id={`delivery-panel-${key}`}
          role="tabpanel"
          className={tab === key ? 'dl-panel-stack' : undefined}
          aria-labelledby={`delivery-tab-${key}`}
          hidden={tab !== key}
        >
          {tab === key ? (
            loading || error ? (
              <PageState loading={loading} error={error} onRetry={reloadAll} />
            ) : (
              <>
                {tab === 'overview' ? (
                  <DeliveryOverview
                    pipelineStages={pipelineStages}
                    builds={builds}
                    projects={projects}
                    products={products}
                    releaseBuildIds={releaseBuildIds}
                    candidateCount={summary.candidates}
                    canManageDelivery={canManageDelivery}
                    onOpenRecord={openRecord}
                    onCreateRelease={() => setCreatingRelease(true)}
                  />
                ) : null}

                <Panel
                  className="dl-pool-panel"
                  title={
                    tab === 'overview'
                      ? t('features.delivery.deliveryCenterView.recentRecords')
                      : tab === 'builds'
                        ? t('features.delivery.deliveryCenterView.buildsList')
                        : tab === 'releases'
                          ? t('features.delivery.deliveryCenterView.releasesList')
                          : t('features.delivery.deliveryCenterView.gatesList')
                  }
                  subtitle={
                    tab === 'gates'
                      ? t('features.delivery.deliveryCenterView.gatesSubtitle', { shown: tabRecords.length, total: records.length, blocked: summary.blockedGates })
                      : t('features.delivery.deliveryCenterView.recordsSubtitle', { shown: tabRecords.length, total: records.length })
                  }
                >
                  <DeliveryFilters
                    keyword={keyword}
                    onKeyword={setKeyword}
                    kind={kindFilter}
                    onKind={setKindFilter}
                    status={statusFilter}
                    onStatus={setStatusFilter}
                    statusChoices={statusChoices}
                    hideKind={tab === 'builds' || tab === 'releases'}
                  />
                  {tab === 'gates' ? (
                    <GateBoard records={tabRecords} gateMap={gateMap} onOpen={openRecord} />
                  ) : (
                    <DeliveryRecordList
                      records={tabRecords}
                      gateMap={gateMap}
                      onOpen={openRecord}
                      onStatus={handleStatus}
                      onDelete={handleDelete}
                      canManageDelivery={canManageDelivery}
                    />
                  )}
                </Panel>
              </>
            )
          ) : null}
        </div>
      ))}

      {selected ? (
        <DeliveryDetail
          record={selected}
          gate={gateMap.get(`${selected.kind}:${selected.id}`)}
          statusError={statusError}
          onClose={() => openRecord(null)}
          onStatus={handleStatus}
          onDelete={handleDelete}
          onChanged={reloadAll}
          canManageDelivery={canManageDelivery}
          canUseAi={canUseAi}
        />
      ) : null}
      {creatingBuild && canManageDelivery ? (
        <CreateBuildDialog
          projects={projects}
          requirements={requirements}
          defects={defects}
          onClose={() => setCreatingBuild(false)}
          onCreated={() => {
            setCreatingBuild(false);
            reloadAll();
          }}
        />
      ) : null}
      {creatingRelease && canManageDelivery ? (
        <CreateReleaseDialog
          products={products}
          builds={builds}
          requirements={requirements}
          defects={defects}
          onClose={() => setCreatingRelease(false)}
          onCreated={() => {
            setCreatingRelease(false);
            reloadAll();
          }}
        />
      ) : null}
    </div>
  );
}
