import { t as translate } from '@chatic/i18n-mobile';

import { getAppLanguage } from '../utils/device';

import type { TranslationKey } from '@chatic/i18n-mobile';

export type { TranslationKey } from '@chatic/i18n-mobile';

/**
 * Get translated string for the given key
 * @param key - Translation key
 * @param lang - Optional language override. If not provided, uses device language.
 */
export const t = (key: TranslationKey, lang?: string): string => {
    const language = lang ?? getAppLanguage();
    return translate(key, language);
};
