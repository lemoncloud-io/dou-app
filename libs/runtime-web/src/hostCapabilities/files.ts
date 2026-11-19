import { hostProfile } from '@chatic/bridges';
import type { FilesMethod } from '@chatic/runtime-client';

import { resolveShellOrBrowser, type DeclaredHost } from './shellOrBrowser';

/**
 * The declaration version that introduced `files`. Version 2 shipped with `media` alone, so a build
 * declaring version 2 never knew this key and the legacy rule answers for it.
 */
export const FILES_INTRODUCED_IN = 3;

/**
 * Who moves files on this host. A declaration names `'shell'` or `'browser'`; anything else is a bug in the
 * shell, answered with the page's own requests — the ones every host can make — and logged. A
 * declaration older than version 3 never knew the key, so the legacy rule answers for it.
 */
export const resolveFilesMethod = (profile: DeclaredHost = hostProfile()): FilesMethod =>
    resolveShellOrBrowser(profile, 'files', FILES_INTRODUCED_IN);
