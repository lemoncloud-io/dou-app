import { type ComponentProps, type JSX } from 'react';
import { useTranslation } from 'react-i18next';

import { PageHeader } from '../../components';
import { Banner, Button, useToast } from '../../components/ui';
import { isPortError } from '../../lib/port';

/** The heading every billing page opens with: title, one line under it, and an optional action. */
export const BillingPageHeader = (props: Omit<ComponentProps<typeof PageHeader>, 'className'>): JSX.Element => (
    <PageHeader {...props} className="mb-5 md:mb-6" />
);

/** The common copy for a port error a billing page does not have its own words for. */
export const usePortErrorText = (): ((error: unknown) => string) => {
    const { t } = useTranslation();
    return error =>
        isPortError(error, 'network') ? t('subscription.common.error.network') : t('subscription.common.error.unknown');
};

/**
 * Reports a failed action in a toast. A lost session is left alone: the route root already sends the
 * reader to sign in, and a toast on the way out would only flash.
 */
export const useReportPortError = (): ((error: unknown) => void) => {
    const toast = useToast();
    const errorText = usePortErrorText();
    return error => {
        if (!isPortError(error, 'unauthenticated')) toast(errorText(error));
    };
};

/** A page whose first read failed: what went wrong and a way to ask again. */
export const LoadFailed = ({ error, onRetry }: { error: unknown; onRetry: () => void }): JSX.Element => {
    const { t } = useTranslation();
    const errorText = usePortErrorText();
    return (
        <Banner
            tone="danger"
            title={errorText(error)}
            action={
                <Button size="sm" variant="secondary" onClick={() => onRetry()}>
                    {t('subscription.common.actions.retry')}
                </Button>
            }
        />
    );
};
