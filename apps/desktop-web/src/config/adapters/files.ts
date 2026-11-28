import { browserFiles } from '@chatic/host-web-browser';
import { filesAdapters } from '@chatic/runtime-hybrid-web';
import type { ShellOrBrowserImplementations } from '@chatic/runtime-hybrid-web';

import { pageUploadPut } from '../upload';

export const desktopFiles: ShellOrBrowserImplementations<'files'> = {
    shell: browserFiles(pageUploadPut),
    browser: browserFiles(pageUploadPut),
};

export const { host: filesHost, shell: filesShell, browser: filesBrowser } = filesAdapters(desktopFiles);
