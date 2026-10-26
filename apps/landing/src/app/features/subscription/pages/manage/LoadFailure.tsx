import { type JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { ROUTES } from '../../../../routes/paths';
import { Banner, Button } from '../../components/ui';
import { isPortError } from '../../lib/port';

/**
 * What a subscription screen shows when what it reads did not load: "not found" with the way back
 * to the list for an id this account does not own, otherwise the error with a retry.
 */
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
                title={
                    notFound
                        ? t('subscription.manage.detail.notFound')
                        : t(`subscription.common.error.${isPortError(error, 'network') ? 'network' : 'unknown'}`)
                }
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
