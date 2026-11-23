import type { KnownBlock } from './blockKit';

export const isWebUrl = (url?: unknown): url is string => {
    if (typeof url !== 'string' || !url.trim()) return false;
    try {
        const { protocol } = new URL(url.trim());
        return protocol === 'http:' || protocol === 'https:';
    } catch {
        return false;
    }
};

const SERVER_SOURCE_LINK = /^<([^<>|]+)\|원문 보기>$/;

export interface SourceLinkInput {
    url?: unknown;
}

interface SourceLink {
    blocks: KnownBlock[];
    sourceUrl?: string;
}

export const takeSourceLink = (blocks: KnownBlock[], source?: SourceLinkInput | null): SourceLink => {
    const field = isWebUrl(source?.url) ? source.url.trim() : undefined;

    const at = blocks.map(block => block.type).lastIndexOf('context');
    const context = blocks[at];
    const last = context?.type === 'context' ? context.elements[context.elements.length - 1] : undefined;
    const match = last?.type === 'mrkdwn' ? SERVER_SOURCE_LINK.exec(last.text.trim()) : null;
    const lineUrl = match && isWebUrl(match[1]) ? match[1].trim() : undefined;

    const sourceUrl = field ?? lineUrl;
    if (!sourceUrl) return { blocks };
    if (!match || context?.type !== 'context') return { blocks, sourceUrl };

    const elements = context.elements.slice(0, -1);
    const rest = elements.length ? [{ ...context, elements }] : [];
    return { blocks: [...blocks.slice(0, at), ...rest, ...blocks.slice(at + 1)], sourceUrl };
};
