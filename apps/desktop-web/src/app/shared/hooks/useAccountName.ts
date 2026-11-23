import { useTranslation } from 'react-i18next';

import { runtime } from '@chatic/runtime';

import { isPlaceholderName } from '../utils';

export const useAccountName = (): string => {
    const { t } = useTranslation();
    const { userName, isGuest } = runtime.session.useRuntimeProfile();
    if (!isPlaceholderName(userName)) return userName.trim();
    return isGuest ? t('profile.guestName') : '';
};
