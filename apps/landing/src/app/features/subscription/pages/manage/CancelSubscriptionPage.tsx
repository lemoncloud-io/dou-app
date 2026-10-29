import { type JSX, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { ROUTES } from '../../../../routes/paths';
import { PageLoader } from '../../components';
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
                    <h1 className="text-[28px] font-bold text-navy">{t('subscription.manage.cancel.title')}</h1>
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
            <header className="mb-2 flex flex-col gap-2">
                <h1 className="text-[28px] font-bold text-navy">{t(`${key}.title`)}</h1>
                <p className="text-sm text-subtitle">{t(`${key}.subtitle`)}</p>
            </header>
            <Card className="flex flex-col gap-4 py-5">
                {rows.map(row => (
                    <div key={row.label} className="flex items-center justify-between text-sm">
                        <span className="text-subtitle">{row.label}</span>
                        <span className="font-semibold text-navy">{row.value}</span>
                    </div>
                ))}
            </Card>
            <section className="flex flex-col gap-2 rounded-2xl bg-muted px-6 py-5">
                <h2 className="text-[13px] font-semibold text-navy">{t(`${key}.refund.title`)}</h2>
                <p className="text-[13px] leading-relaxed text-desc-alt">{t(`${key}.refund.body`)}</p>
                <Link to={ROUTES.policy.refund} className="text-[13px] font-semibold text-navy underline">
                    {t(`${key}.refund.link`)}
                </Link>
            </section>
            <section className="flex flex-col gap-2 rounded-2xl bg-muted px-6 py-5">
                <h2 className="text-[13px] font-semibold text-navy">{t(`${key}.after.title`)}</h2>
                <p className="text-[13px] leading-relaxed text-desc-alt">{t(`${key}.after.body`)}</p>
            </section>
            <div className="flex flex-wrap gap-3">
                <Button
                    size="lg"
                    variant="secondary"
                    className="rounded-full"
                    disabled={cancel.isPending}
                    onClick={() => navigate(ROUTES.subscription.detail(sub.id))}
                >
                    {t(`${key}.keep`)}
                </Button>
                <Button
                    size="lg"
                    variant="secondary"
                    className="rounded-full border-status-danger/40 text-status-danger hover:bg-status-danger-bg"
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
            <h1 className="mb-2 text-[28px] font-bold text-navy">{t(`${key}.title`)}</h1>
            <Banner tone="warning" title={t(`${key}.bannerTitle`, { date: fmt.date(sub.endsAt) })}>
                {t(`${key}.${resumable ? 'bannerBody' : 'bannerBodyNoUndo'}`)}
            </Banner>
            <div className="flex flex-wrap gap-3">
                <Button
                    size="lg"
                    variant="secondary"
                    className="rounded-full"
                    onClick={() => navigate(ROUTES.subscription.detail(sub.id))}
                >
                    {t(`${key}.toDetail`)}
                </Button>
                {resumable && (
                    <Button
                        size="lg"
                        className="rounded-full"
                        disabled={!resume.ready}
                        onClick={() => resume.request() === 'confirm' && setAsking(true)}
                    >
                        {t(`${key}.resume`)}
                    </Button>
                )}
            </div>
            {asking && (
                <Card className="flex max-w-[640px] flex-col items-start gap-3">
                    <h2 className="text-base font-semibold text-navy">
                        {t('subscription.manage.dialogs.resume.title')}
                    </h2>
                    <p className="text-[13px] text-desc-alt">
                        {t('subscription.manage.dialogs.resume.body', resume.copyValues)}{' '}
                        {t('subscription.manage.dialogs.resume.sameAsBefore')}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-3">
                        <Button
                            size="lg"
                            variant="secondary"
                            className="rounded-full"
                            disabled={resume.pending}
                            onClick={() => setAsking(false)}
                        >
                            {t('subscription.common.actions.close')}
                        </Button>
                        <Button size="lg" className="rounded-full" disabled={resume.pending} onClick={resume.confirm}>
                            {t('subscription.manage.dialogs.resume.confirm')}
                        </Button>
                    </div>
                </Card>
            )}
            <p className="text-xs text-subtitle">{t(`${key}.note`)}</p>
            {resume.dialogs}
        </div>
    );
};
