import { type JSX } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge, type BadgeTone } from '../../components/ui';
import { useInvoices, useSubscriptions } from '../../hooks';
import { isPortError, useSupports } from '../../lib/port';
import { splitSubscriptions } from './manageModel';

import type { ManageFormat } from './useManageFormat';
import type { Invoice, Subscription } from '../../types';

/** How many of the latest invoices the detail screen lists; the rest are on the billing history page. */
const RECENT_COUNT = 2;

const STATUS_TONE: Record<Invoice['status'], BadgeTone> = {
    paid: 'neutral',
    failed: 'danger',
    refunded: 'info',
};

/**
 * The latest invoices under a subscription's details. Invoices belong to the account, not to one
 * subscription, so an ended subscription shown beside a live one lists none rather than the live
 * one's payments.
 */
export const RecentInvoices = ({ sub, fmt }: { sub: Subscription; fmt: ManageFormat }): JSX.Element | null => {
    const { t } = useTranslation();
    const invoices = useInvoices();
    const subscriptions = useSubscriptions();
    const supported = useSupports()('listInvoices');
    const recent = (invoices.data ?? []).slice(0, RECENT_COUNT);
    const key = 'subscription.manage.detail.invoices';

    const { live } = splitSubscriptions(subscriptions.data ?? []);
    if (!supported || (live && live.id !== sub.id)) return null;

    const notice = invoices.isError
        ? t(`subscription.common.error.${isPortError(invoices.error, 'network') ? 'network' : 'unknown'}`)
        : invoices.isLoading
          ? t('subscription.common.loading')
          : recent.length === 0
            ? t(`${key}.empty`)
            : null;

    return (
        <section className="flex flex-col gap-2 md:gap-5">
            <h2 className="text-[15px] font-bold text-ink md:text-sm">{t(`${key}.title`)}</h2>
            <div className="overflow-hidden rounded-[14px] border border-line md:rounded-lg">
                {notice ? (
                    <p className="px-5 py-6 text-sm text-mute">{notice}</p>
                ) : (
                    <div>
                        <div className="hidden h-[38px] grid-cols-[160px_300px_160px_1fr] items-center bg-note px-5 text-xs font-semibold text-mute md:grid">
                            <span>{t(`${key}.date`)}</span>
                            <span>{t(`${key}.item`)}</span>
                            <span>{t(`${key}.amount`)}</span>
                            <span>{t(`${key}.status`)}</span>
                        </div>
                        {/* One row layout for both widths: a phone stacks the item over its date on the left and the
                            amount over its status on the right; from `md` the four sit in a line, date first. */}
                        {recent.map(invoice => (
                            <div
                                key={invoice.id}
                                className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 border-t border-line p-4 first:border-t-0 md:grid-cols-[160px_300px_160px_1fr] md:items-center md:px-5 md:py-3.5 md:first:border-t"
                            >
                                <span className="text-xs font-medium text-mute max-md:col-start-1 max-md:row-start-2 md:order-1 md:text-sm md:text-ink">
                                    {fmt.date(invoice.issuedAt)}
                                </span>
                                <span className="text-sm font-semibold text-ink max-md:col-start-1 max-md:row-start-1 md:order-2 md:font-medium">
                                    {t(`${key}.line`, {
                                        sort: fmt.planOf(invoice.planId)?.sort,
                                        kind: t(`${key}.kind.${invoice.kind}`),
                                    })}
                                </span>
                                <span className="text-sm font-bold text-ink max-md:col-start-2 max-md:row-start-1 max-md:justify-self-end md:order-3 md:font-medium">
                                    {fmt.money(invoice.amount)}
                                </span>
                                <span className="max-md:col-start-2 max-md:row-start-2 max-md:justify-self-end md:order-4">
                                    <Badge
                                        tone={STATUS_TONE[invoice.status]}
                                        className={
                                            invoice.status === 'paid' ? 'bg-note font-semibold text-ink' : undefined
                                        }
                                    >
                                        {t(`${key}.statusLabel.${invoice.status}`)}
                                    </Badge>
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </section>
    );
};
