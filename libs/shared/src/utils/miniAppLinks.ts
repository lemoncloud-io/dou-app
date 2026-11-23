import { subWebViewTrustOf } from './subWebViewTrust';

export interface MiniAppLink {
    id: string;
    name: string;
    url: string;
}

export const MINI_APP_LINK_LIMIT = 10;

export const MINI_APP_LINK_NAME_MAX = 30;

export type MiniAppUrlProblem = 'invalidUrl' | 'hubUrl';

export type MiniAppLinkProblem = 'nameMissing' | 'nameTooLong' | MiniAppUrlProblem;

export const checkMiniAppUrl = (url: string): MiniAppUrlProblem | null => {
    const trust = subWebViewTrustOf(url.trim());
    if (!trust) return 'invalidUrl';
    if (trust === 'firstParty') return 'hubUrl';
    return null;
};

export const checkMiniAppLink = (name: string, url: string): MiniAppLinkProblem | null => {
    const trimmed = name.trim();
    if (!trimmed) return 'nameMissing';
    if (Array.from(trimmed).length > MINI_APP_LINK_NAME_MAX) return 'nameTooLong';
    return checkMiniAppUrl(url);
};

const isLinkShape = (value: unknown): value is MiniAppLink => {
    if (!value || typeof value !== 'object') return false;
    const { id, name, url } = value as Record<string, unknown>;
    return typeof id === 'string' && id !== '' && typeof name === 'string' && typeof url === 'string';
};

export const parseMiniAppLinks = (stored: string | null): MiniAppLink[] => {
    if (!stored) return [];
    let value: unknown;
    try {
        value = JSON.parse(stored);
    } catch {
        return [];
    }
    if (!Array.isArray(value)) return [];
    const seen = new Set<string>();
    const links: MiniAppLink[] = [];
    for (const entry of value) {
        if (!isLinkShape(entry) || seen.has(entry.id) || checkMiniAppLink(entry.name, entry.url)) continue;
        seen.add(entry.id);
        links.push({ id: entry.id, name: entry.name.trim(), url: entry.url.trim() });
        if (links.length === MINI_APP_LINK_LIMIT) break;
    }
    return links;
};
