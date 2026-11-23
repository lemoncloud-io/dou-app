import { hostProfile } from '@chatic/bridges';
import type { MediaMethod } from '@chatic/runtime-client';

import { resolveShellOrBrowser, type DeclaredHost } from './shellOrBrowser';

export const MEDIA_INTRODUCED_IN = 2;

export const resolveMediaMethod = (profile: DeclaredHost = hostProfile()): MediaMethod =>
    resolveShellOrBrowser(profile, 'media', MEDIA_INTRODUCED_IN);
