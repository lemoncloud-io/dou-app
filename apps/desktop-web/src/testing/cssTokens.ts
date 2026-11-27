import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { contrast } from '../app/shared/theme/shellPalette';

export type Tokens = Record<string, string>;

const tokensRoot = join(__dirname, '..', '..', '..', '..', 'libs', 'design-system', 'tokens');

const read = (...parts: string[]): string => readFileSync(join(tokensRoot, ...parts), 'utf8');

const sources = [
    read('src', 'light.css'),
    read('desktop', 'src', 'light.css'),
    read('src', 'dark.css'),
    read('desktop', 'src', 'dark.css'),
    readFileSync(join(__dirname, '..', 'styles.css'), 'utf8'),
];

const blockOf = (file: string, selector: string): string => {
    const start = file.indexOf(`${selector} {`);
    if (start < 0) return '';
    const open = file.indexOf('{', start);
    let depth = 0;
    for (let i = open; i < file.length; i++) {
        if (file[i] === '{') depth++;
        if (file[i] === '}' && --depth === 0) return file.slice(open + 1, i);
    }
    return '';
};

export const tokensOf = (selector: string): Tokens => {
    const tokens: Tokens = {};
    for (const file of sources) {
        for (const match of blockOf(file, selector).matchAll(/--([\w-]+):\s*([^;]+);/g)) {
            const [, name, value] = match;
            if (name && value) tokens[name] = value.trim();
        }
    }
    return tokens;
};

export const lightPage = tokensOf(':root');
export const darkPage = { ...lightPage, ...tokensOf('.dark') };

export const resolve = (tokens: Tokens, name: string): string => {
    const value = tokens[name];
    if (!value) throw new Error(`no --${name}`);
    const alias = value.match(/^var\(--([\w-]+)\)$/)?.[1];
    return alias ? resolve(tokens, alias) : value;
};

export const ratio = (tokens: Tokens, fg: string, bg: string): number =>
    contrast(resolve(tokens, fg), resolve(tokens, bg));
