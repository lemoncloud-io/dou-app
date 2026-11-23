import i18n from '../../../../i18n';
import en from '../../../../i18n/locales/subscription/en.json';
import ko from '../../../../i18n/locales/subscription/ko.json';

export const registerSubscriptionCopy = (): void => {
    i18n.addResourceBundle('ko', 'translation', ko, true, false);
    i18n.addResourceBundle('en', 'translation', en, true, false);
};
