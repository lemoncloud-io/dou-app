import { useTranslation } from 'react-i18next';

import { ERROR_MESSAGES, type ErrorMessageType } from '../consts';

/**
 * The words on the error and 404 screens, read from the caller's locale files under `error.screen.*`.
 *
 * Every lookup carries its English default. These screens are what shows when something already
 * went wrong, and that includes the translation request itself — web fetches `/locales` over the
 * network — so a missing key or a missing bundle has to read as English, never as a raw key.
 */
export const useErrorScreenText = (type: ErrorMessageType) => {
    // No Suspense: the app's top-level error boundary sits outside its <Suspense>, so a screen that
    // suspended while `/locales` loads would render nothing instead of the English defaults.
    const { t } = useTranslation(undefined, { useSuspense: false });
    const defaults = ERROR_MESSAGES[type];
    const pick = (field: keyof typeof defaults): string =>
        t(`error.screen.${type}.${field}`, { defaultValue: defaults[field] });

    return {
        title: pick('title'),
        description: pick('description'),
        primaryAction: pick('primaryAction'),
        secondaryAction: pick('secondaryAction'),
        details: t('error.screen.details', { defaultValue: 'View details' }),
        retrying: t('error.screen.retrying', { defaultValue: 'Retrying...' }),
        toLogin: t('error.screen.toLogin', { defaultValue: 'Go to login' }),
        unknownError: t('error.unknownError', { defaultValue: 'An unknown error occurred' }),
    };
};
