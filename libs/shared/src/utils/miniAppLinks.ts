import { isOpenableSubWebViewUrl } from './subWebViewTrust';

/** One mini app a cloud's owner added: the name the settings list shows, and the page it opens. */
export interface MiniAppLink {
    id: string;
    name: string;
    url: string;
}

/** How many mini apps one cloud keeps. Enough for a short list a member can scan, and no more. */
export const MINI_APP_LINK_LIMIT = 10;

/** The longest a mini app's name may be, in characters: one settings row, without wrapping. */
export const MINI_APP_LINK_NAME_MAX = 30;

export type MiniAppLinkProblem = 'nameMissing' | 'nameTooLong' | 'invalidUrl';

/**
 * What is wrong with a mini app an owner is about to save, or `null` when nothing is. The name is
 * counted on code points, so an emoji counts once. The address is checked by the rule the shells
 * open by, so a saved link is never one a shell would refuse.
 */
export const checkMiniAppLink = (name: string, url: string): MiniAppLinkProblem | null => {
    const trimmed = name.trim();
    if (!trimmed) return 'nameMissing';
    if (Array.from(trimmed).length > MINI_APP_LINK_NAME_MAX) return 'nameTooLong';
    if (!isOpenableSubWebViewUrl(url.trim())) return 'invalidUrl';
    return null;
};

const isLinkShape = (value: unknown): value is MiniAppLink => {
    if (!value || typeof value !== 'object') return false;
    const { id, name, url } = value as Record<string, unknown>;
    return typeof id === 'string' && id !== '' && typeof name === 'string' && typeof url === 'string';
};

/**
 * A cloud's mini apps out of what was stored for it. Anything that is not a list of valid links reads
 * as no links, and an entry that would no longer pass `checkMiniAppLink` (or repeats an id) is dropped
 * rather than shown, so a stored value written by an older rule can never open what the shell refuses.
 */
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
