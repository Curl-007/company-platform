import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
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
  { key: 'overview', label: '全链路', icon: Sparkles },
  { key: 'builds', label: '构建', icon: Package },
  { key: 'releases', label: '发布', icon: Rocket },
  { key: 'gates', label: '质量门禁', icon: ShieldCheck },
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
        ownerLabel: record.ownerLabel || (record.kind === 'build' ? '未关联项目' : '未关联产品'),
      });
      return;
    }
    setSelected(null);
  }

  async function handleStatus(record: DeliveryRecord, status: string) {
    if (!canManageDelivery) {
      toast.error('当前账号无权更新构建发布状态。');
      return;
    }
    setStatusError(null);
    try {
      if (record.kind === 'build') await updateBuildStatus(record.id, status);
      else await updateReleaseStatus(record.id, status);
      toast.success('状态已更新');
      setSelected(null);
      reloadAll();
    } catch (err: unknown) {
      const message = err instanceof ApiError ? err.message : '更新失败';
      setStatusError(message);
      toast.error(message);
    }
  }

  async function handleDelete(record: DeliveryRecord) {
    if (!canManageDelivery) {
      toast.error('当前账号无权删除交付记录。');
      return;
    }
    const confirmed = await confirm({
      title: `删除${record.kind === 'build' ? '构建' : '发布'}“${record.title}”？`,
      description: '删除后该记录将从构建发布中心移除，关联追踪信息也不可恢复。',
      confirmText: '删除',
      tone: 'danger',
    });
    if (!confirmed) return;
    try {
      if (record.kind === 'build') await deleteBuild(record.id);
      else await deleteRelease(record.id);
      toast.success('记录已删除');
      setSelected(null);
      reloadAll();
    } catch (err: unknown) {
      toast.error(err instanceof ApiError ? err.message : '删除失败');
    }
  }

  const statusChoices = Array.from(new Set([...BUILD_STATUS_OPTIONS, ...RELEASE_STATUS_OPTIONS]));

  return (
    <div className="dl-workbench delivery-center-page">
      <section className="dl-signal-strip" aria-label="交付概况">
        <div className="dl-signal">
          <span className="dl-signal-label"><Package size={13} aria-hidden="true" /> 构建</span>
          <strong>{summary.builds}</strong>
          <em>候选发布 {summary.candidates}</em>
        </div>
        <div className="dl-signal">
          <span className="dl-signal-label"><Rocket size={13} aria-hidden="true" /> 发布</span>
          <strong>{summary.releases}</strong>
          <em>已发布 {summary.released}</em>
        </div>
        <div className={`dl-signal ${summary.inValidation > 0 ? 'is-info' : ''}`}>
          <span className="dl-signal-label"><ShieldCheck size={13} aria-hidden="true" /> 验证中</span>
          <strong>{summary.inValidation}</strong>
          <em>测试 + 预发</em>
        </div>
        <div className={`dl-signal ${summary.blockedGates > 0 ? 'is-warn' : ''}`}>
          <span className="dl-signal-label"><ShieldCheck size={13} aria-hidden="true" /> 门禁阻断</span>
          <strong>{summary.blockedGates}</strong>
          <em>准入规则待处理</em>
        </div>
        <div className={`dl-signal ${summary.risks > 0 ? 'is-risk' : ''}`}>
          <span className="dl-signal-label"><AlertTriangle size={13} aria-hidden="true" /> 风险项</span>
          <strong>{summary.risks}</strong>
          <em>失败 {summary.failedBuilds} · 回滚 {summary.rollbacks}</em>
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
        <div className="dl-tab-row" role="tablist" aria-label="构建发布视图">
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
              {label}
            </button>
          ))}
        </div>
        {canManageDelivery ? (
          <div className="dl-actions">
            <button className="btn btn-secondary btn-sm btn-with-icon" onClick={() => setCreatingBuild(true)}>
              <Plus size={14} aria-hidden="true" /> 新建构建
            </button>
            <button className="btn btn-primary btn-sm btn-with-icon" onClick={() => setCreatingRelease(true)}>
              <Rocket size={14} aria-hidden="true" /> 新建发布
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
                      ? '最近交付记录'
                      : tab === 'builds'
                        ? '构建清单'
                        : tab === 'releases'
                          ? '发布清单'
                          : '质量门禁'
                  }
                  subtitle={
                    tab === 'gates'
                      ? `显示 ${tabRecords.length} / ${records.length} 条 · 阻断 ${summary.blockedGates}`
                      : `显示 ${tabRecords.length} / ${records.length} 条交付记录`
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
