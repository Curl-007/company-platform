import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { NAV_GROUPS, NAV_ITEMS } from '../app/pageRegistry';
import i18n, { ensureLocaleLoaded } from '../i18n';
import { LanguageProvider } from '../i18n/LanguageProvider';
import zhCN from '../i18n/locales/zh-CN.json';
import enUS from '../i18n/locales/en-US.json';
import { renderWithQueryClient, flushAct } from '../test/renderWithQuery';
import type { SessionUser } from '../types';
import AppSidebar from './AppSidebar';
import { SidebarProvider } from './ui/Sidebar';

const admin: SessionUser = {
  id: 'USR-ADMIN',
  name: 'Admin',
  email: 'admin@example.com',
  role: 'admin',
  capabilities: {
    role: 'admin',
    pages: NAV_ITEMS.map((item) => item.key),
    operations: [],
    permissions: ['*'],
  },
};

function navLabels(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll<HTMLButtonElement>('[data-page]'))
    .map((button) => button.textContent?.trim() ?? '');
}

function groupLabels(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll<HTMLElement>('.kaneo-sidebar-group-toggle span'))
    .map((label) => label.textContent?.trim() ?? '');
}

function labels(record: object): Record<string, string> {
  return record as Record<string, string>;
}

afterEach(async () => {
  await i18n.changeLanguage('zh-CN');
  document.documentElement.lang = 'zh-CN';
});

describe('AppSidebar navigation translations', () => {
  it('keeps every registered group and item complete in both locale files', () => {
    const expectedGroupIds = NAV_GROUPS.map((group) => group.id).sort();
    const expectedItemKeys = NAV_ITEMS.map((item) => item.key).sort();

    for (const locale of [zhCN, enUS]) {
      expect(Object.keys(locale.nav.group).sort()).toEqual(expectedGroupIds);
      expect(Object.keys(locale.nav.item).sort()).toEqual(expectedItemKeys);
      for (const value of Object.values(locale.nav.group)) expect(value.trim()).not.toBe('');
      for (const value of Object.values(locale.nav.item)) expect(value.trim()).not.toBe('');
    }
  });

  it('switches every visible group and function entry from Chinese to English', async () => {
    await ensureLocaleLoaded('en-US');
    await i18n.changeLanguage('zh-CN');

    const { container, unmount } = renderWithQueryClient(
      <LanguageProvider>
        <SidebarProvider defaultOpen>
          <AppSidebar currentPage="dashboard" user={admin} onNavigate={() => undefined} />
        </SidebarProvider>
      </LanguageProvider>,
    );

    expect(groupLabels(container)).toEqual(NAV_GROUPS.map((group) => labels(zhCN.nav.group)[group.id]));
    expect(navLabels(container)).toEqual(NAV_ITEMS.map((item) => labels(zhCN.nav.item)[item.key]));

    const englishButton = Array.from(container.querySelectorAll<HTMLButtonElement>('.kaneo-sidebar-lang-btn'))
      .find((button) => button.textContent?.trim() === 'EN');
    expect(englishButton).toBeDefined();
    await act(async () => { englishButton?.click(); });
    await flushAct();

    expect(document.documentElement.lang).toBe('en-US');
    expect(groupLabels(container)).toEqual(NAV_GROUPS.map((group) => labels(enUS.nav.group)[group.id]));
    expect(navLabels(container)).toEqual(NAV_ITEMS.map((item) => labels(enUS.nav.item)[item.key]));

    unmount();
  });
});
