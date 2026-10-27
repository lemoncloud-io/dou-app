import { type JSX } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge, type BadgeTone } from './ui';

import type { Subscription } from '../types';

type BadgeState = Subscription['status'] | 'downgradeScheduled';

const TONE: Record<BadgeState, BadgeTone> = {
    trial: 'info',
    active: 'navy',
    pastDue: 'danger',
    restricted: 'danger',
    cancelScheduled: 'warning',
    expired: 'neutral',
    downgradeScheduled: 'warning',
};

/** The status pill beside a plan name. A scheduled downgrade reads as its own state. */
export const StatusBadge = ({ subscription }: { subscription: Subscription }): JSX.Element => {
    const { t } = useTranslation();
    const state: BadgeState =
        subscription.status === 'active' && subscription.pendingChange ? 'downgradeScheduled' : subscription.status;
    return <Badge tone={TONE[state]}>{t(`subscription.common.status.${state}`)}</Badge>;
};
