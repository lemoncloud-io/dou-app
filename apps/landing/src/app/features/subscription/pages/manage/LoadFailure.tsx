import { type JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { ROUTES } from '../../../../routes/paths';
import { Banner, Button } from '../../components/ui';
import { isPortError } from '../../lib/port';
import { commonErrorKey } from '../../lib/errorKey';

export const LoadFailure = ({
    title,
    error,
    onRetry,
}: {
    title: string;
    error: unknown;
    onRetry: () => void;
}): JSX.Element => {
    const { t } = useTranslation();
    const notFound = isPortError(error, 'notFound');
    return (
        <div className="flex max-w-[1072px] flex-col gap-6">
            <h1 className="text-[28px] font-bold text-navy">{title}</h1>
            <Banner
                tone={notFound ? 'neutral' : 'danger'}
                title={notFound ? t('subscription.manage.detail.notFound') : t(commonErrorKey(error))}
                action={
                    notFound ? (
                        <Link to={ROUTES.subscription.root} className="text-sm font-semibold text-navy underline">
                            {t('subscription.manage.detail.backToList')}
                        </Link>
                    ) : (
                        <Button size="sm" variant="secondary" onClick={onRetry}>
                            {t('subscription.common.actions.retry')}
                        </Button>
                    )
                }
            />
        </div>
    );
};
