import { useTranslation } from 'react-i18next';

import { runtime } from '@chatic/app-runtime';

import { isPlaceholderName } from '../utils';

/**
 * My account's name as the app shows it. A guest account is named with a bare UUID, which is an id,
 * not a name: it reads as "Guest" instead. Any other account without a real name is `''`, so each
 * surface keeps its own placeholder for "no name".
 */
export const useAccountName = (): string => {
    const { t } = useTranslation();
    const { userName, isGuest } = runtime.session.useRuntimeProfile();
    if (!isPlaceholderName(userName)) return userName.trim();
    return isGuest ? t('profile.guestName') : '';
};
