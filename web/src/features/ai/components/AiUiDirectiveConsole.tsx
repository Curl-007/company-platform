import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Send, TerminalSquare } from 'lucide-react';
import { sendAiUiDirective } from '../api/uiDirectives';
import {
  parseAgentUiDirective,
  UI_CONTENT_PADDING_MAX,
  UI_CONTENT_PADDING_MIN,
  UI_DENSITY_VALUES,
  UI_DIRECTIVE_KINDS,
  UI_FONT_FAMILY_VALUES,
  UI_FONT_SIZE_MAX,
  UI_FONT_SIZE_MIN,
  UI_THEME_MODE_VALUES,
  type AgentUiDirective,
  type UiDirectiveDensity,
  type UiDirectiveFontFamily,
  type UiDirectiveKind,
  type UiDirectiveThemeMode,
} from '../models/uiDirectiveModel';
import { KNOWN_PAGES } from '../../../app/pageRegistry';

const PREFIX = 'features.ai.aiUiDirectiveConsole';

/** login renders nothing; every other registry page is a valid target. */
const NAVIGABLE_PAGES = KNOWN_PAGES.filter((page) => page !== 'login');

/**
 * Ops tool for the AI ui_control pipeline: pick a whitelisted directive, fill
 * its parameters and POST it to /api/ai/ui-directives — the server delivers
 * it back to this user's connected clients over the agent.ui channel.
 */
export default function AiUiDirectiveConsole() {
  const { t } = useTranslation();
  const [kind, setKind] = useState<UiDirectiveKind>('theme');
  const [themeMode, setThemeMode] = useState<UiDirectiveThemeMode>('dark');
  const [fontSize, setFontSize] = useState(15);
  const [fontFamily, setFontFamily] = useState<UiDirectiveFontFamily>('system');
  const [density, setDensity] = useState<UiDirectiveDensity>('comfortable');
  const [accentColor, setAccentColor] = useState('#339cff');
  const [contentPadding, setContentPadding] = useState(24);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [page, setPage] = useState('dashboard');
  const [openSidebar, setOpenSidebar] = useState(true);
  const [sending, setSending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [delivered, setDelivered] = useState<number | null>(null);

  /** Builds the wire payload and re-runs the same validation the executor uses. */
  function buildDirective(): AgentUiDirective | null {
    switch (kind) {
      case 'theme': return { kind: 'theme', mode: themeMode };
      case 'fontSize': return parseAgentUiDirective({ kind: 'fontSize', value: fontSize });
      case 'fontFamily': return { kind: 'fontFamily', value: fontFamily };
      case 'density': return { kind: 'density', value: density };
      case 'accentColor': return parseAgentUiDirective({ kind: 'accentColor', value: accentColor });
      case 'contentPadding': return parseAgentUiDirective({ kind: 'contentPadding', value: contentPadding });
      case 'reduceMotion': return { kind: 'reduceMotion', value: reduceMotion };
      case 'navigate': return { kind: 'navigate', page };
      case 'openAiSidebar': return { kind: 'openAiSidebar', open: openSidebar };
      default: return null;
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const directive = buildDirective();
    if (!directive) {
      setFormError(t(`${PREFIX}.invalid`));
      return;
    }
    setSending(true);
    setFormError(null);
    try {
      const result = await sendAiUiDirective(directive);
      setDelivered(result.delivered);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : t(`${PREFIX}.sendFailed`));
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="ai-ui-console" aria-label={t(`${PREFIX}.title`)}>
      <div className="ai-ui-console-heading">
        <TerminalSquare size={14} aria-hidden="true" />
        <strong>{t(`${PREFIX}.title`)}</strong>
        <em>{t(`${PREFIX}.subtitle`)}</em>
      </div>
      {/* noValidate: the parse guard below is the authority for value ranges
          (HTML5 min/max stay as affordances), so every submit reaches it. */}
      <form className="ai-ui-console-form" onSubmit={handleSubmit} noValidate>
        <label>
          <span>{t(`${PREFIX}.kindLabel`)}</span>
          <select
            className="form-select"
            value={kind}
            aria-label={t(`${PREFIX}.kindLabel`)}
            onChange={(event) => {
              setKind(event.target.value as UiDirectiveKind);
              setFormError(null);
              setDelivered(null);
            }}
          >
            {UI_DIRECTIVE_KINDS.map((value) => (
              <option key={value} value={value}>{t(`${PREFIX}.kind_${value}`)}</option>
            ))}
          </select>
        </label>

        {kind === 'theme' ? (
          <label>
            <span>{t(`${PREFIX}.modeLabel`)}</span>
            <select
              className="form-select"
              value={themeMode}
              onChange={(event) => setThemeMode(event.target.value as UiDirectiveThemeMode)}
            >
              {UI_THEME_MODE_VALUES.map((value) => (
                <option key={value} value={value}>{t(`${PREFIX}.mode_${value}`)}</option>
              ))}
            </select>
          </label>
        ) : null}

        {kind === 'fontSize' ? (
          <label>
            <span>{t(`${PREFIX}.fontSizeLabel`)}</span>
            <input
              className="form-input"
              type="number"
              min={UI_FONT_SIZE_MIN}
              max={UI_FONT_SIZE_MAX}
              step={1}
              value={fontSize}
              onChange={(event) => setFontSize(Number(event.target.value))}
            />
          </label>
        ) : null}

        {kind === 'fontFamily' ? (
          <label>
            <span>{t(`${PREFIX}.fontFamilyLabel`)}</span>
            <select
              className="form-select"
              value={fontFamily}
              onChange={(event) => setFontFamily(event.target.value as UiDirectiveFontFamily)}
            >
              {UI_FONT_FAMILY_VALUES.map((value) => (
                <option key={value} value={value}>{t(`features.ai.uiCommandExecutor.font_${value}`)}</option>
              ))}
            </select>
          </label>
        ) : null}

        {kind === 'density' ? (
          <label>
            <span>{t(`${PREFIX}.densityLabel`)}</span>
            <select
              className="form-select"
              value={density}
              onChange={(event) => setDensity(event.target.value as UiDirectiveDensity)}
            >
              {UI_DENSITY_VALUES.map((value) => (
                <option key={value} value={value}>{t(`${PREFIX}.density_${value}`)}</option>
              ))}
            </select>
          </label>
        ) : null}

        {kind === 'accentColor' ? (
          <label>
            <span>{t(`${PREFIX}.accentColorLabel`)}</span>
            <input
              className="form-input ai-ui-console-color"
              type="color"
              value={accentColor}
              onChange={(event) => setAccentColor(event.target.value)}
            />
          </label>
        ) : null}

        {kind === 'contentPadding' ? (
          <label>
            <span>{t(`${PREFIX}.contentPaddingLabel`)}</span>
            <input
              className="form-input"
              type="number"
              min={UI_CONTENT_PADDING_MIN}
              max={UI_CONTENT_PADDING_MAX}
              step={1}
              value={contentPadding}
              onChange={(event) => setContentPadding(Number(event.target.value))}
            />
          </label>
        ) : null}

        {kind === 'reduceMotion' ? (
          <label className="ai-ui-console-check">
            <input
              type="checkbox"
              checked={reduceMotion}
              onChange={(event) => setReduceMotion(event.target.checked)}
            />
            <span>{t(`${PREFIX}.reduceMotionLabel`)}</span>
          </label>
        ) : null}

        {kind === 'navigate' ? (
          <label>
            <span>{t(`${PREFIX}.pageLabel`)}</span>
            <select
              className="form-select"
              value={page}
              onChange={(event) => setPage(event.target.value)}
            >
              {NAVIGABLE_PAGES.map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </label>
        ) : null}

        {kind === 'openAiSidebar' ? (
          <label className="ai-ui-console-check">
            <input
              type="checkbox"
              checked={openSidebar}
              onChange={(event) => setOpenSidebar(event.target.checked)}
            />
            <span>{t(`${PREFIX}.openAiSidebarLabel`)}</span>
          </label>
        ) : null}

        {formError ? <div className="form-error">{formError}</div> : null}

        <button type="submit" className="btn btn-primary btn-sm" disabled={sending}>
          <Send size={13} aria-hidden="true" />
          {sending ? t(`${PREFIX}.sending`) : t(`${PREFIX}.submit`)}
        </button>

        {delivered !== null ? (
          <div className="ai-ui-console-delivered" role="status">
            {t(`${PREFIX}.delivered`, { count: delivered })}
          </div>
        ) : null}
      </form>
    </section>
  );
}
