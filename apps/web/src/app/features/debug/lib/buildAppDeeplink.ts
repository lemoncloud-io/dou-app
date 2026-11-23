import { runtime } from '@chatic/runtime';

export const buildAppDeeplink = (input: string): string => {
    const trimmed = input.trim();
    if (!trimmed) return '';
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return trimmed;

    const scheme = runtime.settings.get<string>('net.deeplink.scheme') ?? 'chatic';
    return `${scheme}://${trimmed.replace(/^\/+/, '')}`;
};
