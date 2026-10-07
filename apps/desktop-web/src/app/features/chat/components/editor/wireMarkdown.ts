import { $convertFromMarkdownString, $convertToMarkdownString } from '@lexical/markdown';
import { $dfs } from '@lexical/utils';
import { $isTextNode } from 'lexical';

import { COMPOSER_TRANSFORMERS } from './editorConfig';

/**
 * The only place a message's wire string and the editor's document are converted. The wire is
 * RichText's dialect and RichText has no escape syntax: a backslash is a backslash, `snake_case`
 * has no marks to protect. Lexical's markdown functions disagree on both sides —
 *
 * - export puts a `\` before every `*`, `_`, `` ` `` and `~` in text that is not code
 *   (`exportTextFormat` in `@lexical/markdown`), which the reader would see as typed;
 * - import drops a `\` before any ASCII punctuation and turns `&#NN;` into that character
 *   (`unescapeText`), and it does so again on every nested format run, so `\\server\share`
 *   inside `**bold**` lost two slashes, not one.
 *
 * Each side cancels its half so that `export(import(wire)) === wire`; `wireMarkdown.spec.ts` is the
 * table, and it goes red if a Lexical upgrade changes either behavior. Export never writes `&#NN;`
 * (spaces around a formatted run are kept as spaces), so only the import side needs a guard for it.
 */

const FENCE = /^[ \t]*```/;

/** Applies `fn` to each line outside the fenced blocks the editor exports (always multi-line). */
const mapOutsideFences = (text: string, fn: (line: string) => string): string => {
    let inFence = false;
    return text
        .split('\n')
        .map(line => {
            if (FENCE.test(line)) {
                inFence = !inFence;
                return line;
            }
            return inFence ? line : fn(line);
        })
        .join('\n');
};

const ESCAPED_BY_EXPORT = '*_`~';

/**
 * Removes the backslash Lexical put before a markup character, leaving inline code spans alone
 * (code is exported raw, so a backslash there is the author's). Limit: a text-ending `\` directly
 * followed by an inline code span reads as an escaped backtick, so that one backslash is dropped.
 */
const stripExportEscapes = (line: string): string => {
    let out = '';
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const next = line[i + 1];
        if (char === '\\' && next !== undefined && ESCAPED_BY_EXPORT.includes(next)) {
            out += next;
            i++;
        } else if (char === '`') {
            const close = line.indexOf('`', i + 1);
            const end = close === -1 ? line.length : close + 1;
            out += line.slice(i, end);
            i = end - 1;
        } else {
            out += char;
        }
    }
    return out;
};

// Private-use characters that stand in for `\` and for the `&` of `&#` while the library parses.
// Doubling the backslash is not enough (it is unescaped again inside every nested run), and a
// stand-in is not punctuation, so the library leaves it alone at any depth.
const PLACEHOLDER_CANDIDATES = Array.from({ length: 16 }, (_, i) => String.fromCharCode(0xe000 + i));

/** Fills the editor from a message's wire string. Call inside `editor.update`. */
export const $importWireMarkdown = (wire: string): void => {
    const [backslash, ampersand] = PLACEHOLDER_CANDIDATES.filter(char => !wire.includes(char));
    if (backslash === undefined || ampersand === undefined) {
        throw new Error('wire string uses every placeholder character');
    }
    const guarded = wire.replace(/\\/g, backslash).replace(/&#/g, `${ampersand}#`);
    $convertFromMarkdownString(guarded, COMPOSER_TRANSFORMERS, undefined, true);
    for (const node of $dfs()) {
        if (!$isTextNode(node.node)) continue;
        const text = node.node.getTextContent();
        if (text.includes(backslash) || text.includes(ampersand)) {
            node.node.setTextContent(text.split(backslash).join('\\').split(ampersand).join('&'));
        }
    }
};

/** The editor's document as a wire string. Call inside `editor.read` or `editor.update`. */
export const $exportWireMarkdown = (): string =>
    mapOutsideFences($convertToMarkdownString(COMPOSER_TRANSFORMERS, undefined, true), stripExportEscapes);
