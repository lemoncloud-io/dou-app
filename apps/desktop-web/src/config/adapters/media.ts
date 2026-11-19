import { mediaAdapters } from '@chatic/runtime-web';
import type { MediaPort, ShellOrBrowserImplementations } from '@chatic/runtime-web';

/**
 * What neither side of desktop-web has: the picker, the photo library, the video conversion and the
 * camera prompt are the phone app's. The desktop app keeps nothing a person picks; the page picks with
 * its own file input and sends what it holds.
 */
const noAppMedia = { picker: null, photoLibrary: null, videoConverter: null, cameraPermission: null } as const;

/**
 * Who picks the photos, videos and documents a person attaches in desktop-web: the shell or the page. Its
 * shell is the desktop app, which leaves the picking to the page, so both sides pick the page's way.
 */
export const desktopMedia: ShellOrBrowserImplementations<'media'> = {
    shell: (base): MediaPort => ({ ...base, ...noAppMedia }),
    browser: (base): MediaPort => ({ ...base, ...noAppMedia }),
};

/** `media.host` follows what the host declared; `.shell` and `.browser` force a side the host allows. */
export const { host: mediaHost, shell: mediaShell, browser: mediaBrowser } = mediaAdapters(desktopMedia);
