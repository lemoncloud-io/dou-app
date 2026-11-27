import { webClient } from '@chatic/bridges';
import { browserPush } from '@chatic/host-web-browser';
import { desktopShellPush } from '@chatic/host-web-desktop-shell';
import { pushAdapters } from '@chatic/runtime-hybrid-web';
import type { ShellOrBrowserImplementations } from '@chatic/runtime-hybrid-web';

export const desktopPush: ShellOrBrowserImplementations<'push'> = {
    shell: desktopShellPush(webClient),
    browser: browserPush,
};

export const { host: pushHost, shell: pushShell, browser: pushBrowser } = pushAdapters(desktopPush);
