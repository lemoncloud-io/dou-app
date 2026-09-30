import { en, ko } from './locales';

import type { TranslationTree } from './types';

/**
 * Builds a push banner's copy from its `loc_key` / `loc_args`, the way the two native push handlers
 * do — for the one path neither of them sees: an iOS push that arrives while the app is in the
 * foreground goes straight to the shell, bypassing the Notification Service Extension, and its APNs
 * `alert` carries no translated body at all.
 *
 * Separate from `translate` because push keys are not `TranslationKey`s and need positional
 * substitution, which `translate` does not do. The three assemblers (this, the Android FCM service
 * and the iOS extension) share one rule set, so a change here goes to all three.
 */

const translations: Record<string, TranslationTree> = { en, ko };

/** Generic body for a push whose template came without the args it names. Never sent by the server. */
const BODY_FALLBACK_KEY = 'push_chat_fallback_body';

/** A positional placeholder in a push template; the digits are the index of the arg it takes. */
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

/**
 * `loc_args` arrives as an array over APNs but as a JSON-encoded string from FCM-shaped senders
 * (the test tooling among them); both mean the same args. Anything else means none.
 */
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

/**
 * The copy for one banner field.
 *
 * - An empty key gives `''`; a key this locale does not have gives the key itself. The key staying
 *   visible is deliberate — it is the sign a payload outran the installed app, which the server's
 *   rollout order is there to prevent, and hiding it would hide that mistake too.
 * - When the template names a placeholder the args do not reach (a chat push for a message with no
 *   text sends no args for its `{0}` body), a body becomes the generic fallback copy and a title
 *   just loses the placeholders it could not fill. The hole is judged on the template, not on the
 *   substituted result, so an arg that itself contains `{0}` is still shown verbatim.
 *
 * `lang` falls back to English for anything but a language this shell has copy for, as the native
 * handlers do.
 */
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
