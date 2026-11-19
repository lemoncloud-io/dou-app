import { existsSync, lstatSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/** Every file under `dir`, as paths relative to it with `/` between parts, sorted. */
export const listFiles = (dir: string, skip: (name: string) => boolean = () => false): string[] => {
    if (!existsSync(dir)) return [];
    const found: string[] = [];
    const walk = (at: string) => {
        for (const name of readdirSync(at).sort()) {
            if (skip(name)) continue;
            const path = join(at, name);
            if (lstatSync(path).isDirectory()) walk(path);
            else found.push(relative(dir, path).split(sep).join('/'));
        }
    };
    walk(dir);
    return found;
};

/**
 * `text` with its comments blanked out — each comment character turned into a space, line breaks kept —
 * so a rule does not fire on a comment that names what it forbids, and line numbers still hold. Strings
 * are kept: a data method's name is a string. A `//` inside a string (a URL) is not a comment.
 */
export const withoutComments = (text: string): string => {
    let out = '';
    let i = 0;
    let quote: string | null = null;
    while (i < text.length) {
        const char = text[i];
        const next = text[i + 1];
        if (quote) {
            out += char;
            if (char === '\\') {
                out += next ?? '';
                i += 2;
                continue;
            }
            if (char === quote) quote = null;
            i += 1;
        } else if (char === '"' || char === "'" || char === '`') {
            quote = char;
            out += char;
            i += 1;
        } else if (char === '/' && next === '/') {
            while (i < text.length && text[i] !== '\n') {
                out += ' ';
                i += 1;
            }
        } else if (char === '/' && next === '*') {
            const end = text.indexOf('*/', i + 2);
            const stop = end === -1 ? text.length : end + 2;
            out += text.slice(i, stop).replace(/[^\n]/g, ' ');
            i = stop;
        } else {
            out += char;
            i += 1;
        }
    }
    return out;
};

/** The 1-based line of `index` in `text`. */
export const lineOf = (text: string, index: number): number => text.slice(0, index).split('\n').length;
