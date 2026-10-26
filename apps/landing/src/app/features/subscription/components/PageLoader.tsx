import { type JSX } from 'react';
import { useTranslation } from 'react-i18next';

import { Spinner } from './ui';

/** Fills the space while a guard or a page waits for its first answer. */
export const PageLoader = (): JSX.Element => {
    const { t } = useTranslation();
    return (
        <div className="flex h-full min-h-[240px] w-full items-center justify-center">
            <Spinner label={t('subscription.common.loading')} />
        </div>
    );
};
