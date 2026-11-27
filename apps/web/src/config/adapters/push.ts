import { webClient } from '@chatic/bridges';
import { browserPush } from '@chatic/host-web-browser';
import { mobileShellPush } from '@chatic/host-web-mobile-shell';
import { pushAdapters } from '@chatic/runtime-hybrid-web';
import type { ShellOrBrowserImplementations } from '@chatic/runtime-hybrid-web';

export const webPush: ShellOrBrowserImplementations<'push'> = {
    shell: mobileShellPush(webClient),
    browser: browserPush,
};

export const { host: pushHost, shell: pushShell, browser: pushBrowser } = pushAdapters(webPush);
