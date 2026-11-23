import { isTrustedUrl } from './webUrl';

const ALWAYS_GRANTED = new Set(['notifications', 'clipboard-sanitized-write']);

export const grantsPermission = (permission: string, requestingUrl: string | undefined): boolean =>
    ALWAYS_GRANTED.has(permission) || (permission === 'fullscreen' && isTrustedUrl(requestingUrl));
