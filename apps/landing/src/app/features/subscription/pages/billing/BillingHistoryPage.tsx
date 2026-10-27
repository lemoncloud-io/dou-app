import { type JSX } from 'react';
import { useTranslation } from 'react-i18next';

import { PageLoader } from '../../components';
import {
    Badge,
    type BadgeTone,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeaderCell,
    TableRow,
} from '../../components/ui';
import { useCurrentSubscription, useInvoices, usePlans } from '../../hooks';
import { useToday } from '../../lib/port';
import { formatDate, formatMoney } from '../../utils';
import { BillingPageHeader, LoadFailed } from './BillingPage';
import { nextRetryOf } from './display';

import type { Invoice } from '../../types';

const STATUS_TONE: Record<Invoice['status'], BadgeTone> = {
    paid: 'neutral',
    failed: 'danger',
    refunded: 'info',
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

    return (
        <section className="max-w-[1072px]">
            <BillingPageHeader
                title={t('subscription.billing.history.title')}
                subtitle={t('subscription.billing.history.subtitle')}
            />

            {invoices.data.length === 0 ? (
                <div className="flex flex-col items-center gap-2 rounded-2xl bg-muted px-6 py-20 text-center">
                    <p className="text-base font-semibold text-navy">{t('subscription.billing.history.empty.title')}</p>
                    {subscription?.status === 'trial' && subscription.nextBillingAt && subscription.nextAmount && (
                        <p className="text-sm text-subtitle">
                            {t('subscription.billing.history.empty.trial', {
                                date: formatDate(subscription.nextBillingAt),
                                amount: formatMoney(subscription.nextAmount, i18n.language),
                            })}
                        </p>
                    )}
                </div>
            ) : (
                <>
                    <div className="overflow-hidden rounded-2xl border border-border bg-card">
                        <Table>
                            <TableHead className="bg-muted">
                                <TableRow>
                                    <TableHeaderCell className="w-[140px]">
                                        {t('subscription.billing.history.columns.date')}
                                    </TableHeaderCell>
                                    <TableHeaderCell>
                                        {t('subscription.billing.history.columns.description')}
                                    </TableHeaderCell>
                                    <TableHeaderCell className="w-[140px]">
                                        {t('subscription.billing.history.columns.amount')}
                                    </TableHeaderCell>
                                    <TableHeaderCell className="w-[140px]">
                                        {t('subscription.billing.history.columns.result')}
                                    </TableHeaderCell>
                                    <TableHeaderCell className="w-[160px]">
                                        {t('subscription.billing.history.columns.receipt')}
                                    </TableHeaderCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {invoices.data.map(invoice => (
                                    <TableRow key={invoice.id}>
                                        <TableCell className="tabular-nums">{formatDate(invoice.issuedAt)}</TableCell>
                                        <TableCell>
                                            {t(`subscription.billing.history.kind.${invoice.kind}`, {
                                                plan: planName(invoice.planId),
                                            })}
                                        </TableCell>
                                        <TableCell className="tabular-nums">
                                            {formatMoney(invoice.amount, i18n.language)}
                                        </TableCell>
                                        <TableCell>
                                            <Badge tone={STATUS_TONE[invoice.status]}>
                                                {invoice.id === retrying && nextRetry
                                                    ? t('subscription.billing.history.status.failedRetrying', {
                                                          date: formatDate(nextRetry),
                                                      })
                                                    : t(`subscription.billing.history.status.${invoice.status}`)}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            {invoice.receiptUrl && (
                                                <a
                                                    href={invoice.receiptUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-sm font-medium text-navy underline-offset-2 hover:underline"
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
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                    <p className="mt-3 text-xs text-subtitle">{t('subscription.billing.history.taxNote')}</p>
                </>
            )}
        </section>
    );
};
