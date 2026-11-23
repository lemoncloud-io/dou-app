import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { contrast } from '../app/shared/theme/shellPalette';

export type Tokens = Record<string, string>;

const css = readFileSync(join(__dirname, '..', 'styles.css'), 'utf8');

export const tokensOf = (selector: string): Tokens => {
    const start = css.indexOf(`${selector} {`);
    if (start < 0) return {};
    const body = css.slice(start, css.indexOf('\n    }', start));
    const tokens: Tokens = {};
    for (const match of body.matchAll(/--([\w-]+):\s*([^;]+);/g)) {
        const [, name, value] = match;
        if (name && value) tokens[name] = value.trim();
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
