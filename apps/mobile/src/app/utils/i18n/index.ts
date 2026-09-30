import { getAppLanguage } from '../device';
// The pure value model only — importing the store itself from here is the cycle described below.
import { resolveAppLanguage } from '../../stores/languagePreference';
import type { LanguagePreference } from '../../stores/languagePreference';

import { translate } from './translate';

import type { TranslationKey } from './types';

export type { TranslationKey } from './types';

/**
 * Where the language choice is read from, registered by `languageStore` when it loads.
 *
 * A registration rather than an import because this module sits under `utils`, which the services
 * import (`NotificationService` names its channels with `t`), and the store sits on top of the
 * services — importing it from here would close a cycle. Until the store has loaded, nothing is
 * registered and the device language answers, which is what every surface did before a choice
 * could be made.
 */
let readChoice: () => LanguagePreference = () => 'system';

export const registerLanguageChoice = (read: () => LanguagePreference): void => {
    readChoice = read;
};

/** The language the shell's own copy is shown in: the pinned choice, else the device's. */
export const getEffectiveLanguage = (): string => resolveAppLanguage(readChoice(), getAppLanguage());

/**
 * Get translated string for the given key
 * @param key - Translation key
 * @param lang - Optional language override. If not provided, uses the chosen language, else the device's.
 */
export const t = (key: TranslationKey, lang?: string): string => {
    const language = lang ?? getEffectiveLanguage();
    return translate(key, language);
};
