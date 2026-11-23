import { type JSX } from 'react';
import { useTranslation } from 'react-i18next';

import { Spinner } from './ui';

export const PageLoader = (): JSX.Element => {
    const { t } = useTranslation();
    return (
        <div className="flex h-full min-h-[240px] w-full items-center justify-center">
            <Spinner label={t('subscription.common.loading')} />
        </div>
    );
};
