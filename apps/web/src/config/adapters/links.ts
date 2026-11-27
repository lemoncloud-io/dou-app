import { webClient } from '@chatic/bridges';
import { browserLinks } from '@chatic/host-web-browser';
import { mobileShellLinks } from '@chatic/host-web-mobile-shell';
import { linksAdapters } from '@chatic/runtime-hybrid-web';
import type { ShellOrBrowserImplementations } from '@chatic/runtime-hybrid-web';

import { shellCapabilities } from '../../app/bridge/shellCapabilities';

export const webLinks: ShellOrBrowserImplementations<'links'> = {
    shell: mobileShellLinks({
        bridge: webClient,
        subWebViewOpenScope: () => shellCapabilities.subWebViewOpenScope(),
    }),
    browser: browserLinks,
};

export const { host: linksHost, shell: linksShell, browser: linksBrowser } = linksAdapters(webLinks);
