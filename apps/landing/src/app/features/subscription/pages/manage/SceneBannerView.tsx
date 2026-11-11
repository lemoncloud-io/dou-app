import { type JSX } from 'react';
import { useTranslation } from 'react-i18next';

import { Banner, type BannerTone } from '../../components/ui';

import type { ManageFormat } from './useManageFormat';
import type { SceneBanner } from '../../lib/sceneOf';
import type { PaymentMethod, Subscription } from '../../types';

const TONE: Record<SceneBanner['kind'] | 'replaced', BannerTone> = {
    pending: 'info',
    trial: 'info',
    active: 'info',
    restored: 'success',
    pastDue: 'danger',
    restricted: 'danger',
    cancelScheduled: 'warning',
    downgradeScheduled: 'warning',
    expired: 'warning',
    replaced: 'neutral',
};

/**
 * The detail screen's top banner. Which banner, and the dates and amounts in it, come from `sceneOf`;
 * this only puts them into words. The failure date and the overdue amount are read off the
 * subscription itself, which `sceneOf` does not repeat.
 */
export const SceneBannerView = ({
    sub,
    banner,
    card,
    fmt,
}: {
    sub: Subscription;
    banner: SceneBanner;
    card?: PaymentMethod;
    fmt: ManageFormat;
}): JSX.Element => {
    const { t } = useTranslation();
    const key = `subscription.manage.detail.banner.${banner.kind}`;

    const copy = ((): { title: string; body: string } => {
        switch (banner.kind) {
            case 'pending':
                return { title: t(`${key}.title`), body: t(`${key}.body`) };
            case 'trial':
                return {
                    title: t(`${key}.title`, { date: fmt.date(banner.date) }),
                    body: t(`${key}.body`, { chargeAt: fmt.date(banner.chargeAt), amount: fmt.money(banner.amount) }),
                };
            case 'active':
                return {
                    title: t(`${key}.title`),
                    body: card
                        ? t(`${key}.body`, {
                              date: fmt.date(banner.date),
                              amount: fmt.money(banner.amount),
                              card: fmt.card(card),
                          })
                        : t(`${key}.bodyNoCard`, { date: fmt.date(banner.date), amount: fmt.money(banner.amount) }),
                };
            case 'pastDue':
                return {
                    title: t(`${key}.title`, { dday: fmt.dday(banner.dday) }),
                    body: t(sub.failureReason ? `${key}.bodyWithReason` : `${key}.body`, {
                        failedAt: fmt.date(sub.failedAt),
                        reason: sub.failureReason,
                        date: fmt.date(banner.date),
                        amount: fmt.money(sub.nextAmount),
                    }),
                };
            case 'restricted':
                return {
                    title: t(`${key}.title`),
                    body: t(`${key}.body`, {
                        failedAt: fmt.date(sub.failedAt),
                        date: fmt.date(banner.date),
                        amount: fmt.money(sub.nextAmount),
                    }),
                };
            case 'cancelScheduled':
                return {
                    title: t(`${key}.title`, { date: fmt.date(banner.date), dday: fmt.dday(banner.dday) }),
                    body: t(`${key}.body`),
                };
            case 'downgradeScheduled': {
                const target = fmt.planOf(banner.planId);
                return {
                    title: t(`${key}.title`, { date: fmt.date(banner.date), to: target?.sort }),
                    body: t(`${key}.body`, {
                        date: fmt.date(banner.date),
                        amount: fmt.money(banner.amount),
                        count: target?.maxClouds,
                    }),
                };
            }
            case 'expired':
                // Replaced by the next subscription: nothing was lost and there is nothing to restore.
                if (sub.endedReason === 'replaced') {
                    return {
                        title: t(`${key}.replacedTitle`, { date: fmt.date(banner.date) }),
                        body: t(`${key}.replacedBody`),
                    };
                }
                return {
                    title: t(`${key}.title`, { date: fmt.date(banner.date) }),
                    body: sub.restoreUntil
                        ? t(`${key}.bodyWithDeadline`, { date: fmt.date(sub.restoreUntil) })
                        : t(`${key}.body`),
                };
            case 'restored':
                return { title: t(`${key}.title`), body: t(`${key}.body`) };
        }
    })();

    return (
        <Banner
            tone={TONE[banner.kind === 'expired' && sub.endedReason === 'replaced' ? 'replaced' : banner.kind]}
            title={copy.title}
        >
            {copy.body}
        </Banner>
    );
};
