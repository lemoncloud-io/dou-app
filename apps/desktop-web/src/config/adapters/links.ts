import { webClient } from '@chatic/bridges';
import { browserLinks } from '@chatic/host-web-browser';
import { desktopShellLinks } from '@chatic/host-web-desktop-shell';
import { linksAdapters } from '@chatic/runtime-hybrid-web';
import type { ShellOrBrowserImplementations } from '@chatic/runtime-hybrid-web';

export const desktopLinks: ShellOrBrowserImplementations<'links'> = {
    shell: desktopShellLinks(webClient),
    browser: browserLinks,
};

export const { host: linksHost, shell: linksShell, browser: linksBrowser } = linksAdapters(desktopLinks);
