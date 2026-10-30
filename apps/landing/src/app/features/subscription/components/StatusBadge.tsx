import { type JSX } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '../utils';

import type { Subscription } from '../types';

type BadgeState = Subscription['status'] | 'downgradeScheduled';

// The status pills of the design: a pale fill under a darker text of the same hue; an active
// subscription is the one dark pill, an ended one the grey.
const PILL: Record<BadgeState, string> = {
    pending: 'bg-[#eef3fb] text-navy',
    trial: 'bg-[#f1fad6] text-[#3b5a00]',
    active: 'bg-navy text-white',
    pastDue: 'bg-[#fdeced] text-[#c1292e]',
    restricted: 'bg-[#fdeced] text-[#c1292e]',
    cancelScheduled: 'bg-[#fff4de] text-[#9a6200]',
    expired: 'bg-[#f0f1f3] text-[#666b78]',
    downgradeScheduled: 'bg-[#ecf1ff] text-[#3454d1]',
};

/** The status pill beside a plan name. A scheduled downgrade reads as its own state. */
export const StatusBadge = ({
    subscription,
    className,
}: {
    subscription: Subscription;
    className?: string;
}): JSX.Element => {
    const { t } = useTranslation();
    const state: BadgeState =
        subscription.status === 'active' && subscription.pendingChange ? 'downgradeScheduled' : subscription.status;
    return (
        <span
            className={cn(
                'inline-flex items-center whitespace-nowrap rounded-full px-2 py-1 text-xs font-semibold leading-[1.4] md:px-2.5',
                PILL[state],
                className
            )}
        >
            {t(`subscription.common.status.${state}`)}
        </span>
    );
};
