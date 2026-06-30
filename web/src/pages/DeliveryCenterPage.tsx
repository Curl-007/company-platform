import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CircleDot,
  GitBranch,
  Package,
  Play,
  Plus,
  Rocket,
  Search,
  ShieldCheck,
  Tag,
} from 'lucide-react';
import {
  createBuild,
  createRelease,
  createReleaseApproval,
  createRollbackRecord,
  deleteBuild,
  deleteRelease,
  fetchBuilds,
  fetchDeliveryGates,
  fetchDefects,
  fetchProducts,
  fetchProjects,
  fetchReleases,
  fetchReleaseApprovals,
  fetchReleaseReport,
  fetchRequirements,
  fetchRollbackRecords,
  sendAiChat,
  updateBuildStatus,
  updateReleaseStatus,
} from '../services/resources';
import { ApiError } from '../services/api';
import { getSessionUser } from '../services/auth';
import { useAsync } from '../hooks/useAsync';
import PageHeader from '../components/common/PageHeader';
import Panel from '../components/common/Panel';
import PageState from '../components/common/PageState';
import Overlay from '../components/common/Overlay';
import StatusBadge from '../components/common/StatusBadge';
import ProgressBar from '../components/common/ProgressBar';
import BusinessAdvicePanel from '../components/common/BusinessAdvicePanel';
import { useToast } from '../components/common/Toast';
import { useConfirm } from '../components/common/ConfirmDialog';
import {
  BUILD_STATUS_LABELS,
  RELEASE_STATUS_LABELS,
  RELEASE_TYPE_LABELS,
  labelOf,
} from '../constants/enums';
import { canOperate } from '../constants/roles';
import type { Build, Defect, DeliveryGateResult, Product, Project, Release, ReleaseApproval, ReleaseReport, Requirement, RollbackRecord } from '../types';

type DeliveryTab = 'overview' | 'builds' | 'releases' | 'gates';
type DeliveryKind = 'build' | 'release';
type StageTone = 'done' | 'running' | 'idle' | 'risk';

interface DeliveryRecord {
  id: string;
  kind: DeliveryKind;
  title: string;
  version?: string | null;
  status: string;
  date?: string | null;
  ownerLabel: string;
  ownerId?: string | null;
  linkedStories: string[];
  linkedBugs: string[];
  notes?: string | null;
  buildId?: string | null;
  source: Build | Release;
}

const BUILD_STATUS_OPTIONS = ['building', 'testing', 'released', 'failed'];
const RELEASE_STATUS_OPTIONS = ['draft', 'staging', 'released', 'rollback'];

function initialDeliveryTab(): DeliveryTab {
  const page = window.location.hash.replace(/^#\/?/, '').split('?')[0];
  if (page === 'builds') return 'builds';
  if (page === 'releases') return 'releases';
  return 'overview';
}

function currentDeliveryRoute(): { page: string; focusId: string | null } {
  const hash = window.location.hash.replace(/^#\/?/, '');
  const [page = '', query = ''] = hash.split('?');
  return {
    page,
    focusId: new URLSearchParams(query).get('focus'),
  };
}

function splitIds(value: string): string[] {
  return value
    .split(/[,，\n\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(value?: string | null): string {
  if (!value) return '未设置';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('zh-CN');
}

function statusLabel(kind: DeliveryKind, status: string): string {
  return kind === 'build' ? labelOf(BUILD_STATUS_LABELS, status) : labelOf(RELEASE_STATUS_LABELS, status);
}

function statusOptions(kind: DeliveryKind): string[] {
  return kind === 'build' ? BUILD_STATUS_OPTIONS : RELEASE_STATUS_OPTIONS;
}

function statusTone(record: DeliveryRecord): 'success' | 'warning' | 'risk' | 'info' {
  if (record.status === 'released') return 'success';
  if (record.status === 'failed' || record.status === 'rollback') return 'risk';
  if (record.status === 'testing' || record.status === 'staging') return 'info';
  return 'warning';
}

function releaseReadiness(record: DeliveryRecord): number {
  let score = 20;
  if (record.version) score += 20;
  if (record.date) score += 15;
  if (record.linkedStories.length > 0) score += 20;
  if (record.linkedBugs.length === 0) score += 15;
  if (record.notes) score += 10;
  if (record.status === 'released') score = 100;
  if (record.status === 'failed' || record.status === 'rollback') score = Math.min(score, 45);
  return Math.min(100, score);
}

function buildRecords(
  builds: Build[],
  releases: Release[],
  projects: Project[],
  products: Product[],
): DeliveryRecord[] {
  const projectMap = new Map(projects.map((item) => [item.id, item.name]));
  const productMap = new Map(products.map((item) => [item.id, item.name]));
  return [
    ...builds.map((build): DeliveryRecord => ({
      id: build.id,
      kind: 'build',
      title: build.name,
      version: build.version,
      status: build.status,
      date: build.buildDate,
      ownerId: build.projectId,
      ownerLabel: projectMap.get(build.projectId) ?? build.projectId,
      linkedStories: build.linkedStories ?? [],
      linkedBugs: build.linkedBugs ?? [],
      notes: build.notes,
      source: build,
    })),
    ...releases.map((release): DeliveryRecord => ({
      id: release.id,
      kind: 'release',
      title: release.name,
      version: release.version,
      status: release.status,
      date: release.releaseDate,
      ownerId: release.productId,
      ownerLabel: release.productId ? productMap.get(release.productId) ?? release.productId : '未关联产品',
      linkedStories: release.linkedStories ?? [],
      linkedBugs: release.linkedBugs ?? [],
      notes: release.releaseNotes,
      buildId: release.buildId,
      source: release,
    })),
  ].sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')));
}

function buildDeliveryAiPrompt(
  records: DeliveryRecord[],
  gates: DeliveryGateResult[],
  requirements: Requirement[],
  defects: Defect[],
): string {
  const blockedGates = gates.filter((item) => !item.ready);
  const openDefects = defects.filter((item) => item.status !== 'closed');
  const seriousOpenDefects = openDefects.filter((item) => ['blocker', 'critical', 'high'].includes(item.severity));
  const unfinishedRequirements = requirements.filter((item) => !['done', 'closed', 'accepted', 'completed'].includes(item.status));
  const candidates = records.filter((item) => item.kind === 'build' && item.status === 'released');
  const releases = records.filter((item) => item.kind === 'release');
  const latestRecords = records.slice(0, 10).map((item) => {
    const gate = gates.find((gateItem) => gateItem.kind === item.kind && gateItem.id === item.id);
    return `${item.kind === 'build' ? '构建' : '发布'} ${item.id} ${item.title} / ${item.version || '无版本'} / ${statusLabel(item.kind, item.status)} / 就绪 ${gate?.score ?? releaseReadiness(item)}% / 门禁 ${gate ? (gate.ready ? '通过' : '阻断') : '未知'} / 需求 ${item.linkedStories.length} / 缺陷 ${item.linkedBugs.length}`;
  });
  const blockedGateLines = blockedGates.slice(0, 8).map((item) => {
    const record = records.find((recordItem) => recordItem.kind === item.kind && recordItem.id === item.id);
    const failed = item.gates.filter((gate) => !gate.passed).map((gate) => `${gate.label}: ${gate.message}`).join('；');
    return `${item.kind === 'build' ? '构建' : '发布'} ${item.id} ${record?.title || ''} / ${item.score}% / ${item.summary} / ${failed || '未给出阻断项'}`;
  });
  const defectLines = seriousOpenDefects.slice(0, 8).map((item) => `${item.id} ${item.title} / ${item.severity} / ${item.status} / ${item.assignee || '未分配'}`);
  const requirementLines = unfinishedRequirements.slice(0, 8).map((item) => `${item.id} ${item.title} / ${item.status} / ${item.priority} / ${item.completion ?? 0}%`);

  return [
    '请作为交付经理 AI 助手，基于下面构建、发布、门禁、需求和缺陷快照，给出发布准备度分析。',
    '请控制在 900 字以内，输出：1. 当前能否发布 2. 主要阻塞/风险 3. 候选版本处理建议 4. 发布治理动作 5. 需要补齐的数据。',
    '建议必须具体到版本、构建、发布、门禁、缺陷或需求，不要泛泛而谈。',
    '',
    `交付记录总数：${records.length}，构建候选：${candidates.length}，发布单：${releases.length}`,
    `门禁结果：${gates.length} 条，阻断：${blockedGates.length} 条`,
    `未完成需求：${unfinishedRequirements.length}，未关闭缺陷：${openDefects.length}，高严重未关闭缺陷：${seriousOpenDefects.length}`,
    '',
    '最近交付记录：',
    latestRecords.length ? latestRecords.join('\n') : '暂无交付记录',
    '',
    '阻断门禁：',
    blockedGateLines.length ? blockedGateLines.join('\n') : '暂无阻断门禁',
    '',
    '高严重未关闭缺陷：',
    defectLines.length ? defectLines.join('\n') : '暂无高严重未关闭缺陷',
    '',
    '未完成需求：',
    requirementLines.length ? requirementLines.join('\n') : '暂无未完成需求',
  ].join('\n');
}

function DeliveryAiPanel({
  records,
  gates,
  requirements,
  defects,
  loading,
  error,
}: {
  records: DeliveryRecord[];
  gates: DeliveryGateResult[];
  requirements: Requirement[];
  defects: Defect[];
  loading: boolean;
  error: unknown;
}) {
  const [aiAdvice, setAiAdvice] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const blockedGates = gates.filter((item) => !item.ready).length;
  const candidates = records.filter((item) => item.kind === 'build' && item.status === 'released').length;
  const openDefects = defects.filter((item) => item.status !== 'closed').length;

  async function handleAnalyze() {
    setAiError(null);
    setAiLoading(true);
    try {
      const reply = await sendAiChat({
        messages: [
          {
            role: 'user',
            content: buildDeliveryAiPrompt(records, gates, requirements, defects),
          },
        ],
        scope: 'delivery-readiness-advice',
        currentPage: 'delivery',
      });
      setAiAdvice(reply.content);
    } catch (err: unknown) {
      setAiError(err instanceof ApiError ? err.message : 'AI 交付分析生成失败，请检查模型配置或稍后重试。');
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <section className="delivery-ai-panel">
      <div className="delivery-ai-main">
        <div>
          <div className="section-title">AI 交付参谋</div>
          <div className="body-text">基于构建、发布、质量门禁、未完成需求和缺陷闭环生成发布准备度建议。</div>
        </div>
        <div className="delivery-ai-stats">
          <span>候选 {candidates}</span>
          <span>门禁阻断 {blockedGates}</span>
          <span>未关闭缺陷 {openDefects}</span>
        </div>
      </div>
      <div className="delivery-ai-actions">
        <button className="btn btn-primary btn-sm" onClick={handleAnalyze} disabled={loading || aiLoading || Boolean(error)}>
          {aiLoading ? 'AI 分析中...' : aiAdvice ? '重新分析交付' : 'AI 交付建议'}
        </button>
      </div>
      {error ? <div className="form-error">交付数据加载失败，暂时无法生成 AI 建议。</div> : null}
      {(aiAdvice || aiLoading || aiError) ? (
        <div className="delivery-ai-result">
          {aiLoading ? <div className="body-text">AI 正在分析发布准备度、门禁阻断和缺陷闭环，请稍候...</div> : null}
          {aiError ? <div className="form-error">{aiError}</div> : null}
          {aiAdvice ? <div className="delivery-ai-content">{aiAdvice}</div> : null}
        </div>
      ) : null}
    </section>
  );
}

function DeliveryCenterPage() {
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

  const projectsState = useAsync<Project[]>(fetchProjects, []);
  const productsState = useAsync<Product[]>(fetchProducts, []);
  const buildsState = useAsync<Build[]>(() => fetchBuilds(), []);
  const releasesState = useAsync<Release[]>(() => fetchReleases(), []);
  const gatesState = useAsync<DeliveryGateResult[]>(() => fetchDeliveryGates(), []);
  const requirementsState = useAsync<Requirement[]>(() => fetchRequirements(), []);
  const defectsState = useAsync<Defect[]>(() => fetchDefects(), []);

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
      return [
        item.id,
        item.buildId ?? '',
        item.version ?? '',
      ].some((value) => value.toLowerCase() === focus);
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
    const inValidation = builds.filter((item) => item.status === 'testing').length + releases.filter((item) => item.status === 'staging').length;
    const blockedGates = gateResults.filter((item) => !item.ready).length;
    const risks = builds.filter((item) => item.status === 'failed').length + releases.filter((item) => item.status === 'rollback').length + blockedGates;
    const candidates = builds.filter((item) => item.status === 'released' && !releaseBuildIds.has(item.id)).length;
    return { released, inValidation, risks, candidates, blockedGates };
  }, [builds, gateResults, releaseBuildIds, releases]);

  const pipelineStages = useMemo(() => {
    const stageData: Array<{ id: string; label: string; tone: StageTone; records: DeliveryRecord[] }> = [
      { id: 'building', label: '构建中', tone: 'running', records: records.filter((item) => item.kind === 'build' && item.status === 'building') },
      { id: 'testing', label: '测试验证', tone: 'running', records: records.filter((item) => item.status === 'testing' || item.status === 'staging') },
      {
        id: 'candidate',
        label: '候选发布',
        tone: 'idle',
        records: records.filter((item) => (item.kind === 'build' && item.status === 'released' && !releaseBuildIds.has(item.id)) || (item.kind === 'release' && item.status === 'draft')),
      },
      { id: 'released', label: '已发布', tone: 'done', records: records.filter((item) => item.kind === 'release' && item.status === 'released') },
      { id: 'risk', label: '失败/回滚', tone: 'risk', records: records.filter((item) => item.status === 'failed' || item.status === 'rollback') },
    ];
    return stageData;
  }, [records, releaseBuildIds]);

  function reloadAll() {
    buildsState.reload();
    releasesState.reload();
    gatesState.reload();
    requirementsState.reload();
    defectsState.reload();
  }

  function openRecord(record: DeliveryRecord | null) {
    setStatusError(null);
    setSelected(record);
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
    <div className="delivery-center-page">
      <PageHeader
        title="构建发布中心"
        description="把项目构建、质量验证、候选版本和对外发布放在同一条交付链路里管理。"
        actions={canManageDelivery ? (
          <div className="delivery-header-actions">
            <button className="btn btn-secondary btn-sm" onClick={() => setCreatingBuild(true)}>
              <Plus size={15} /> 新建构建
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => setCreatingRelease(true)}>
              <Rocket size={15} /> 新建发布
            </button>
          </div>
        ) : undefined}
      />

      <div className="delivery-kpi-grid">
        <DeliveryKpi icon={<Package size={18} />} label="构建总数" value={builds.length} meta={`${summary.candidates} 个候选发布`} />
        <DeliveryKpi icon={<Rocket size={18} />} label="发布总数" value={releases.length} meta={`${summary.released} 个已发布`} tone="success" />
        <DeliveryKpi icon={<ShieldCheck size={18} />} label="验证中" value={summary.inValidation} meta="构建测试 + 预发布" tone="info" />
        <DeliveryKpi icon={<AlertTriangle size={18} />} label="门禁阻断" value={summary.risks} meta={`${summary.blockedGates} 条准入规则待处理`} tone={summary.risks > 0 ? 'risk' : 'success'} />
      </div>

      {canUseAi ? (
        <DeliveryAiPanel
          records={records}
          gates={gateResults}
          requirements={requirements}
          defects={defects}
          loading={loading}
          error={error}
        />
      ) : null}

      <div className="delivery-tabs">
        {[
          ['overview', '全链路'],
          ['builds', '构建'],
          ['releases', '发布'],
          ['gates', '质量门禁'],
        ].map(([key, label]) => (
          <button key={key} className={`delivery-tab ${tab === key ? 'active' : ''}`} onClick={() => setTab(key as DeliveryTab)}>
            {label}
          </button>
        ))}
      </div>

      {loading || error ? (
        <PageState loading={loading} error={error} onRetry={reloadAll} />
      ) : (
        <>
          {tab === 'overview' ? (
            <div className="delivery-overview-grid">
              <Panel title="交付流水线" subtitle="参考 Glass UI 的 Pipeline 阶段式视图，按构建到发布展示当前流转。">
                <div className="delivery-pipeline">
                  {pipelineStages.map((stage, index) => (
                    <div className={`delivery-stage ${stage.tone}`} key={stage.id}>
                      <div className="delivery-stage-head">
                        <span className="delivery-stage-icon">
                          {stage.tone === 'done' ? <CheckCircle2 size={16} /> : stage.tone === 'risk' ? <AlertTriangle size={16} /> : <CircleDot size={16} />}
                        </span>
                        <div>
                          <strong>{stage.label}</strong>
                          <span>{stage.records.length} 条记录</span>
                        </div>
                        {index < pipelineStages.length - 1 ? <ArrowRight className="delivery-stage-arrow" size={16} /> : null}
                      </div>
                      <div className="delivery-stage-list">
                        {stage.records.slice(0, 4).map((record) => (
                          <button key={`${record.kind}-${record.id}`} className="delivery-stage-item" onClick={() => openRecord(record)}>
                            <span>{record.title}</span>
                            <StatusBadge status={record.status} label={statusLabel(record.kind, record.status)} showDot={false} />
                          </button>
                        ))}
                        {stage.records.length === 0 ? <div className="delivery-empty-inline">暂无记录</div> : null}
                      </div>
                    </div>
                  ))}
                </div>
              </Panel>

              <Panel title="候选发布" subtitle="已通过构建但尚未创建发布单的版本">
                <div className="delivery-candidate-list">
                  {builds.filter((item) => item.status === 'released' && !releaseBuildIds.has(item.id)).slice(0, 6).map((build) => (
                    <button
                      key={build.id}
                      className="delivery-candidate-row"
                      onClick={() => {
                        if (canManageDelivery) setCreatingRelease(true);
                        else openRecord(buildRecords([build], [], projects, products)[0] ?? null);
                      }}
                    >
                      <span className="text-mono">{build.version || build.id}</span>
                      <strong>{build.name}</strong>
                      <span>{formatDate(build.buildDate)}</span>
                    </button>
                  ))}
                  {summary.candidates === 0 ? <div className="delivery-empty-inline">暂无待发布候选</div> : null}
                </div>
              </Panel>
            </div>
          ) : null}

          {tab !== 'overview' ? (
            <Panel
              title={tab === 'builds' ? '构建清单' : tab === 'releases' ? '发布清单' : '质量门禁'}
              subtitle={`当前显示 ${filteredRecords.length} / ${records.length} 条交付记录`}
            >
              <DeliveryFilters
                keyword={keyword}
                onKeyword={setKeyword}
                kind={kindFilter}
                onKind={setKindFilter}
                status={statusFilter}
                onStatus={setStatusFilter}
                statusChoices={statusChoices}
              />
              {tab === 'gates' ? (
                <GateBoard records={filteredRecords} gateMap={gateMap} onOpen={openRecord} />
              ) : (
                <DeliveryRecordList
                  records={filteredRecords.filter((record) => tab === 'builds' ? record.kind === 'build' : record.kind === 'release')}
                  onOpen={openRecord}
                  onStatus={handleStatus}
                  onDelete={handleDelete}
                  canManageDelivery={canManageDelivery}
                />
              )}
            </Panel>
          ) : (
            <Panel title="最近交付记录" subtitle="构建、预发、正式发布和回滚统一追踪">
              <DeliveryFilters
                keyword={keyword}
                onKeyword={setKeyword}
                kind={kindFilter}
                onKind={setKindFilter}
                status={statusFilter}
                onStatus={setStatusFilter}
                statusChoices={statusChoices}
              />
              <DeliveryRecordList records={filteredRecords} onOpen={openRecord} onStatus={handleStatus} onDelete={handleDelete} canManageDelivery={canManageDelivery} />
            </Panel>
          )}
        </>
      )}

      {selected ? <DeliveryDetail record={selected} gate={gateMap.get(`${selected.kind}:${selected.id}`)} statusError={statusError} onClose={() => openRecord(null)} onStatus={handleStatus} onDelete={handleDelete} onChanged={reloadAll} canManageDelivery={canManageDelivery} canUseAi={canUseAi} /> : null}
      {creatingBuild && canManageDelivery ? <CreateBuildDialog projects={projects} requirements={requirements} defects={defects} onClose={() => setCreatingBuild(false)} onCreated={() => { setCreatingBuild(false); reloadAll(); }} /> : null}
      {creatingRelease && canManageDelivery ? <CreateReleaseDialog products={products} builds={builds} requirements={requirements} defects={defects} onClose={() => setCreatingRelease(false)} onCreated={() => { setCreatingRelease(false); reloadAll(); }} /> : null}
    </div>
  );
}

function DeliveryKpi({ icon, label, value, meta, tone = 'info' }: { icon: React.ReactNode; label: string; value: number; meta: string; tone?: 'info' | 'success' | 'risk' }) {
  return (
    <div className={`delivery-kpi-card ${tone}`}>
      <div className="delivery-kpi-icon">{icon}</div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <p>{meta}</p>
      </div>
    </div>
  );
}

function DeliveryFilters({
  keyword,
  onKeyword,
  kind,
  onKind,
  status,
  onStatus,
  statusChoices,
}: {
  keyword: string;
  onKeyword: (value: string) => void;
  kind: '' | DeliveryKind;
  onKind: (value: '' | DeliveryKind) => void;
  status: string;
  onStatus: (value: string) => void;
  statusChoices: string[];
}) {
  return (
    <div className="delivery-filter-bar">
      <div className="delivery-search">
        <Search size={16} />
        <input className="form-input" value={keyword} onChange={(event) => onKeyword(event.target.value)} placeholder="搜索版本、名称、需求、缺陷或构建号" />
      </div>
      <select className="form-select" value={kind} onChange={(event) => onKind(event.target.value as '' | DeliveryKind)}>
        <option value="">全部类型</option>
        <option value="build">构建</option>
        <option value="release">发布</option>
      </select>
      <select className="form-select" value={status} onChange={(event) => onStatus(event.target.value)}>
        <option value="">全部状态</option>
        {statusChoices.map((item) => <option key={item} value={item}>{labelOf({ ...BUILD_STATUS_LABELS, ...RELEASE_STATUS_LABELS }, item)}</option>)}
      </select>
    </div>
  );
}

function DeliveryRecordList({
  records,
  onOpen,
  onStatus,
  onDelete,
  canManageDelivery,
}: {
  records: DeliveryRecord[];
  onOpen: (record: DeliveryRecord) => void;
  onStatus: (record: DeliveryRecord, status: string) => void;
  onDelete: (record: DeliveryRecord) => void;
  canManageDelivery: boolean;
}) {
  if (records.length === 0) {
    return <div className="delivery-empty-block">暂无匹配的交付记录。</div>;
  }
  return (
    <div className="delivery-record-list">
      {records.map((record) => (
        <div
          key={`${record.kind}-${record.id}`}
          className={`delivery-record-card ${record.kind}`}
          role="button"
          tabIndex={0}
          onClick={() => onOpen(record)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onOpen(record);
            }
          }}
        >
          <div className="delivery-record-icon">
            {record.kind === 'build' ? <Package size={18} /> : <Rocket size={18} />}
          </div>
          <div className="delivery-record-main">
            <div className="delivery-record-title">
              <span className="delivery-version">{record.version ? `v${record.version}` : record.id}</span>
              <strong>{record.title}</strong>
              <StatusBadge status={record.status} label={statusLabel(record.kind, record.status)} showDot={false} />
            </div>
            <div className="delivery-record-meta">
              <span>{record.kind === 'build' ? '项目' : '产品'}：{record.ownerLabel}</span>
              <span>{formatDate(record.date)}</span>
              {record.buildId ? <span>构建 {record.buildId}</span> : null}
            </div>
            {record.notes ? <p>{record.notes}</p> : null}
          </div>
          <div className="delivery-record-side">
            <div className="delivery-mini-metrics">
              <span>{record.linkedStories.length} 需求</span>
              <span>{record.linkedBugs.length} 缺陷</span>
              <span>{releaseReadiness(record)}% 就绪</span>
            </div>
            <ProgressBar percent={releaseReadiness(record)} height={6} showPercent={false} variant={statusTone(record)} />
          </div>
          {canManageDelivery ? (
            <div className="delivery-record-actions" onClick={(event) => event.stopPropagation()}>
              <select className="form-select form-select-xs" value={record.status} onChange={(event) => onStatus(record, event.target.value)}>
                {statusOptions(record.kind).map((status) => (
                  <option value={status} key={status}>{statusLabel(record.kind, status)}</option>
                ))}
              </select>
              <button className="btn btn-text btn-sm text-risk" onClick={() => onDelete(record)}>删除</button>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function GateBoard({
  records,
  gateMap,
  onOpen,
}: {
  records: DeliveryRecord[];
  gateMap: Map<string, DeliveryGateResult>;
  onOpen: (record: DeliveryRecord) => void;
}) {
  return (
    <div className="delivery-gate-board">
      {records.map((record) => {
        const gate = gateMap.get(`${record.kind}:${record.id}`);
        return (
          <button className={`delivery-gate-card ${gate?.ready ? 'ready' : 'blocked'}`} key={`${record.kind}-${record.id}`} onClick={() => onOpen(record)}>
            <div className="delivery-gate-head">
              <span className="delivery-version">{record.version ? `v${record.version}` : record.id}</span>
              <strong>{record.title}</strong>
              <StatusBadge status={record.status} label={statusLabel(record.kind, record.status)} showDot={false} />
            </div>
            <div className="delivery-gate-summary">
              <span>{gate?.summary ?? '正在读取门禁结果'}</span>
              <strong>{gate?.score ?? releaseReadiness(record)}%</strong>
            </div>
            {(gate?.gates ?? []).map((line) => (
              <GateLine key={line.id} label={line.label} passed={line.passed} value={line.message} />
            ))}
            {!gate ? <GateLine label="门禁预检" passed={false} value="暂未获取到后端预检结果" /> : null}
            <div className="delivery-linked-list">
              {record.linkedStories.slice(0, 3).map((item) => <span key={item}>需求 {item}</span>)}
              {record.linkedBugs.slice(0, 3).map((item) => <span key={item}>缺陷 {item}</span>)}
            </div>
          </button>
        );
      })}
      {records.length === 0 ? <div className="delivery-empty-block">暂无门禁记录。</div> : null}
    </div>
  );
}

function GateLine({ label, value, passed }: { label: string; value: string; passed: boolean }) {
  return (
    <div className={`delivery-gate-line ${passed ? 'passed' : 'blocked'}`}>
      <span>{passed ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function DeliveryDetail({
  record,
  gate,
  statusError,
  onClose,
  onStatus,
  onDelete,
  onChanged,
  canManageDelivery,
  canUseAi,
}: {
  record: DeliveryRecord;
  gate?: DeliveryGateResult;
  statusError?: string | null;
  onClose: () => void;
  onStatus: (record: DeliveryRecord, status: string) => void;
  onDelete: (record: DeliveryRecord) => void;
  onChanged: () => void;
  canManageDelivery: boolean;
  canUseAi: boolean;
}) {
  const readiness = gate?.score ?? releaseReadiness(record);
  const toast = useToast();
  const releaseId = record.kind === 'release' ? record.id : '';
  const approvalsState = useAsync<ReleaseApproval[]>(
    () => releaseId ? fetchReleaseApprovals(releaseId) : Promise.resolve([]),
    [releaseId],
  );
  const rollbacksState = useAsync<RollbackRecord[]>(
    () => releaseId ? fetchRollbackRecords(releaseId) : Promise.resolve([]),
    [releaseId],
  );
  const reportState = useAsync<ReleaseReport | null>(
    () => releaseId ? fetchReleaseReport(releaseId) : Promise.resolve(null),
    [releaseId],
  );
  const [approvalComment, setApprovalComment] = useState('');
  const [rollbackReason, setRollbackReason] = useState('');
  const [rollbackImpact, setRollbackImpact] = useState('');
  const [rollbackPlan, setRollbackPlan] = useState('');
  const [governanceError, setGovernanceError] = useState<string | null>(null);
  const [submittingGovernance, setSubmittingGovernance] = useState(false);

  async function submitApproval(decision: 'approve' | 'reject') {
    if (!releaseId) return;
    setSubmittingGovernance(true);
    setGovernanceError(null);
    try {
      await createReleaseApproval(releaseId, { decision, comment: approvalComment.trim() || undefined });
      setApprovalComment('');
      approvalsState.reload();
      reportState.reload();
      onChanged();
      toast.success(decision === 'approve' ? '发布审批已通过' : '发布审批已驳回');
    } catch (err: unknown) {
      const message = err instanceof ApiError ? err.message : '审批提交失败';
      setGovernanceError(message);
      toast.error(message);
    } finally {
      setSubmittingGovernance(false);
    }
  }

  async function submitRollback() {
    if (!releaseId) return;
    if (!rollbackReason.trim()) {
      setGovernanceError('请填写回滚原因');
      return;
    }
    setSubmittingGovernance(true);
    setGovernanceError(null);
    try {
      await createRollbackRecord(releaseId, {
        reason: rollbackReason.trim(),
        impact: rollbackImpact.trim() || undefined,
        plan: rollbackPlan.trim() || undefined,
      });
      setRollbackReason('');
      setRollbackImpact('');
      setRollbackPlan('');
      rollbacksState.reload();
      reportState.reload();
      onChanged();
      toast.success('回滚记录已创建');
    } catch (err: unknown) {
      const message = err instanceof ApiError ? err.message : '回滚登记失败';
      setGovernanceError(message);
      toast.error(message);
    } finally {
      setSubmittingGovernance(false);
    }
  }

  return (
    <Overlay onClose={onClose} maxWidth={860}>
      <Panel
        className="delivery-detail-panel"
        title={record.title}
        subtitle={`${record.kind === 'build' ? '构建记录' : '发布记录'} · ${record.ownerLabel}`}
        toolbar={<StatusBadge status={record.status} label={statusLabel(record.kind, record.status)} />}
      >
        <div className="delivery-detail-grid">
          <DetailItem label="版本" value={record.version ? `v${record.version}` : '未设置'} />
          <DetailItem label="日期" value={formatDate(record.date)} />
          <DetailItem label={record.kind === 'build' ? '所属项目' : '所属产品'} value={record.ownerLabel} />
          <DetailItem label="就绪度" value={`${readiness}%`} />
        </div>
        <div className="delivery-detail-readiness">
          <div className="delivery-detail-readiness-head">
            <span>发布就绪度</span>
            <strong>{readiness}%</strong>
          </div>
          <ProgressBar percent={readiness} height={8} variant={gate?.ready ? 'success' : statusTone(record)} />
        </div>
        {canUseAi ? (
          <BusinessAdvicePanel
            targetType={record.kind}
            targetId={record.id}
            title={record.kind === 'build' ? 'AI 构建建议' : 'AI 发布建议'}
            description={record.kind === 'build'
              ? '基于后端构建门禁、关联需求、任务、测试和缺陷生成。'
              : '基于后端发布门禁、审批、回滚、发布报告和审计链路生成。'}
            buttonText={record.kind === 'build' ? 'AI 分析构建' : 'AI 分析发布'}
            question={record.kind === 'build'
              ? '请分析该构建是否适合进入发布，并指出阻断门禁、质量风险和下一步动作。'
              : '请分析该发布是否适合正式发布或复盘，并指出审批、回滚、质量和审计风险。'}
            draft={() => ({
              status: record.status,
              readiness,
              gateSummary: gate?.summary,
              failedGates: gate?.gates.filter((item) => !item.passed).map((item) => `${item.label}: ${item.message}`),
            })}
          />
        ) : null}
        <section className={`delivery-detail-gates ${gate?.ready ? 'ready' : 'blocked'}`}>
          <div className="delivery-detail-gates-head">
            <div>
              <h3>准入门禁</h3>
              <p>{gate?.summary ?? '暂未获取到后端预检结果。'}</p>
            </div>
            <StatusBadge status={gate?.ready ? 'passed' : 'blocked'} label={gate?.ready ? '可发布' : '需处理'} showDot={false} />
          </div>
          <div className="delivery-detail-gate-list">
            {(gate?.gates ?? []).map((line) => (
              <GateLine key={line.id} label={line.label} passed={line.passed} value={line.message} />
            ))}
            {!gate ? <GateLine label="门禁预检" passed={false} value="后端预检结果暂不可用" /> : null}
          </div>
        </section>
        <div className="delivery-detail-sections">
          <section>
            <h3>关联需求</h3>
            <TagList items={record.linkedStories} empty="暂无关联需求" />
          </section>
          <section>
            <h3>关联缺陷</h3>
            <TagList items={record.linkedBugs} empty="暂无关联缺陷" />
          </section>
          <section className="wide">
            <h3>{record.kind === 'build' ? '构建备注' : '发布说明'}</h3>
            <p>{record.notes || '暂无说明。'}</p>
          </section>
        </div>
        {record.kind === 'release' ? (
          <section className="delivery-governance">
            <div className="delivery-governance-head">
              <div>
                <h3>发布治理</h3>
                <p>审批、驳回和回滚都会写入审计链路。</p>
              </div>
              <StatusBadge status={record.status} label={statusLabel(record.kind, record.status)} showDot={false} />
            </div>
            {governanceError ? <div className="form-error">{governanceError}</div> : null}
            <div className="delivery-governance-grid">
              <div className="delivery-governance-box">
                <h4>审批意见</h4>
                <textarea
                  className="form-textarea"
                  rows={3}
                  value={approvalComment}
                  onChange={(event) => setApprovalComment(event.target.value)}
                  placeholder="补充审批意见、风险提醒或驳回原因"
                  disabled={!canManageDelivery || submittingGovernance}
                />
                {canManageDelivery ? (
                  <div className="delivery-governance-actions">
                    <button className="btn btn-primary btn-sm" disabled={submittingGovernance} onClick={() => void submitApproval('approve')}>通过审批</button>
                    <button className="btn btn-secondary btn-sm" disabled={submittingGovernance} onClick={() => void submitApproval('reject')}>驳回</button>
                  </div>
                ) : null}
                <RecordList
                  loading={approvalsState.loading}
                  empty="暂无审批记录"
                  records={(approvalsState.data ?? []).map((item) => ({
                    id: item.id,
                    title: item.decision === 'approve' ? '审批通过' : '审批驳回',
                    meta: `${item.approverName || '未知'} · ${formatDate(item.createdAt)}`,
                    body: item.comment || '未填写审批意见',
                  }))}
                />
              </div>
              <div className="delivery-governance-box">
                <h4>回滚登记</h4>
                <input
                  className="form-input"
                  value={rollbackReason}
                  onChange={(event) => setRollbackReason(event.target.value)}
                  placeholder="回滚原因"
                  disabled={!canManageDelivery || submittingGovernance}
                />
                <textarea
                  className="form-textarea"
                  rows={2}
                  value={rollbackImpact}
                  onChange={(event) => setRollbackImpact(event.target.value)}
                  placeholder="影响范围"
                  disabled={!canManageDelivery || submittingGovernance}
                />
                <textarea
                  className="form-textarea"
                  rows={2}
                  value={rollbackPlan}
                  onChange={(event) => setRollbackPlan(event.target.value)}
                  placeholder="回滚方案或验证计划"
                  disabled={!canManageDelivery || submittingGovernance}
                />
                {canManageDelivery ? (
                  <div className="delivery-governance-actions">
                    <button className="btn btn-danger btn-sm" disabled={submittingGovernance} onClick={() => void submitRollback()}>登记回滚</button>
                  </div>
                ) : null}
                <RecordList
                  loading={rollbacksState.loading}
                  empty="暂无回滚记录"
                  records={(rollbacksState.data ?? []).map((item) => ({
                    id: item.id,
                    title: item.reason,
                    meta: `${item.operatorName || '未知'} · ${formatDate(item.createdAt)}`,
                    body: [item.impact, item.plan].filter(Boolean).join(' / ') || '未填写影响范围或方案',
                  }))}
                />
              </div>
            </div>
          </section>
        ) : null}
        {record.kind === 'release' ? (
          <ReleaseReportSection report={reportState.data} loading={reportState.loading} error={reportState.error} />
        ) : null}
        {statusError ? <div className="form-error">{statusError}</div> : null}
        {canManageDelivery ? (
          <div className="delivery-detail-actions">
            <select className="form-select" value={record.status} onChange={(event) => onStatus(record, event.target.value)}>
              {statusOptions(record.kind).map((status) => <option value={status} key={status}>{statusLabel(record.kind, status)}</option>)}
            </select>
            <button className="btn btn-danger btn-sm" onClick={() => onDelete(record)}>删除</button>
          </div>
        ) : null}
      </Panel>
    </Overlay>
  );
}

function ReleaseReportSection({ report, loading, error }: { report?: ReleaseReport | null; loading: boolean; error: unknown }) {
  if (loading) {
    return (
      <section className="delivery-report-section">
        <div className="delivery-empty-inline">发布报告生成中...</div>
      </section>
    );
  }
  if (error) {
    return (
      <section className="delivery-report-section">
        <div className="form-error">发布报告加载失败。</div>
      </section>
    );
  }
  if (!report) return null;
  return (
    <section className="delivery-report-section">
      <div className="delivery-report-head">
        <div>
          <h3>发布报告</h3>
          <p>{report.summary}</p>
        </div>
        <StatusBadge status={report.gate.ready ? 'passed' : 'blocked'} label={`${report.metrics.readyScore}%`} showDot={false} />
      </div>
      <div className="delivery-report-metrics">
        <DetailItem label="覆盖需求" value={`${report.metrics.requirementCount}`} />
        <DetailItem label="关联缺陷" value={`${report.metrics.defectCount}`} />
        <DetailItem label="未关闭缺陷" value={`${report.metrics.openDefectCount}`} />
        <DetailItem label="审批记录" value={`${report.metrics.approvalCount}`} />
        <DetailItem label="回滚记录" value={`${report.metrics.rollbackCount}`} />
        <DetailItem label="审计记录" value={`${report.metrics.auditCount}`} />
      </div>
      {report.build ? (
        <div className="delivery-report-linked">
          <span>关联构建</span>
          <strong>{report.build.id} · {report.build.name}</strong>
          <StatusBadge status={report.build.status} label={statusLabel('build', report.build.status)} showDot={false} />
        </div>
      ) : null}
      {report.recommendations.length ? (
        <div className="delivery-report-list">
          <strong>复盘建议</strong>
          {report.recommendations.map((item) => <span key={item}>{item}</span>)}
        </div>
      ) : null}
      <div className="delivery-report-list">
        <strong>最近审计</strong>
        {report.auditTrail.slice(0, 6).map((item) => (
          <span key={item.id}>{item.action} · {item.actorName || '未知'} · {formatDate(item.createdAt)}</span>
        ))}
        {report.auditTrail.length === 0 ? <span>暂无审计记录</span> : null}
      </div>
    </section>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="delivery-detail-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function TagList({ items, empty }: { items: string[]; empty: string }) {
  if (items.length === 0) return <div className="delivery-empty-inline">{empty}</div>;
  return <div className="delivery-tag-list">{items.map((item) => <span key={item}>{item}</span>)}</div>;
}

function RecordList({
  loading,
  empty,
  records,
}: {
  loading: boolean;
  empty: string;
  records: Array<{ id: string; title: string; meta: string; body: string }>;
}) {
  if (loading) return <div className="delivery-empty-inline">加载中...</div>;
  if (records.length === 0) return <div className="delivery-empty-inline">{empty}</div>;
  return (
    <div className="delivery-governance-records">
      {records.map((record) => (
        <div className="delivery-governance-record" key={record.id}>
          <div>
            <strong>{record.title}</strong>
            <span>{record.meta}</span>
          </div>
          <p>{record.body}</p>
        </div>
      ))}
    </div>
  );
}

function CreateBuildDialog({ projects, requirements, defects, onClose, onCreated }: { projects: Project[]; requirements: Requirement[]; defects: Defect[]; onClose: () => void; onCreated: () => void }) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? '');
  const [name, setName] = useState('');
  const [version, setVersion] = useState('');
  const [buildDate, setBuildDate] = useState(today());
  const [scmHash, setScmHash] = useState('');
  const [linkedStories, setLinkedStories] = useState('');
  const [linkedBugs, setLinkedBugs] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function submit() {
    setFormError(null);
    if (!projectId) return setFormError('请选择所属项目。');
    if (!name.trim()) return setFormError('请输入构建名称。');
    setSubmitting(true);
    try {
      await createBuild({
        projectId,
        name: name.trim(),
        version: version.trim() || undefined,
        buildDate,
        scmHash: scmHash.trim() || undefined,
        linkedStories: splitIds(linkedStories),
        linkedBugs: splitIds(linkedBugs),
        notes: notes.trim() || undefined,
      });
      onCreated();
    } catch (err: unknown) {
      setFormError(err instanceof ApiError ? err.message : '创建失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Overlay onClose={onClose} maxWidth={720}>
      <Panel title="新建构建" subtitle="记录代码构建、版本号、提交标识和关联需求/缺陷。">
        <DeliveryFormError message={formError} />
        <form className="delivery-form" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
          <div className="form-row">
            <FormSelect label="所属项目" value={projectId} onChange={setProjectId} options={projects.map((item) => ({ value: item.id, label: item.name }))} />
            <FormInput label="构建名称" value={name} onChange={setName} placeholder="例如：研发平台一期开发构建 #24" />
          </div>
          <div className="form-row">
            <FormInput label="版本号" value={version} onChange={setVersion} placeholder="1.2.0" />
            <FormInput label="构建日期" type="date" value={buildDate} onChange={setBuildDate} />
          </div>
          <FormInput label="提交标识" value={scmHash} onChange={setScmHash} placeholder="例如：a1b2c3d" />
          <QuickIdInput label="关联需求" value={linkedStories} onChange={setLinkedStories} items={requirements.map((item) => item.id)} />
          <QuickIdInput label="关联缺陷" value={linkedBugs} onChange={setLinkedBugs} items={defects.map((item) => item.id)} />
          <FormTextarea label="构建说明" value={notes} onChange={setNotes} placeholder="补充本次构建范围、测试目标或风险说明" />
          <FormActions submitting={submitting} submitText="创建构建" onClose={onClose} />
        </form>
      </Panel>
    </Overlay>
  );
}

function CreateReleaseDialog({ products, builds, requirements, defects, onClose, onCreated }: { products: Product[]; builds: Build[]; requirements: Requirement[]; defects: Defect[]; onClose: () => void; onCreated: () => void }) {
  const [productId, setProductId] = useState(products[0]?.id ?? '');
  const [buildId, setBuildId] = useState(builds.find((item) => item.status === 'released')?.id ?? '');
  const [name, setName] = useState('');
  const [version, setVersion] = useState('');
  const [releaseDate, setReleaseDate] = useState(today());
  const [releaseType, setReleaseType] = useState('official');
  const [linkedStories, setLinkedStories] = useState('');
  const [linkedBugs, setLinkedBugs] = useState('');
  const [releaseNotes, setReleaseNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function submit() {
    setFormError(null);
    if (!name.trim()) return setFormError('请输入发布名称。');
    setSubmitting(true);
    try {
      await createRelease({
        productId: productId || undefined,
        buildId: buildId || undefined,
        name: name.trim(),
        version: version.trim() || undefined,
        releaseDate,
        releaseType,
        linkedStories: splitIds(linkedStories),
        linkedBugs: splitIds(linkedBugs),
        releaseNotes: releaseNotes.trim() || undefined,
      });
      onCreated();
    } catch (err: unknown) {
      setFormError(err instanceof ApiError ? err.message : '创建失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Overlay onClose={onClose} maxWidth={720}>
      <Panel title="新建发布" subtitle="从候选构建生成对外发布单，沉淀版本说明和质量门禁。">
        <DeliveryFormError message={formError} />
        <form className="delivery-form" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
          <div className="form-row">
            <FormSelect label="所属产品" value={productId} onChange={setProductId} options={[{ value: '', label: '未关联产品' }, ...products.map((item) => ({ value: item.id, label: item.name }))]} />
            <FormSelect label="关联构建" value={buildId} onChange={setBuildId} options={[{ value: '', label: '未关联构建' }, ...builds.map((item) => ({ value: item.id, label: `${item.version || item.id} · ${item.name}` }))]} />
          </div>
          <div className="form-row">
            <FormInput label="发布名称" value={name} onChange={setName} placeholder="例如：项目管理平台 v1.2" />
            <FormInput label="版本号" value={version} onChange={setVersion} placeholder="1.2.0" />
          </div>
          <div className="form-row">
            <FormInput label="发布日期" type="date" value={releaseDate} onChange={setReleaseDate} />
            <FormSelect label="发布类型" value={releaseType} onChange={setReleaseType} options={[
              { value: 'official', label: labelOf(RELEASE_TYPE_LABELS, 'official') },
              { value: 'stable', label: labelOf(RELEASE_TYPE_LABELS, 'stable') },
              { value: 'hotfix', label: labelOf(RELEASE_TYPE_LABELS, 'hotfix') },
            ]} />
          </div>
          <QuickIdInput label="关联需求" value={linkedStories} onChange={setLinkedStories} items={requirements.map((item) => item.id)} />
          <QuickIdInput label="关联缺陷" value={linkedBugs} onChange={setLinkedBugs} items={defects.map((item) => item.id)} />
          <FormTextarea label="发布说明" value={releaseNotes} onChange={setReleaseNotes} placeholder="补充新增能力、修复内容、影响范围和回滚方案" />
          <FormActions submitting={submitting} submitText="创建发布" onClose={onClose} />
        </form>
      </Panel>
    </Overlay>
  );
}

function DeliveryFormError({ message }: { message: string | null }) {
  return message ? <div className="form-error" style={{ marginBottom: 12 }}>{message}</div> : null;
}

function FormInput({ label, value, onChange, placeholder, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string }) {
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <input className="form-input" type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </div>
  );
}

function FormTextarea({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <textarea className="form-textarea" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} rows={4} />
    </div>
  );
}

function FormSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) {
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <select className="form-select" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
      </select>
    </div>
  );
}

function QuickIdInput({ label, value, onChange, items }: { label: string; value: string; onChange: (value: string) => void; items: string[] }) {
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <input className="form-input" value={value} onChange={(event) => onChange(event.target.value)} placeholder="可输入多个 ID，用逗号或空格分隔" />
      {items.length > 0 ? (
        <div className="delivery-id-suggestions">
          {items.slice(0, 8).map((item) => (
            <button type="button" key={item} onClick={() => onChange([value, item].filter(Boolean).join(', '))}>{item}</button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function FormActions({ submitting, submitText, onClose }: { submitting: boolean; submitText: string; onClose: () => void }) {
  return (
    <div className="delivery-form-actions">
      <button type="button" className="btn btn-secondary btn-sm" onClick={onClose} disabled={submitting}>取消</button>
      <button type="submit" className="btn btn-primary btn-sm" disabled={submitting}>{submitting ? '提交中...' : submitText}</button>
    </div>
  );
}

export default DeliveryCenterPage;
