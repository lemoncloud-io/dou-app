import { en, ko } from './locales';

import type { TranslationTree } from './types';

const translations: Record<string, TranslationTree> = { en, ko };

const BODY_FALLBACK_KEY = 'push_chat_fallback_body';

const PLACEHOLDER = /\{(\d+)\}/g;

export type PushCopyField = 'title' | 'body';

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

const resolveKey = (locale: TranslationTree, key: string): string | undefined => {
    let value: unknown = locale;
    for (const k of key.split('.')) {
        if (!isRecord(value)) return undefined;
        value = value[k];
    }
    return typeof value === 'string' ? value : undefined;
};

const normalizeArgs = (raw: unknown): string[] => {
    let value = raw;
    if (typeof value === 'string' && value !== '') {
        try {
            value = JSON.parse(value);
        } catch {
            return [];
        }
    }
    return Array.isArray(value) ? value.map(arg => String(arg)) : [];
};

export const formatPushCopy = (
    locKey: string | undefined,
    locArgs: unknown,
    lang: string,
    field: PushCopyField = 'body'
): string => {
    if (!locKey) return '';
    const locale = translations[lang] ?? translations.en;
    const template = resolveKey(locale, locKey);
    if (template === undefined) return locKey;

    const args = normalizeArgs(locArgs);
    const isHole = (index: string): boolean => Number(index) >= args.length;
    const unfilled = [...template.matchAll(PLACEHOLDER)].some(match => isHole(match[1]));

    if (unfilled && field === 'body') {
        const fallback = resolveKey(locale, BODY_FALLBACK_KEY);
        if (fallback !== undefined) return fallback;
    }

    let result = unfilled ? template.replace(PLACEHOLDER, (match, index) => (isHole(index) ? '' : match)) : template;
    args.forEach((arg, index) => {
        result = result.split(`{${index}}`).join(arg);
    });
    return unfilled ? result.trim() : result;
};
