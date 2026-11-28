import { desktopMedia as desktopPageMedia } from '@chatic/host-web-desktop-shell';
import { mediaAdapters } from '@chatic/runtime-hybrid-web';
import type { ShellOrBrowserImplementations } from '@chatic/runtime-hybrid-web';

export const desktopMedia: ShellOrBrowserImplementations<'media'> = {
    shell: desktopPageMedia,
    browser: desktopPageMedia,
};

export const { host: mediaHost, shell: mediaShell, browser: mediaBrowser } = mediaAdapters(desktopMedia);
