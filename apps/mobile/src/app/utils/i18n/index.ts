import { getAppLanguage } from '../device';

import { translate } from './translate';

import type { TranslationKey } from './types';

export type { TranslationKey } from './types';

/**
 * Get translated string for the given key
 * @param key - Translation key
 * @param lang - Optional language override. If not provided, uses device language.
 */
export const t = (key: TranslationKey, lang?: string): string => {
    const language = lang ?? getAppLanguage();
    return translate(key, language);
};
