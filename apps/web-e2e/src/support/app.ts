import type { Page } from '@playwright/test';

import type { FakeShell, ShellPlatform } from './fake-shell/fakeShell';

export const historyIndex = (page: Page): Promise<number | null> =>
    page.evaluate(() => (window.history.state as { idx?: number } | null)?.idx ?? null);

export const currentPath = (page: Page): Promise<string> =>
    page.evaluate(() => `${window.location.pathname}${window.location.search}`);

export const pressBack = (shell: FakeShell): void => shell.push('OnBackPressed', {});

export const goBack = async (page: Page, shell: FakeShell, platform: ShellPlatform): Promise<void> => {
    if (platform === 'android') pressBack(shell);
    else await page.goBack();
};

export const composer = (page: Page) => page.getByPlaceholder('Enter a message');

export const sendToBackground = (shell: FakeShell): void =>
    shell.push('OnBackgroundStatusChanged', { status: 'background', isBackground: true, isForeground: false });

export const bringToForeground = (shell: FakeShell): void =>
    shell.push('OnBackgroundStatusChanged', { status: 'active', isBackground: false, isForeground: true });

export const myTab = (page: Page) => page.getByRole('navigation').getByRole('button', { name: 'MY' });

export const roomRow = (page: Page, title: string) =>
    page.getByRole('button', { name: new RegExp(`^(MY )?${title}(\\s|$)`) });

export const home = (page: Page) => page.getByRole('tab', { name: /^(All|Chats)\b/ });
