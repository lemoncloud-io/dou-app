import { webClient } from '@chatic/bridges';
import { browserMedia } from '@chatic/host-web-browser';
import { mobileShellMedia } from '@chatic/host-web-mobile-shell';
import { mediaAdapters } from '@chatic/runtime-hybrid-web';
import type { ShellOrBrowserImplementations } from '@chatic/runtime-hybrid-web';

export const webMedia: ShellOrBrowserImplementations<'media'> = {
    shell: mobileShellMedia(webClient),
    browser: browserMedia,
};

export const { host: mediaHost, shell: mediaShell, browser: mediaBrowser } = mediaAdapters(webMedia);
