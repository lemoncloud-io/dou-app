import { filesAdapters } from '@chatic/runtime-hybrid-web';
import type { FilesPort, ShellOrBrowserBase, ShellOrBrowserImplementations } from '@chatic/runtime-hybrid-web';

import { pageUploadPut } from '../upload';

const pageFiles = (base: ShellOrBrowserBase<'files'>): FilesPort => ({ ...base, put: pageUploadPut, transfers: null });

export const desktopFiles: ShellOrBrowserImplementations<'files'> = {
    shell: pageFiles,
    browser: pageFiles,
};

export const { host: filesHost, shell: filesShell, browser: filesBrowser } = filesAdapters(desktopFiles);
