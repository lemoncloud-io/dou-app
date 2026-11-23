import { getAppLanguage } from '../device';
import { resolveAppLanguage } from '../../stores/languagePreference';
import type { LanguagePreference } from '../../stores/languagePreference';

import { translate } from './translate';

import type { TranslationKey } from './types';

export type { TranslationKey } from './types';
export { formatPushCopy } from './formatPushCopy';
export type { PushCopyField } from './formatPushCopy';

let readChoice: () => LanguagePreference = () => 'system';

export const registerLanguageChoice = (read: () => LanguagePreference): void => {
    readChoice = read;
};

export const getEffectiveLanguage = (): string => resolveAppLanguage(readChoice(), getAppLanguage());

export const t = (key: TranslationKey, lang?: string): string => {
    const language = lang ?? getEffectiveLanguage();
    return translate(key, language);
};
