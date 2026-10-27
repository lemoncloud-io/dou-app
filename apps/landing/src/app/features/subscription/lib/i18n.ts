import i18n from '../../../../i18n';
import en from '../../../../i18n/locales/subscription/en.json';
import ko from '../../../../i18n/locales/subscription/ko.json';

/**
 * Adds the subscription copy to the site's one `translation` namespace. Called when this chunk loads,
 * not in `src/i18n`, so the public pages' bundle never carries it. Deep-merged and never overwriting,
 * so it cannot disturb a key the site already has.
 */
export const registerSubscriptionCopy = (): void => {
    i18n.addResourceBundle('ko', 'translation', ko, true, false);
    i18n.addResourceBundle('en', 'translation', en, true, false);
};
