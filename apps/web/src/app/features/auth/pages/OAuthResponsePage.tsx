import { useTranslation } from 'react-i18next';

import { LoadingFallback } from '@chatic/shared';

import { useOAuthLogin } from '../hooks';

export const OAuthResponsePage = () => {
    const { t } = useTranslation();
    useOAuthLogin();

    return <LoadingFallback message={t('oauth.signing')} />;
};
