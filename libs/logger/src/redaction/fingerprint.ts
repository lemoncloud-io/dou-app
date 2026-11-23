import { sha256, toHex, utf8Bytes } from './sha256';

const FINGERPRINT_LENGTH = 6;

export interface RedactOptions {
    strict?: boolean;
}

export const isDetailed = (options?: RedactOptions): boolean => !options?.strict;

const fingerprintOf = (value: string): string => toHex(sha256(utf8Bytes(value))).slice(0, FINGERPRINT_LENGTH);

export type TokenPlaceholderKind = 'JWT' | 'TOKEN';

export const MIN_FINGERPRINTED_TOKEN_LENGTH = 16;

export const tokenPlaceholder = (kind: TokenPlaceholderKind, value: string, detailed: boolean): string =>
    detailed && value.length >= MIN_FINGERPRINTED_TOKEN_LENGTH ? `[${kind}#${fingerprintOf(value)}]` : `[${kind}]`;

export const phonePlaceholder = (value: string, detailed: boolean): string =>
    detailed ? `[PHONE:…${value.replace(/\D/g, '').slice(-4)}]` : '[PHONE]';

export const COMMON_MAIL_DOMAINS: ReadonlySet<string> = new Set([
    'gmail.com',
    'googlemail.com',
    'naver.com',
    'kakao.com',
    'daum.net',
    'hanmail.net',
    'nate.com',
    'outlook.com',
    'hotmail.com',
    'live.com',
    'icloud.com',
    'me.com',
    'yahoo.com',
    'yahoo.co.kr',
]);

export const emailPlaceholder = (value: string, detailed: boolean): string => {
    const domain = value.slice(value.lastIndexOf('@') + 1).toLowerCase();
    return detailed && COMMON_MAIL_DOMAINS.has(domain) ? `[EMAIL:@${domain}]` : '[EMAIL]';
};

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const MAIL_DOMAINS = [...COMMON_MAIL_DOMAINS].map(escapeRegExp).join('|');

const DETAIL = `(?:(JWT|TOKEN)#[0-9a-f]{6}|(PHONE):…\\d{4}|(EMAIL):@(?:${MAIL_DOMAINS}))`;

const DETAILED_PLACEHOLDER = new RegExp(`\\[${DETAIL}\\]`, 'g');

const kindOf = (...groups: (string | undefined)[]): string => groups.find(Boolean) ?? '';

const PLACEHOLDER_VALUE = new RegExp(`^\\[(?:(REDACTED)|(JWT|TOKEN|PHONE|EMAIL)|${DETAIL})\\]$`);

export const placeholderKindOf = (value: unknown): string | undefined => {
    if (typeof value !== 'string') return undefined;
    const match = PLACEHOLDER_VALUE.exec(value);
    return match ? kindOf(...match.slice(1)) : undefined;
};

export const foldDetailedPlaceholders = (text: string): string =>
    text.includes('[')
        ? text.replace(
              DETAILED_PLACEHOLDER,
              (_match, ...groups: (string | undefined)[]) => `[${kindOf(...groups.slice(0, 3))}]`
          )
        : text;

const CUT_DETAILED_PLACEHOLDER = /\[(?:JWT|TOKEN|PHONE|EMAIL)[#:][^\]\s]*$/;

export const withoutCutPlaceholder = (text: string): string => text.replace(CUT_DETAILED_PLACEHOLDER, '');

const SHELF_MARK = '\uE000';
const SHELVED = new RegExp(`${SHELF_MARK}(\\d+)${SHELF_MARK}`, 'g');

export const shelveDetailedPlaceholders = (text: string): { text: string; shelved: string[] } => {
    const shelved: string[] = [];
    if (!text.includes('[') || text.includes(SHELF_MARK)) return { text, shelved };
    const replaced = text.replace(DETAILED_PLACEHOLDER, placeholder => {
        shelved.push(placeholder);
        return `${SHELF_MARK}${shelved.length - 1}${SHELF_MARK}`;
    });
    return { text: replaced, shelved };
};

export const isShelfMark = (value: string): boolean => new RegExp(`^${SHELF_MARK}\\d+${SHELF_MARK}$`).test(value);

export const restoreShelved = (text: string, shelved: readonly string[]): string =>
    shelved.length ? text.replace(SHELVED, (mark, index: string) => shelved[Number(index)] ?? mark) : text;
