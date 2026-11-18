import { hostProfile, type HostProfile } from '@chatic/bridges';
import type { MediaMethod } from '@chatic/runtime-client';

import { resolveShellOrBrowser } from './shellOrBrowser';

/** The declaration version that introduced `media`. */
export const MEDIA_INTRODUCED_IN = 2;

/**
 * Who picks on this host. A declaration names `'shell'` or `'browser'`; anything else is a bug in the shell,
 * answered with the page's own input — the one picker every host has — and logged. A declaration older
 * than version 2 never knew the key, so the legacy rule answers for it.
 */
export const resolveMediaMethod = (profile: HostProfile = hostProfile()): MediaMethod =>
    resolveShellOrBrowser(profile, 'media', MEDIA_INTRODUCED_IN);
