import { LABELLED_LINK_SOURCE } from './linkMatch';

const CODE_OR_LINK = new RegExp('`[^`\\n]+`|' + LABELLED_LINK_SOURCE, 'g');

/**
 * Flatten message markdown to plain text for single-line surfaces (sidebar
 * preview, OS notification body) — markers there read as noise. Inverse-ish of
 * what RichText renders: fences first (their content stays literal), then
 * labelled links (to their words), inline marks, then quote prefixes. Mentions and bare
 * addresses stay as-is.
 */
export const stripMarkdown = (content: string): string =>
    content
        .replace(/```[\s\S]*?```/g, m => m.slice(3, -3).trim())
        // Outside code spans only: a labelled link inside code is code to the reader too.
        .replace(CODE_OR_LINK, (match, label?: string) => label ?? match)
        .replace(/`([^`\n]+)`/g, '$1')
        .replace(/\*\*([^*\n]+)\*\*/g, '$1')
        .replace(/\*([^*\n]+)\*/g, '$1')
        .replace(/~~([^~\n]+)~~/g, '$1')
        // A quote marker is `>` with a space or nothing after it, as RichText reads it — `>_<` is not one.
        .replace(/^>(?:[^\S\n]|$)/gm, '');
