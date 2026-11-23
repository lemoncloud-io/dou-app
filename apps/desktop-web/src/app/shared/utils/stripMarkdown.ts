import { LABELLED_LINK_SOURCE } from './linkMatch';
import { BOLD_SOURCE, ITALIC_SOURCE } from './markMatch';

const CODE_OR_LINK = new RegExp('`[^`\\n]+`|' + LABELLED_LINK_SOURCE, 'g');
const BOLD = new RegExp(BOLD_SOURCE, 'g');
const ITALIC = new RegExp(ITALIC_SOURCE, 'g');

export const stripMarkdown = (content: string): string =>
    content
        .replace(/```[\s\S]*?```/g, m => m.slice(3, -3).trim())
        .replace(CODE_OR_LINK, (match, label?: string) => label ?? match)
        .replace(/`([^`\n]+)`/g, '$1')
        .replace(BOLD, '$1')
        .replace(ITALIC, '$1')
        .replace(/~~([^~\n]+)~~/g, '$1')
        .replace(/^>(?:[^\S\n]|$)/gm, '');
