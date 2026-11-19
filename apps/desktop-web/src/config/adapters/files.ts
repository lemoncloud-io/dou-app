import { filesAdapters } from '@chatic/runtime-web';
import type { FilesPort, ShellOrBrowserBase, ShellOrBrowserImplementations } from '@chatic/runtime-web';

import { pageUploadPut } from '../upload';

/** The page moves the files: its own PUT, and no app transfer module. */
const pageFiles = (base: ShellOrBrowserBase<'files'>): FilesPort => ({ ...base, put: pageUploadPut, transfers: null });

/**
 * Who moves a message's files in desktop-web: the shell or the page. The desktop app takes no transfer
 * from the page, so both sides are the page's own. The declaration pins `files.browser`; the shell side
 * is here because every port names one.
 */
export const desktopFiles: ShellOrBrowserImplementations<'files'> = {
    shell: pageFiles,
    browser: pageFiles,
};

/** `files.host` follows what the host declared; `.shell` and `.browser` force a side the host allows. */
export const { host: filesHost, shell: filesShell, browser: filesBrowser } = filesAdapters(desktopFiles);
