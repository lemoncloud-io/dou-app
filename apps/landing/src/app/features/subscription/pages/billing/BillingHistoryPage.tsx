import { type JSX } from 'react';
import { useTranslation } from 'react-i18next';

import { PageLoader } from '../../components';
import { useCurrentSubscription, useInvoices, usePlans } from '../../hooks';
import { useToday } from '../../lib/port';
import { cn, formatDate, formatMoney } from '../../utils';
import { BillingPageHeader, LoadFailed } from './BillingPage';
import { nextRetryOf } from './display';

import type { Invoice } from '../../types';

// A result is a coloured word on a phone and a pill from `md`.
const RESULT: Record<Invoice['status'], string> = {
    paid: 'text-[#167a4a] md:bg-note md:text-ink',
    failed: 'text-[#c1292e] md:bg-[#fdeced]',
    refunded: 'text-navy md:bg-[#eef3fb]',
};

/**
 * W-13 — every payment and refund, newest first, each with the provider's receipt where there is one.
 * A failed charge has no receipt. Nothing here is an action: retrying a failed payment happens on
 * the payment methods page, where the card to charge is chosen.
 */
export const BillingHistoryPage = (): JSX.Element => {
    const { t, i18n } = useTranslation();
    const invoices = useInvoices();
    const plans = usePlans();
    const { subscription } = useCurrentSubscription();
    const today = useToday();

    // A row names its plan, so the page waits for the plans as well as the invoices.
    if (invoices.isPending || plans.isPending) return <PageLoader />;
    if (invoices.isError) return <LoadFailed error={invoices.error} onRetry={invoices.refetch} />;
    if (plans.isError) return <LoadFailed error={plans.error} onRetry={plans.refetch} />;

    // Only the latest failed charge is the one still being retried; older failures were settled.
    const nextRetry = nextRetryOf(subscription, today);
    const retrying = nextRetry ? invoices.data.find(invoice => invoice.status === 'failed')?.id : undefined;

    const planName = (planId: Invoice['planId']) => {
        const sort = plans.data.find(plan => plan.id === planId)?.sort;
        return sort ? t('subscription.common.planName', { sort }) : '';
    };
    const columns = (key: string) => (
        <span role="columnheader">{t(`subscription.billing.history.columns.${key}`)}</span>
    );

    return (
        <section className="max-w-[1072px]">
            <BillingPageHeader
                title={t('subscription.billing.history.title')}
                subtitle={t('subscription.billing.history.subtitle')}
                barTitle={t('subscription.billing.history.barTitle')}
                titleOnPhone
            />

            {invoices.data.length === 0 ? (
                <div className="flex flex-col items-center gap-2 rounded-2xl bg-note px-6 py-20 text-center">
                    <p className="text-base font-bold text-ink">{t('subscription.billing.history.empty.title')}</p>
                    {subscription?.status === 'trial' && subscription.nextBillingAt && subscription.nextAmount && (
                        <p className="text-sm font-medium text-mute">
                            {t('subscription.billing.history.empty.trial', {
                                date: formatDate(subscription.nextBillingAt),
                                amount: formatMoney(subscription.nextAmount, i18n.language),
                            })}
                        </p>
                    )}
                </div>
            ) : (
                <>
                    <div
                        role="table"
                        aria-label={t('subscription.billing.history.title')}
                        className="overflow-hidden rounded-[14px] border border-line bg-card md:rounded-2xl"
                    >
                        <div
                            role="row"
                            className="hidden h-[38px] grid-cols-[140px_minmax(0,1fr)_140px_170px_140px] items-center bg-note px-6 text-xs font-semibold text-mute md:grid"
                        >
                            {columns('date')}
                            {columns('description')}
                            {columns('amount')}
                            {columns('result')}
                            {columns('receipt')}
                        </div>
                        {/* One row layout for both widths: a phone stacks the description over the date and the
                            receipt on the left, the amount over the result on the right; from `md` the five sit
                            in a line, date first. */}
                        {invoices.data.map(invoice => (
                            <div
                                key={invoice.id}
                                role="row"
                                className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 border-t border-line p-4 first:border-t-0 md:grid-cols-[140px_minmax(0,1fr)_140px_170px_140px] md:items-center md:gap-x-0 md:px-6 md:py-4 md:first:border-t"
                            >
                                <span
                                    role="cell"
                                    className="text-xs font-medium tabular-nums text-mute max-md:col-start-1 max-md:row-start-2 md:order-1 md:text-sm md:text-ink"
                                >
                                    {formatDate(invoice.issuedAt)}
                                </span>
                                <span
                                    role="cell"
                                    className="text-sm font-semibold text-ink max-md:col-start-1 max-md:row-start-1 md:order-2 md:font-medium"
                                >
                                    {t(`subscription.billing.history.kind.${invoice.kind}`, {
                                        plan: planName(invoice.planId),
                                    })}
                                </span>
                                <span
                                    role="cell"
                                    className="text-sm font-bold tabular-nums text-ink max-md:col-start-2 max-md:row-start-1 max-md:justify-self-end md:order-3 md:font-medium"
                                >
                                    {formatMoney(invoice.amount, i18n.language)}
                                </span>
                                <span
                                    role="cell"
                                    className="max-md:col-start-2 max-md:row-start-2 max-md:justify-self-end md:order-4"
                                >
                                    <span
                                        className={cn(
                                            'inline-flex text-xs font-semibold md:rounded-full md:px-2.5 md:py-1',
                                            RESULT[invoice.status]
                                        )}
                                    >
                                        {invoice.id === retrying && nextRetry
                                            ? t('subscription.billing.history.status.failedRetrying', {
                                                  date: formatDate(nextRetry),
                                              })
                                            : t(`subscription.billing.history.status.${invoice.status}`)}
                                    </span>
                                </span>
                                <span
                                    role="cell"
                                    className="max-md:col-span-2 max-md:col-start-1 max-md:row-start-3 md:order-5"
                                >
                                    {invoice.receiptUrl && (
                                        <a
                                            href={invoice.receiptUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-[13px] font-semibold text-navy underline-offset-2 hover:underline"
                                        >
                                            {t(
                                                invoice.kind === 'refund'
                                                    ? 'subscription.billing.history.refundReceipt'
                                                    : 'subscription.billing.history.receipt'
                                            )}{' '}
                                            <span aria-hidden>↗</span>
                                            <span className="sr-only">
                                                ({t('subscription.billing.history.opensInNewTab')})
                                            </span>
                                        </a>
                                    )}
                                </span>
                            </div>
                        ))}
                    </div>
                    <p className="mt-3 text-xs font-medium leading-normal text-mute">
                        {t('subscription.billing.history.taxNote')}
                    </p>
                </>
            )}
        </section>
    );
};
