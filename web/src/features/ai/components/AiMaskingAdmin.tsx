import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { FlaskConical, Plus, ShieldAlert } from 'lucide-react';
import {
  createAiMaskingRule,
  deleteAiMaskingRule,
  fetchAiMaskingRules,
  testAiMasking,
  updateAiMaskingRule,
  type AiMaskingMode,
  type AiMaskingRule,
  type AiMaskingRuleInput,
  type AiMaskingTestResult,
} from '../api/masking';
import { useConfirm } from '../../../components/common/ConfirmDialog';
import { useToast } from '../../../components/common/Toast';

/** Masking rules are an admin tool: no polling, refresh after mutations. */
const MASKING_QUERY_KEY = ['ai', 'masking', 'rules'] as const;

function ModeBadge({ mode }: { mode: AiMaskingMode }) {
  const { t } = useTranslation();
  return (
    <span className={`ai-masking-mode-badge is-${mode}`}>
      {mode === 'block'
        ? t('features.ai.aiMaskingAdmin.modeBlock')
        : t('features.ai.aiMaskingAdmin.modeReplace')}
    </span>
  );
}

function RuleForm({
  initial,
  onCancel,
  onSaved,
}: {
  initial: AiMaskingRule | null;
  onCancel: () => void;
  onSaved: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [name, setName] = useState(initial?.name ?? '');
  const [mode, setMode] = useState<AiMaskingMode>(initial?.mode ?? 'replace');
  const [pattern, setPattern] = useState(initial?.pattern ?? '');
  const [replacement, setReplacement] = useState(initial?.replacement ?? '');
  const [isRegex, setIsRegex] = useState(initial?.isRegex ?? false);
  const [caseSensitive, setCaseSensitive] = useState(initial?.caseSensitive ?? false);
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) { setFormError(t('features.ai.aiMaskingAdmin.nameRequired')); return; }
    if (!pattern.trim()) { setFormError(t('features.ai.aiMaskingAdmin.patternRequired')); return; }
    setSaving(true);
    setFormError(null);
    const input: AiMaskingRuleInput = {
      name: name.trim(),
      mode,
      pattern: pattern.trim(),
      ...(mode === 'replace' && replacement ? { replacement } : {}),
      isRegex,
      caseSensitive,
      enabled,
    };
    try {
      if (initial) await updateAiMaskingRule(initial.id, input);
      else await createAiMaskingRule(input);
      toast.success(t('features.ai.aiMaskingAdmin.saved'));
      await onSaved();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : t('features.ai.aiMaskingAdmin.saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      className="ai-masking-form"
      onSubmit={handleSubmit}
      aria-label={t(initial ? 'features.ai.aiMaskingAdmin.formTitleEdit' : 'features.ai.aiMaskingAdmin.formTitleNew')}
    >
      <div className="ai-masking-form-title">
        {initial ? t('features.ai.aiMaskingAdmin.formTitleEdit') : t('features.ai.aiMaskingAdmin.formTitleNew')}
      </div>
      {formError ? <div className="form-error">{formError}</div> : null}
      <div className="ai-masking-form-row">
        <label>
          <span>{t('features.ai.aiMaskingAdmin.fieldName')}</span>
          <input
            className="form-input"
            value={name}
            maxLength={120}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label>
          <span>{t('features.ai.aiMaskingAdmin.fieldMode')}</span>
          <select
            className="form-select"
            value={mode}
            onChange={(event) => setMode(event.target.value as AiMaskingMode)}
          >
            <option value="replace">{t('features.ai.aiMaskingAdmin.modeReplace')}</option>
            <option value="block">{t('features.ai.aiMaskingAdmin.modeBlock')}</option>
          </select>
        </label>
      </div>
      <p className="ai-masking-form-hint">
        {mode === 'block'
          ? t('features.ai.aiMaskingAdmin.fieldModeBlockHint')
          : t('features.ai.aiMaskingAdmin.fieldModeReplaceHint')}
      </p>
      <label>
        <span>{t('features.ai.aiMaskingAdmin.fieldPattern')}</span>
        <input
          className="form-input text-mono"
          value={pattern}
          maxLength={512}
          placeholder={t('features.ai.aiMaskingAdmin.fieldPatternPlaceholder')}
          onChange={(event) => setPattern(event.target.value)}
        />
      </label>
      {mode === 'replace' ? (
        <label>
          <span>{t('features.ai.aiMaskingAdmin.fieldReplacement')}</span>
          <input
            className="form-input"
            value={replacement}
            maxLength={200}
            placeholder={t('features.ai.aiMaskingAdmin.fieldReplacementPlaceholder')}
            onChange={(event) => setReplacement(event.target.value)}
          />
        </label>
      ) : null}
      <div className="ai-masking-form-row ai-masking-form-checks">
        <label className="ai-masking-check">
          <input type="checkbox" checked={isRegex} onChange={(event) => setIsRegex(event.target.checked)} />
          <span>{t('features.ai.aiMaskingAdmin.fieldIsRegex')}</span>
        </label>
        <label className="ai-masking-check">
          <input type="checkbox" checked={caseSensitive} onChange={(event) => setCaseSensitive(event.target.checked)} />
          <span>{t('features.ai.aiMaskingAdmin.fieldCaseSensitive')}</span>
        </label>
        <label className="ai-masking-check">
          <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
          <span>{t('features.ai.aiMaskingAdmin.fieldEnabled')}</span>
        </label>
      </div>
      <div className="ai-masking-form-actions">
        <button type="button" className="btn btn-secondary btn-sm" onClick={onCancel} disabled={saving}>
          {t('features.ai.aiMaskingAdmin.cancel')}
        </button>
        <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
          {saving ? t('features.ai.aiMaskingAdmin.saving') : t('features.ai.aiMaskingAdmin.save')}
        </button>
      </div>
    </form>
  );
}

function MaskingTestBox() {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AiMaskingTestResult | null>(null);

  async function handleRun(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!text.trim()) return;
    setTesting(true);
    setError(null);
    try {
      setResult(await testAiMasking(text));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('features.ai.aiMaskingAdmin.testFailed'));
    } finally {
      setTesting(false);
    }
  }

  return (
    <form className="ai-masking-test" onSubmit={handleRun}>
      <div className="ai-masking-test-title">
        <FlaskConical size={13} aria-hidden="true" />
        {t('features.ai.aiMaskingAdmin.testTitle')}
      </div>
      <label>
        <span>{t('features.ai.aiMaskingAdmin.testInputLabel')}</span>
        <textarea
          className="form-input ai-masking-test-input"
          rows={3}
          maxLength={4000}
          value={text}
          placeholder={t('features.ai.aiMaskingAdmin.testPlaceholder')}
          onChange={(event) => setText(event.target.value)}
        />
      </label>
      <button type="submit" className="btn btn-secondary btn-sm" disabled={testing || !text.trim()}>
        {testing ? t('features.ai.aiMaskingAdmin.testRunning') : t('features.ai.aiMaskingAdmin.testRun')}
      </button>
      {error ? <div className="form-error">{error}</div> : null}
      {result ? (
        <div className="ai-masking-test-result">
          <div className="ai-masking-test-block">
            <span className="ai-masking-test-label">{t('features.ai.aiMaskingAdmin.testResult')}</span>
            <pre className="text-mono">{result.masked}</pre>
          </div>
          <div className="ai-masking-test-block">
            <span className="ai-masking-test-label">{t('features.ai.aiMaskingAdmin.testViolations')}</span>
            {result.violations.length === 0 ? (
              <span className="ai-masking-test-empty">{t('features.ai.aiMaskingAdmin.testNoViolations')}</span>
            ) : (
              <ul className="ai-masking-test-violations">
                {result.violations.map((violation) => (
                  <li key={violation.ruleId} className="text-mono">
                    <ModeBadge mode={violation.mode} />
                    {violation.name}
                    <small>{violation.pattern}</small>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </form>
  );
}

/**
 * Admin panel for AI content masking rules: list/create/edit/delete with an
 * immediate-enable PATCH and an inline rule tester against /masking/test.
 */
export default function AiMaskingAdmin() {
  const { t } = useTranslation();
  const toast = useToast();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<{ mode: 'new' } | { mode: 'edit'; rule: AiMaskingRule } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const rulesQuery = useQuery({
    queryKey: [...MASKING_QUERY_KEY],
    queryFn: ({ signal }) => fetchAiMaskingRules(signal),
  });
  const rules = rulesQuery.data ?? [];

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: [...MASKING_QUERY_KEY] });
  }

  async function handleToggle(rule: AiMaskingRule, enabled: boolean) {
    setBusyId(rule.id);
    try {
      await updateAiMaskingRule(rule.id, { enabled });
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('features.ai.aiMaskingAdmin.toggleFailed'));
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(rule: AiMaskingRule) {
    const confirmed = await confirm({
      title: t('features.ai.aiMaskingAdmin.deleteTitle', { name: rule.name }),
      description: t('features.ai.aiMaskingAdmin.deleteDescription'),
      confirmText: t('features.ai.aiMaskingAdmin.deleteConfirm'),
      tone: 'danger',
    });
    if (!confirmed) return;
    setBusyId(rule.id);
    try {
      await deleteAiMaskingRule(rule.id);
      toast.success(t('features.ai.aiMaskingAdmin.deleted', { name: rule.name }));
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('features.ai.aiMaskingAdmin.deleteFailed'));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="ai-masking-admin" aria-label={t('features.ai.aiMaskingAdmin.title')}>
      <div className="ai-masking-header">
        <div className="ai-masking-heading">
          <ShieldAlert size={14} aria-hidden="true" />
          <strong>{t('features.ai.aiMaskingAdmin.title')}</strong>
          <em>{t('features.ai.aiMaskingAdmin.subtitle')}</em>
        </div>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => setEditing({ mode: 'new' })}
        >
          <Plus size={13} aria-hidden="true" />
          {t('features.ai.aiMaskingAdmin.newRule')}
        </button>
      </div>

      {rulesQuery.isError ? (
        <div className="ai-masking-state is-error" role="status">
          {t('features.ai.aiMaskingAdmin.loadFailed')}
        </div>
      ) : rulesQuery.isPending ? (
        <div className="ai-masking-state" role="status">
          {t('features.ai.aiMaskingAdmin.loading')}
        </div>
      ) : rules.length === 0 ? (
        <div className="ai-masking-state" role="status">
          {t('features.ai.aiMaskingAdmin.empty')}
        </div>
      ) : (
        <div className="ai-masking-table-wrap">
          <table className="ai-masking-table">
            <thead>
              <tr>
                <th>{t('features.ai.aiMaskingAdmin.columnName')}</th>
                <th>{t('features.ai.aiMaskingAdmin.columnMode')}</th>
                <th>{t('features.ai.aiMaskingAdmin.columnPattern')}</th>
                <th>{t('features.ai.aiMaskingAdmin.columnReplacement')}</th>
                <th>{t('features.ai.aiMaskingAdmin.columnEnabled')}</th>
                <th>{t('features.ai.aiMaskingAdmin.columnActions')}</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.id} className={rule.enabled ? '' : 'is-disabled'}>
                  <td>{rule.name}</td>
                  <td><ModeBadge mode={rule.mode} /></td>
                  <td className="text-mono">
                    {rule.pattern}
                    {rule.isRegex ? <small> · {t('features.ai.aiMaskingAdmin.regexFlag')}</small> : null}
                    {rule.caseSensitive ? <small> · {t('features.ai.aiMaskingAdmin.caseSensitiveFlag')}</small> : null}
                  </td>
                  <td className="text-mono">{rule.mode === 'replace' ? rule.replacement ?? '—' : '—'}</td>
                  <td>
                    <button
                      type="button"
                      className={`ai-masking-switch ${rule.enabled ? 'is-on' : ''}`}
                      role="switch"
                      aria-checked={rule.enabled}
                      aria-label={t('features.ai.aiMaskingAdmin.columnEnabled')}
                      disabled={busyId === rule.id}
                      onClick={() => { void handleToggle(rule, !rule.enabled); }}
                    >
                      <span className="ai-masking-switch-knob" aria-hidden="true" />
                    </button>
                  </td>
                  <td>
                    <div className="ai-masking-row-actions">
                      <button
                        type="button"
                        className="btn btn-text btn-xs"
                        disabled={busyId === rule.id}
                        onClick={() => setEditing({ mode: 'edit', rule })}
                      >
                        {t('features.ai.aiMaskingAdmin.edit')}
                      </button>
                      <button
                        type="button"
                        className="btn btn-text btn-xs"
                        disabled={busyId === rule.id}
                        onClick={() => { void handleDelete(rule); }}
                      >
                        {t('features.ai.aiMaskingAdmin.delete')}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing ? (
        <RuleForm
          initial={editing.mode === 'edit' ? editing.rule : null}
          onCancel={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await refresh();
          }}
        />
      ) : null}

      <MaskingTestBox />
    </section>
  );
}
