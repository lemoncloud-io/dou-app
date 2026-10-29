import { type JSX } from 'react';
import { useTranslation } from 'react-i18next';

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
        <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-navy">{t(`${key}.title`)}</h2>
            <div className="overflow-hidden rounded-xl border border-border">
                {notice ? (
                    <p className="px-5 py-6 text-sm text-subtitle">{notice}</p>
                ) : (
                    <Table>
                        <TableHead className="bg-muted">
                            <TableRow>
                                <TableHeaderCell className="w-[160px] px-5">{t(`${key}.date`)}</TableHeaderCell>
                                <TableHeaderCell>{t(`${key}.item`)}</TableHeaderCell>
                                <TableHeaderCell className="w-[160px]">{t(`${key}.amount`)}</TableHeaderCell>
                                <TableHeaderCell className="w-[440px]">{t(`${key}.status`)}</TableHeaderCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {recent.map(invoice => (
                                <TableRow key={invoice.id}>
                                    <TableCell className="px-5">{fmt.date(invoice.issuedAt)}</TableCell>
                                    <TableCell>
                                        {t(`${key}.line`, {
                                            sort: fmt.planOf(invoice.planId)?.sort,
                                            kind: t(`${key}.kind.${invoice.kind}`),
                                        })}
                                    </TableCell>
                                    <TableCell>{fmt.money(invoice.amount)}</TableCell>
                                    <TableCell>
                                        <Badge tone={STATUS_TONE[invoice.status]}>
                                            {t(`${key}.statusLabel.${invoice.status}`)}
                                        </Badge>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </div>
        </section>
    );
};
