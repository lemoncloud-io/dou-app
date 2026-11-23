import { useTranslation } from 'react-i18next';

import { ERROR_MESSAGES, type ErrorMessageType } from '../consts';

export const useErrorScreenText = (type: ErrorMessageType) => {
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
