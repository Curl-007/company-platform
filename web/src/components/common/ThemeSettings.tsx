import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Check, Contrast, Maximize2, Minus, Moon, Palette, PanelLeftClose, PanelLeftOpen, PanelTop, Plus, RotateCcw, SlidersHorizontal, Sparkles, Sun, Type, X, ZapOff } from 'lucide-react';
import {
  WORK_FONT_LABELS,
  WORK_THEMES,
  applyWorkTheme,
  defaultWorkThemeSettings,
  readWorkThemeSettings,
  resetWorkThemeSettings,
  saveWorkThemeSettings,
  type WorkThemeFont,
  type WorkThemeNavLayout,
  type WorkThemeSettings,
} from '../../theme/workTheme';

const fontOptions = Object.entries(WORK_FONT_LABELS) as Array<[WorkThemeFont, string]>;
const FONT_SIZE_RANGE = [13, 18] as const;
const CONTENT_GUTTER_RANGE = [0, 240] as const;
const CONTENT_GUTTER_STEP = 4;
const CONTENT_GUTTER_TICK = 8;
const CONTENT_GUTTER_MAJOR = 40;

export default function ThemeSettings() {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<WorkThemeSettings>(() => readWorkThemeSettings());

  useEffect(() => {
    applyWorkTheme(settings);
  }, [settings]);

  const changed = useMemo(() => {
    return JSON.stringify(settings) !== JSON.stringify(defaultWorkThemeSettings);
  }, [settings]);

  function update(partial: Partial<WorkThemeSettings>) {
    setSettings((current) => saveWorkThemeSettings({ ...current, ...partial }));
  }

  function reset() {
    setSettings(resetWorkThemeSettings());
  }

  const drawer = open ? (
    <>
      <div className="theme-settings-scrim" onClick={() => setOpen(false)} />
      <aside className="theme-settings-drawer" aria-label="主题设置面板">
        <div className="theme-settings-header">
          <div>
            <div className="theme-settings-title">
              <SlidersHorizontal size={16} />
              主题设置
            </div>
            <div className="theme-settings-subtitle">来自 Glass UI 的主题、密度和玻璃参数</div>
          </div>
          <div className="theme-settings-actions">
            <button className="topbar-icon-button" onClick={reset} aria-label="恢复默认">
              <RotateCcw size={16} />
            </button>
            <button className="topbar-icon-button" onClick={() => setOpen(false)} aria-label="关闭主题设置">
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="theme-settings-body">
          <OptionBlock title="主题" canReset={settings.theme !== defaultWorkThemeSettings.theme} onReset={() => update({ theme: defaultWorkThemeSettings.theme })}>
            <div className="theme-preset-grid">
              {WORK_THEMES.map((theme) => (
                <ThemeCard
                  key={theme.id}
                  theme={theme}
                  mode={settings.mode}
                  active={settings.theme === theme.id}
                  onClick={() => update({ theme: theme.id })}
                />
              ))}
            </div>
          </OptionBlock>

          <OptionBlock title="明暗">
            <div className="theme-segmented">
              <button className={settings.mode === 'dark' ? 'active' : ''} onClick={() => update({ mode: 'dark' })}>
                <Moon size={15} /> 深色
              </button>
              <button className={settings.mode === 'light' ? 'active' : ''} onClick={() => update({ mode: 'light' })}>
                <Sun size={15} /> 浅色
              </button>
            </div>
          </OptionBlock>

          <section className="theme-settings-grid">
            <ToggleTile
              icon={<Contrast size={16} />}
              label="高对比"
              active={settings.contrast === 'high'}
              onClick={() => update({ contrast: settings.contrast === 'high' ? 'default' : 'high' })}
            />
            <ToggleTile
              icon={<Maximize2 size={16} />}
              label="紧凑布局"
              active={settings.density === 'compact'}
              onClick={() => update({ density: settings.density === 'compact' ? 'standard' : 'compact' })}
            />
            <ToggleTile
              icon={<ZapOff size={16} />}
              label="减少动效"
              active={settings.reduceMotion}
              onClick={() => update({ reduceMotion: !settings.reduceMotion })}
            />
            <ToggleTile
              icon={<Sparkles size={16} />}
              label="环境光"
              active={settings.ambient}
              onClick={() => update({ ambient: !settings.ambient })}
            />
          </section>

          <OptionBlock title="字体" canReset={settings.fontFamily !== defaultWorkThemeSettings.fontFamily} onReset={() => update({ fontFamily: defaultWorkThemeSettings.fontFamily })}>
            <div className="theme-font-grid">
              {fontOptions.map(([value, label]) => (
                <button
                  key={value}
                  className={settings.fontFamily === value ? 'active' : ''}
                  onClick={() => update({ fontFamily: value })}
                >
                  {label}
                </button>
              ))}
            </div>
          </OptionBlock>

          <FontSizeSetting
            value={settings.fontSize}
            canReset={settings.fontSize !== defaultWorkThemeSettings.fontSize}
            onReset={() => update({ fontSize: defaultWorkThemeSettings.fontSize })}
            onChange={(fontSize) => update({ fontSize })}
          />

          <GutterSetting
            value={settings.contentPadding}
            canReset={settings.contentPadding !== defaultWorkThemeSettings.contentPadding}
            onReset={() => update({ contentPadding: defaultWorkThemeSettings.contentPadding })}
            onChange={(contentPadding) => update({ contentPadding })}
          />

          <NavLayoutSetting
            value={settings.navLayout}
            canReset={settings.navLayout !== defaultWorkThemeSettings.navLayout}
            onReset={() => update({ navLayout: defaultWorkThemeSettings.navLayout })}
            onChange={(navLayout) => update({ navLayout })}
          />

          <ThemeTokenSummary themeId={settings.theme} />
        </div>
      </aside>
    </>
  ) : null;

  return (
    <>
      <button
        className="topbar-icon-button"
        onClick={() => setOpen(true)}
        aria-label="打开主题设置"
        title="主题设置"
      >
        <Palette size={18} />
        {changed ? <span className="topbar-notification-dot" /> : null}
      </button>

      {drawer ? createPortal(drawer, document.body) : null}
    </>
  );
}

function OptionBlock({
  title,
  canReset,
  onReset,
  children,
}: {
  title: string;
  canReset?: boolean;
  onReset?: () => void;
  children: ReactNode;
}) {
  return (
    <section className="theme-option-block">
      <span className="theme-option-title">
        {canReset && (
          <button onClick={onReset} aria-label={`重置${title}`}>
            <RotateCcw size={12} />
          </button>
        )}
        {title}
      </span>
      {children}
    </section>
  );
}

function ThemeCard({
  theme,
  mode,
  active,
  onClick,
}: {
  theme: (typeof WORK_THEMES)[number];
  mode: 'dark' | 'light';
  active: boolean;
  onClick: () => void;
}) {
  const preview = theme.preview[mode];
  return (
    <button className={`theme-preset-card ${active ? 'active' : ''}`} onClick={onClick} aria-pressed={active}>
      <span className="theme-preset-preview" style={{ background: preview.bg }}>
        <span style={{ background: `linear-gradient(90deg, ${preview.gradient.join(', ')})` }} />
      </span>
      <span className="theme-preset-label">{theme.label}</span>
      <small>{theme.blurb}</small>
      {active ? <Check size={14} /> : null}
    </button>
  );
}

function ToggleTile({ icon, label, active, onClick }: { icon: ReactNode; label: string; active: boolean; onClick: () => void }) {
  return (
    <button className={`theme-toggle-tile ${active ? 'active' : ''}`} onClick={onClick}>
      <span className="theme-toggle-icon">{icon}</span>
      <span>{label}</span>
      <strong>{active ? '开' : '关'}</strong>
    </button>
  );
}

function FontSizeSetting({
  value,
  canReset,
  onReset,
  onChange,
}: {
  value: number;
  canReset: boolean;
  onReset: () => void;
  onChange: (value: number) => void;
}) {
  const pct = ((value - FONT_SIZE_RANGE[0]) / (FONT_SIZE_RANGE[1] - FONT_SIZE_RANGE[0])) * 100;
  const nextValue = (delta: number) => onChange(Math.min(FONT_SIZE_RANGE[1], Math.max(FONT_SIZE_RANGE[0], value + delta)));

  return (
    <OptionBlock title="字号" canReset={canReset} onReset={onReset}>
      <div className="theme-stepper-row">
        <Type size={15} className="text-secondary" />
        <button className="topbar-icon-button" disabled={value <= FONT_SIZE_RANGE[0]} onClick={() => nextValue(-1)} aria-label="减小字号">
          <Minus size={14} />
        </button>
        <div className="theme-progress-track">
          <span style={{ width: `${pct}%` }} />
        </div>
        <button className="topbar-icon-button" disabled={value >= FONT_SIZE_RANGE[1]} onClick={() => nextValue(1)} aria-label="增大字号">
          <Plus size={14} />
        </button>
        <strong>{value}px</strong>
      </div>
    </OptionBlock>
  );
}

function GutterSetting({
  value,
  canReset,
  onReset,
  onChange,
}: {
  value: number;
  canReset: boolean;
  onReset: () => void;
  onChange: (value: number) => void;
}) {
  const [min, max] = CONTENT_GUTTER_RANGE;
  const pct = ((value - min) / (max - min)) * 100;
  const ticks: number[] = [];
  for (let item = min; item <= max; item += CONTENT_GUTTER_TICK) ticks.push(item);

  function valueFromClientX(clientX: number, element: HTMLElement) {
    const rect = element.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const raw = min + ratio * (max - min);
    onChange(Math.round(raw / CONTENT_GUTTER_STEP) * CONTENT_GUTTER_STEP);
  }

  return (
    <OptionBlock title="内容边距" canReset={canReset} onReset={onReset}>
      <div className="theme-gutter-head">
        <span>页面左右留白</span>
        <strong>{value}px</strong>
      </div>
      <div
        className="theme-gutter-ruler"
        role="slider"
        aria-label="内容边距"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        tabIndex={0}
        onPointerDown={(event) => {
          const target = event.currentTarget;
          target.setPointerCapture(event.pointerId);
          valueFromClientX(event.clientX, target);
        }}
        onPointerMove={(event) => {
          if (event.buttons !== 1) return;
          valueFromClientX(event.clientX, event.currentTarget);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
            event.preventDefault();
            onChange(Math.max(min, value - CONTENT_GUTTER_STEP));
          }
          if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
            event.preventDefault();
            onChange(Math.min(max, value + CONTENT_GUTTER_STEP));
          }
        }}
      >
        <div className="theme-gutter-track" />
        <div className="theme-gutter-fill" style={{ width: `${pct}%` }} />
        {ticks.map((tick) => {
          const major = tick % CONTENT_GUTTER_MAJOR === 0;
          return (
            <span
              key={tick}
              className={`theme-gutter-tick ${major ? 'major' : ''}`}
              style={{ left: `${((tick - min) / (max - min)) * 100}%` }}
            >
              {major ? <em>{tick}</em> : null}
            </span>
          );
        })}
        <span className="theme-gutter-thumb" style={{ left: `${pct}%` }} />
      </div>
    </OptionBlock>
  );
}

function NavLayoutSetting({
  value,
  canReset,
  onReset,
  onChange,
}: {
  value: WorkThemeNavLayout;
  canReset: boolean;
  onReset: () => void;
  onChange: (value: WorkThemeNavLayout) => void;
}) {
  const options: Array<{ value: WorkThemeNavLayout; label: string; icon: ReactNode; kind: WorkThemeNavLayout }> = [
    { value: 'mini', label: '迷你', icon: <PanelLeftClose size={16} />, kind: 'mini' },
    { value: 'expanded', label: '展开', icon: <PanelLeftOpen size={16} />, kind: 'expanded' },
    { value: 'horizontal', label: '横向', icon: <PanelTop size={16} />, kind: 'horizontal' },
  ];

  return (
    <OptionBlock title="导航布局" canReset={canReset} onReset={onReset}>
      <div className="theme-layout-grid">
        {options.map((option) => (
          <button
            key={option.value}
            className={`theme-layout-option ${value === option.value ? 'active' : ''}`}
            onClick={() => onChange(option.value)}
            aria-pressed={value === option.value}
          >
            <span className="theme-layout-preview" data-kind={option.kind}>
              <i />
              <b />
            </span>
            <span className="theme-layout-label">
              {option.icon}
              {option.label}
            </span>
          </button>
        ))}
      </div>
    </OptionBlock>
  );
}

function ThemeTokenSummary({ themeId }: { themeId: string }) {
  const theme = WORK_THEMES.find((item) => item.id === themeId) ?? WORK_THEMES[0];
  return (
    <section className="theme-token-summary">
      <div>
        <span>圆角</span>
        <strong>{theme.signature.radius}px</strong>
      </div>
      <div>
        <span>玻璃</span>
        <strong>{theme.signature.glassBlur ? `${theme.signature.glassBlur}px` : '关闭'}</strong>
      </div>
      <div>
        <span>强调</span>
        <strong>{theme.signature.gradient[0]}</strong>
      </div>
    </section>
  );
}
