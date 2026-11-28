import { webClient } from '@chatic/bridges';
import { browserAppShell } from '@chatic/host-web-browser';
import { desktopShellAppShell } from '@chatic/host-web-desktop-shell';
import { appShellAdapters } from '@chatic/runtime-hybrid-web';
import type { ShellOrBrowserImplementations } from '@chatic/runtime-hybrid-web';

export const desktopAppShell: ShellOrBrowserImplementations<'appShell'> = {
    shell: desktopShellAppShell(webClient),
    browser: browserAppShell,
};

export const { host: appShellHost, shell: appShellShell, browser: appShellBrowser } = appShellAdapters(desktopAppShell);
