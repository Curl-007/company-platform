import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { applyWorkTheme, defaultWorkThemeSettings } from './workTheme';

// Dual-source-of-truth guard: workTheme.ts applyWorkTheme() is the runtime truth
// (inline CSS vars, win over the stylesheet); index.css :root / .dark / light
// blocks are the no-JS first-paint fallback and MUST mirror it. This test locks
// them together so a palette change in one place fails CI until the other syncs.

// vitest runs with cwd = web/ project root; happy-dom's import.meta.url is not a
// file: URL, so resolve from cwd instead.
const INDEX_CSS = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8').replace(/\r\n/g, '\n');

/** Grab the first `{ ... }` body for an exact selector and parse its declarations. */
function readBlock(css: string, selector: string): Record<string, string> {
  const start = css.indexOf(selector);
  if (start === -1) throw new Error(`selector not found in index.css: ${selector}`);
  const open = css.indexOf('{', start);
  const close = css.indexOf('}', open);
  // Strip block comments first — they can contain colons (e.g. "palette:") that
  // would otherwise be mis-parsed as declarations.
  const body = css.slice(open + 1, close).replace(/\/\*[\s\S]*?\*\//g, '');
  const out: Record<string, string> = {};
  for (const decl of body.split(';')) {
    const idx = decl.indexOf(':');
    if (idx === -1) continue;
    const name = decl.slice(0, idx).trim();
    const value = decl.slice(idx + 1).trim();
    if (name.startsWith('--')) out[name] = value;
  }
  return out;
}

// Core palette tokens applyWorkTheme() writes as raw hex under default contrast —
// exactly the ones the fallback blocks re-declare verbatim.
const PALETTE_TOKENS = [
  '--background',
  '--foreground',
  '--card',
  '--card-foreground',
  '--popover',
  '--popover-foreground',
  '--primary',
  '--primary-foreground',
  '--secondary',
  '--secondary-foreground',
  '--muted',
  '--muted-foreground',
  '--accent',
  '--accent-foreground',
  '--border',
  '--input',
  '--ring',
  '--destructive',
  '--destructive-foreground',
  '--success',
  '--success-foreground',
  '--warning',
  '--warning-foreground',
  '--info',
  '--info-foreground',
  '--sidebar',
  '--sidebar-foreground',
  '--sidebar-primary',
  '--sidebar-primary-foreground',
  '--sidebar-accent',
  '--sidebar-accent-foreground',
  '--sidebar-border',
  '--sidebar-ring',
] as const;

function runtimeTokens(mode: 'dark' | 'light'): Record<string, string> {
  applyWorkTheme({ ...defaultWorkThemeSettings, mode, contrast: 'default' });
  const style = document.documentElement.style;
  const out: Record<string, string> = {};
  for (const token of PALETTE_TOKENS) out[token] = style.getPropertyValue(token).trim();
  return out;
}

describe('theme token sync: workTheme.ts vs index.css fallback', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('style');
    document.documentElement.className = '';
  });

  afterEach(() => {
    document.documentElement.removeAttribute('style');
    document.documentElement.className = '';
  });

  it('dark palette matches the .dark / [data-work-mode=dark] fallback block', () => {
    const fallback = readBlock(INDEX_CSS, ".dark,\n[data-work-mode='dark']");
    const runtime = runtimeTokens('dark');
    for (const token of PALETTE_TOKENS) {
      expect.soft(fallback[token], `${token} missing/mismatched in dark fallback`).toBe(runtime[token]);
    }
  });

  it('dark palette matches the :root first-paint fallback block', () => {
    const rootBlock = readBlock(INDEX_CSS, ':root {');
    const runtime = runtimeTokens('dark');
    for (const token of PALETTE_TOKENS) {
      expect.soft(rootBlock[token], `${token} missing/mismatched in :root fallback`).toBe(runtime[token]);
    }
  });

  it('light palette matches the [data-work-mode=light] fallback block', () => {
    const fallback = readBlock(INDEX_CSS, "[data-work-mode='light'] {");
    const runtime = runtimeTokens('light');
    for (const token of PALETTE_TOKENS) {
      expect.soft(fallback[token], `${token} missing/mismatched in light fallback`).toBe(runtime[token]);
    }
  });
});
