import type { Page } from '@playwright/test';

import type { FakeShell, ShellPlatform } from './fake-shell/fakeShell';

/**
 * Small steps several scenarios share. Each is something a person or the shell does, not a way into
 * the app's internals — the one exception, `historyIndex`, reads what the router itself wrote.
 */

/**
 * Where the page stands in its own history: the index react-router writes into each entry, which is
 * what the app's back handling reads too (`navigation/stackDepth`). 0 is the app's first screen, with
 * nothing of the app's behind it.
 */
export const historyIndex = (page: Page): Promise<number | null> =>
    page.evaluate(() => (window.history.state as { idx?: number } | null)?.idx ?? null);

/** The path and query the page is on — what a back press or a tap is judged by. */
export const currentPath = (page: Page): Promise<string> =>
    page.evaluate(() => `${window.location.pathname}${window.location.search}`);

/**
 * The Android back button: the shell forwards it to the page as `OnBackPressed` (`useAndroidBack`).
 * The real shell forwards it only while the WebView can go back or the page has asked for the press
 * (`SetCanGoBack`); this sends it regardless, so a scenario can also check what the page does with a
 * press it should not spend. Only the Android shell sends it at all.
 */
export const pressBack = (shell: FakeShell): void => shell.push('OnBackPressed', {});

/**
 * Back, the way each platform's shell does it: Android forwards its back button to the page, and on
 * iOS the WebView's own back swipe (`allowsBackForwardNavigationGestures`) walks its history without
 * asking the page. For a scenario about where back lands rather than how the press is handled.
 */
export const goBack = async (page: Page, shell: FakeShell, platform: ShellPlatform): Promise<void> => {
    if (platform === 'android') pressBack(shell);
    else await page.goBack();
};

/** The room's message box — the room is open and usable. */
export const composer = (page: Page) => page.getByPlaceholder('Enter a message');

/** The app going to the background and coming back, as the shell reports each (`useAppStateHandler`). */
export const sendToBackground = (shell: FakeShell): void =>
    shell.push('OnBackgroundStatusChanged', { status: 'background', isBackground: true, isForeground: false });

export const bringToForeground = (shell: FakeShell): void =>
    shell.push('OnBackgroundStatusChanged', { status: 'active', isBackground: false, isForeground: true });

/** The MY tab in the bottom bar. (The Chat tab's name turns into its unread count, so it is not one to find.) */
export const myTab = (page: Page) => page.getByRole('navigation').getByRole('button', { name: 'MY' });

/** Home, drawn: its room list is there. */
export const home = (page: Page) => page.getByText(/^Chat Rooms\b/);
