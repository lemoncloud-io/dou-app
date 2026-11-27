import { webClient } from '@chatic/bridges';
import { browserAppShell } from '@chatic/host-web-browser';
import { mobileShellAppShell } from '@chatic/host-web-mobile-shell';
import { appShellAdapters } from '@chatic/runtime-hybrid-web';
import type { ShellOrBrowserImplementations } from '@chatic/runtime-hybrid-web';

export const webAppShell: ShellOrBrowserImplementations<'appShell'> = {
    shell: mobileShellAppShell(webClient),
    browser: browserAppShell,
};

export const { host: appShellHost, shell: appShellShell, browser: appShellBrowser } = appShellAdapters(webAppShell);
