import { type JSX, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { ROUTES } from '../../../../routes/paths';
import { PageHeader, PageLoader } from '../../components';
import { Banner, Button, Card, useToast } from '../../components/ui';
import { useCancelSubscription, usePlans, useSubscription } from '../../hooks';
import { isPortError, useSupports, useToday } from '../../lib/port';
import { LoadFailure } from './LoadFailure';
import { cancelSceneOf } from './manageModel';
import { type ManageFormat, useManageFormat } from './useManageFormat';
import { useResumeFlow } from './useResumeFlow';

import type { Subscription } from '../../types';

/**
 * W-15 — cancelling, and the scheduled-end result.
 *
 * Which of the two it shows follows the subscription's state rather than a step in the page, so a
 * reload after cancelling lands on the result and a second cancel is never offered.
 */
export const CancelSubscriptionPage = (): JSX.Element => {
    const { t } = useTranslation();
    const { subscriptionId } = useParams();
    const subscription = useSubscription(subscriptionId);
    const plans = usePlans();
    const fmt = useManageFormat();
    const today = useToday();

    if (subscription.isLoading || plans.isLoading) return <PageLoader />;
    const sub = subscription.data;
    if (!sub || plans.isError) {
        return (
            <LoadFailure
                title={t('subscription.manage.cancel.title')}
                error={subscription.error ?? plans.error}
                onRetry={() => {
                    void subscription.refetch();
                    void plans.refetch();
                }}
            />
        );
    }

    switch (cancelSceneOf(sub, today)) {
        case 'form':
            return <CancelForm sub={sub} fmt={fmt} />;
        case 'done':
            return <CancelDone sub={sub} fmt={fmt} />;
        case 'unavailable':
            return (
                <div className="flex max-w-[640px] flex-col gap-5">
                    <PageHeader title={t('subscription.manage.cancel.title')} />
                    <Banner tone="neutral" title={t('subscription.manage.cancel.unavailable.title')}>
                        {t('subscription.manage.cancel.unavailable.body')}
                    </Banner>
                    <Link
                        to={ROUTES.subscription.detail(sub.id)}
                        className="self-start text-sm font-semibold text-navy underline"
                    >
                        {t('subscription.manage.cancel.done.toDetail')}
                    </Link>
                </div>
            );
    }
};

const CancelForm = ({ sub, fmt }: { sub: Subscription; fmt: ManageFormat }): JSX.Element => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const toast = useToast();
    const cancel = useCancelSubscription();
    const key = 'subscription.manage.cancel';

    const submit = () =>
        cancel.mutate(sub.id, {
            onError: error => {
                if (isPortError(error, 'unauthenticated')) return;
                toast(t(`subscription.common.error.${isPortError(error, 'network') ? 'network' : 'unknown'}`));
            },
        });

    const rows = [
        { label: t(`${key}.plan`), value: fmt.planName(sub.planId) },
        // Cancelling stops the next renewal, so the subscription runs until the day it would have renewed.
        { label: t(`${key}.endsAt`), value: fmt.date(sub.nextBillingAt) },
        { label: t(`${key}.next`), value: t(`${key}.nextValue`) },
    ];

    return (
        <div className="flex max-w-[640px] flex-col gap-5">
            <PageHeader title={t(`${key}.title`)} subtitle={t(`${key}.subtitle`)} className="mb-1" />
            <Card className="flex flex-col gap-3.5 rounded-[14px] border-line p-4 md:rounded-2xl md:px-[19px] md:py-[19px]">
                {rows.map(row => (
                    <div key={row.label} className="flex items-center justify-between gap-4 text-sm">
                        <span className="font-medium text-mute">{row.label}</span>
                        <span className="text-right font-bold text-ink">{row.value}</span>
                    </div>
                ))}
            </Card>
            <section className="flex flex-col gap-2 rounded-2xl bg-note px-5 py-4 md:px-6 md:py-5">
                <h2 className="text-[13px] font-bold text-ink">{t(`${key}.refund.title`)}</h2>
                <p className="text-[13px] font-medium leading-[1.6] text-[#666b78]">{t(`${key}.refund.body`)}</p>
                <Link to={ROUTES.policy.refund} className="text-[13px] font-semibold text-ink underline">
                    {t(`${key}.refund.link`)}
                </Link>
            </section>
            <section className="flex flex-col gap-2 rounded-2xl bg-note px-5 py-4 md:px-6 md:py-5">
                <h2 className="text-[13px] font-bold text-ink">{t(`${key}.after.title`)}</h2>
                <p className="text-[13px] font-medium leading-[1.6] text-[#666b78]">{t(`${key}.after.body`)}</p>
            </section>
            <div className="flex flex-col gap-3 md:flex-row">
                <Button
                    size="lg"
                    variant="secondary"
                    className="max-md:h-[54px]"
                    disabled={cancel.isPending}
                    onClick={() => navigate(ROUTES.subscription.detail(sub.id))}
                >
                    {t(`${key}.keep`)}
                </Button>
                <Button
                    size="lg"
                    variant="secondary"
                    className="border-[#f3c2c4] text-[#c1292e] hover:bg-status-danger-bg max-md:h-[54px]"
                    disabled={cancel.isPending}
                    onClick={submit}
                >
                    {t(`${key}.submit`)}
                </Button>
            </div>
        </div>
    );
};

const CancelDone = ({ sub, fmt }: { sub: Subscription; fmt: ManageFormat }): JSX.Element => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [asking, setAsking] = useState(false);
    const resume = useResumeFlow(sub, fmt, {
        inline: true,
        onResumed: () => navigate(ROUTES.subscription.detail(sub.id)),
    });
    const key = 'subscription.manage.cancel.done';
    // The way back is left out where the port has no server for undoing a cancellation.
    const resumable = useSupports()('resumeSubscription');

    return (
        <div className="flex max-w-[1072px] flex-col gap-5">
            <PageHeader title={t(`${key}.title`)} className="mb-1" />
            <Banner tone="warning" title={t(`${key}.bannerTitle`, { date: fmt.date(sub.endsAt) })}>
                {t(`${key}.${resumable ? 'bannerBody' : 'bannerBodyNoUndo'}`)}
            </Banner>
            <div className="flex flex-col gap-3 md:flex-row">
                <Button
                    size="lg"
                    variant="secondary"
                    className="max-md:h-[54px]"
                    onClick={() => navigate(ROUTES.subscription.detail(sub.id))}
                >
                    {t(`${key}.toDetail`)}
                </Button>
                {resumable && (
                    <Button
                        size="lg"
                        className="max-md:h-[54px]"
                        disabled={!resume.ready}
                        onClick={() => resume.request() === 'confirm' && setAsking(true)}
                    >
                        {t(`${key}.resume`)}
                    </Button>
                )}
            </div>
            {asking && (
                <Card className="flex max-w-[640px] flex-col items-start gap-3 rounded-2xl border-line p-5">
                    <h2 className="text-[15px] font-bold text-ink">{t('subscription.manage.dialogs.resume.title')}</h2>
                    <p className="text-[13px] font-medium leading-[1.6] text-mute">
                        {t('subscription.manage.dialogs.resume.body', resume.copyValues)}{' '}
                        {t('subscription.manage.dialogs.resume.sameAsBefore')}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-3">
                        <Button
                            size="lg"
                            variant="secondary"
                            disabled={resume.pending}
                            onClick={() => setAsking(false)}
                        >
                            {t('subscription.common.actions.close')}
                        </Button>
                        <Button size="lg" disabled={resume.pending} onClick={resume.confirm}>
                            {t('subscription.manage.dialogs.resume.confirm')}
                        </Button>
                    </div>
                </Card>
            )}
            <p className="text-xs font-medium leading-normal text-mute">{t(`${key}.note`)}</p>
            {resume.dialogs}
        </div>
    );
};
