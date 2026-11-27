import { hostProfile } from '@chatic/bridges';
import type { FilesMethod } from '@chatic/runtime-client';

import { resolveShellOrBrowser, type DeclaredHost } from './shellOrBrowser';

export const FILES_INTRODUCED_IN = 3;

export const resolveFilesMethod = (profile: DeclaredHost = hostProfile()): FilesMethod =>
    resolveShellOrBrowser(profile, 'files', FILES_INTRODUCED_IN);
