import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Contrast, Maximize2, Minus, Moon, Palette, Plus, RotateCcw, SlidersHorizontal, Sun, Type, X, ZapOff } from 'lucide-react';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from '../ui';
import {
  WORK_FONT_LABELS,
  WORK_THEME_STORAGE_KEY,
  applyWorkTheme,
  defaultWorkThemeSettings,
  readWorkThemeSettings,
  resetWorkThemeSettings,
  saveWorkThemeSettings,
  saveWorkThemeSettingsWithTransition,
  type WorkThemeFont,
  type WorkThemeSettings,
} from '../../theme/workTheme';

const fontOptions = Object.entries(WORK_FONT_LABELS) as Array<[WorkThemeFont, string]>;
const FONT_SIZE_RANGE = [13, 18] as const;
const CONTENT_GUTTER_RANGE = [0, 240] as const;
const CONTENT_GUTTER_STEP = 4;
const CONTENT_GUTTER_TICK = 8;
const CONTENT_GUTTER_MAJOR = 40;

export default function ThemeSettings() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<WorkThemeSettings>(() => readWorkThemeSettings());
  // Track the last pointer position so theme-mode toggles can reveal from the
  // click point (View Transitions radial wipe).
  const lastPointer = useRef<{ x: number; y: number } | undefined>(undefined);

  useEffect(() => {
    const recordPointer = (event: PointerEvent) => {
      lastPointer.current = { x: event.clientX, y: event.clientY };
    };
    window.addEventListener('pointerdown', recordPointer);
    return () => window.removeEventListener('pointerdown', recordPointer);
  }, []);

  useEffect(() => {
    const syncAcrossTabs = (event: StorageEvent) => {
      if (event.key !== WORK_THEME_STORAGE_KEY && event.key !== null) return;
      const next = readWorkThemeSettings();
      applyWorkTheme(next);
      setSettings(next);
    };
    window.addEventListener('storage', syncAcrossTabs);
    return () => window.removeEventListener('storage', syncAcrossTabs);
  }, []);

  const changed = useMemo(() => {
    return JSON.stringify(settings) !== JSON.stringify(defaultWorkThemeSettings);
  }, [settings]);

  function update(partial: Partial<WorkThemeSettings>) {
    // Theme mode toggles get the View Transition radial reveal; every other
    // setting (font, density, contrast) applies instantly as before.
    if ('mode' in partial) {
      const origin = lastPointer.current;
      setSettings((current) => saveWorkThemeSettingsWithTransition({ ...current, ...partial }, origin));
    } else {
      setSettings((current) => saveWorkThemeSettings({ ...current, ...partial }));
    }
  }

  function reset() {
    setSettings(resetWorkThemeSettings());
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          className="topbar-icon-button"
          aria-label={t('common.openThemeSettings')}
          title={t('common.themeSettings')}
        >
          <Palette size={18} />
          {changed ? <span className="topbar-notification-dot" /> : null}
        </button>
      </SheetTrigger>
      <SheetContent
        side="right"
        showClose={false}
        className="theme-settings-drawer"
        aria-labelledby="theme-settings-title"
      >
        <div className="theme-settings-header">
          <div>
            <SheetTitle className="theme-settings-title" id="theme-settings-title">
              <SlidersHorizontal size={16} />
              {t('common.themeSettings')}
            </SheetTitle>
            <SheetDescription className="theme-settings-subtitle">{t('common.themeSettingsSubtitle')}</SheetDescription>
          </div>
          <div className="theme-settings-actions">
            <SheetClose asChild>
              <button type="button" className="topbar-icon-button theme-settings-close" aria-label={t('common.closeThemeSettings')}>
                <X size={16} />
              </button>
            </SheetClose>
            <button type="button" className="topbar-icon-button" onClick={reset} aria-label={t('common.restoreDefaults')}>
              <RotateCcw size={16} />
            </button>
          </div>
        </div>

        <div className="theme-settings-body">
          <OptionBlock title={t('common.themeMode')}>
            <div className="theme-segmented">
              <button type="button" className={settings.mode === 'dark' ? 'active' : ''} aria-pressed={settings.mode === 'dark'} onClick={() => update({ mode: 'dark' })}>
                <Moon size={15} /> {t('common.dark')}
              </button>
              <button type="button" className={settings.mode === 'light' ? 'active' : ''} aria-pressed={settings.mode === 'light'} onClick={() => update({ mode: 'light' })}>
                <Sun size={15} /> {t('common.light')}
              </button>
            </div>
          </OptionBlock>

          <section className="theme-settings-grid">
            <ToggleTile
              icon={<Contrast size={16} />}
              label={t('common.highContrast')}
              active={settings.contrast === 'high'}
              onClick={() => update({ contrast: settings.contrast === 'high' ? 'default' : 'high' })}
            />
            <ToggleTile
              icon={<Maximize2 size={16} />}
              label={t('common.compactLayout')}
              active={settings.density === 'compact'}
              onClick={() => update({ density: settings.density === 'compact' ? 'standard' : 'compact' })}
            />
            <ToggleTile
              icon={<ZapOff size={16} />}
              label={t('common.reduceMotion')}
              active={settings.reduceMotion}
              onClick={() => update({ reduceMotion: !settings.reduceMotion })}
            />
          </section>

          <OptionBlock title={t('common.font')} canReset={settings.fontFamily !== defaultWorkThemeSettings.fontFamily} onReset={() => update({ fontFamily: defaultWorkThemeSettings.fontFamily })}>
            <div className="theme-font-grid">
              {fontOptions.map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={settings.fontFamily === value ? 'active' : ''}
                  aria-pressed={settings.fontFamily === value}
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
        </div>
      </SheetContent>
    </Sheet>
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
  const { t } = useTranslation();
  return (
    <section className="theme-option-block">
      <h2 className="theme-option-title">
        {canReset && (
          <button type="button" onClick={onReset} aria-label={t('common.resetOption', { label: title })}>
            <RotateCcw size={12} />
          </button>
        )}
        {title}
      </h2>
      {children}
    </section>
  );
}

function ToggleTile({ icon, label, active, onClick }: { icon: ReactNode; label: string; active: boolean; onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <button type="button" className={`theme-toggle-tile ${active ? 'active' : ''}`} onClick={onClick} aria-pressed={active}>
      <span className="theme-toggle-icon">{icon}</span>
      <span>{label}</span>
      <strong>{t(active ? 'common.on' : 'common.off')}</strong>
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
  const { t } = useTranslation();
  const pct = ((value - FONT_SIZE_RANGE[0]) / (FONT_SIZE_RANGE[1] - FONT_SIZE_RANGE[0])) * 100;
  const nextValue = (delta: number) => onChange(Math.min(FONT_SIZE_RANGE[1], Math.max(FONT_SIZE_RANGE[0], value + delta)));

  return (
    <OptionBlock title={t('common.fontSize')} canReset={canReset} onReset={onReset}>
      <div className="theme-stepper-row">
        <Type size={15} className="text-secondary" />
        <button type="button" className="topbar-icon-button" disabled={value <= FONT_SIZE_RANGE[0]} onClick={() => nextValue(-1)} aria-label={t('common.decreaseFontSize')}>
          <Minus size={14} />
        </button>
        <div className="theme-progress-track">
          <span style={{ width: `${pct}%` }} />
        </div>
        <button type="button" className="topbar-icon-button" disabled={value >= FONT_SIZE_RANGE[1]} onClick={() => nextValue(1)} aria-label={t('common.increaseFontSize')}>
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
  const { t } = useTranslation();
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
    <OptionBlock title={t('common.contentPadding')} canReset={canReset} onReset={onReset}>
      <div className="theme-gutter-head">
        <span>{t('common.pageGutter')}</span>
        <strong>{value}px</strong>
      </div>
      <div
        className="theme-gutter-ruler"
        role="slider"
        aria-label={t('common.contentPadding')}
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
