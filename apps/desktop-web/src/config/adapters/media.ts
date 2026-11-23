import { mediaAdapters } from '@chatic/runtime-web';
import type { MediaPort, ShellOrBrowserImplementations } from '@chatic/runtime-web';

const noAppMedia = { picker: null, photoLibrary: null, videoConverter: null, cameraPermission: null } as const;

export const desktopMedia: ShellOrBrowserImplementations<'media'> = {
    shell: (base): MediaPort => ({ ...base, ...noAppMedia }),
    browser: (base): MediaPort => ({ ...base, ...noAppMedia }),
};

export const { host: mediaHost, shell: mediaShell, browser: mediaBrowser } = mediaAdapters(desktopMedia);
