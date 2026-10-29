import { type JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate } from 'react-router-dom';

import { ROUTES } from '../../../../routes/paths';
import { PageLoader } from '../../components';
import { Badge, Button, Card } from '../../components/ui';
import { usePlans, useSession } from '../../hooks';
import { formatDate } from '../../utils';

/**
 * W-17 — the account's subscription is billed by App Store or Google Play, so it is changed and
 * cancelled in that store and nothing here is for sale to it. A web-billed reader who lands here has
 * nothing to read, and goes on to their subscriptions. The plan and next charge are shown when the
 * port knows them; the store's name always is.
 */
export const StoreManagedPage = (): JSX.Element => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const session = useSession();
    const plans = usePlans();

    if (session.isLoading || plans.isLoading) return <PageLoader />;
    const source = session.data?.billingSource;
    if (source !== 'appStore' && source !== 'googlePlay') return <Navigate to={ROUTES.subscription.root} replace />;

    const store = t(`subscription.entry.store.${source}`);
    const storeSubscription = session.data?.storeSubscription;
    const plan = plans.data?.find(p => p.id === storeSubscription?.planId);
    const rows = [
        ...(plan ? [{ label: 'currentPlan', value: t('subscription.common.planName', { sort: plan.sort }) }] : []),
        { label: 'billedBy', value: store },
        ...(storeSubscription?.nextBillingAt
            ? [{ label: 'nextBilling', value: formatDate(storeSubscription.nextBillingAt) }]
            : []),
    ];

    return (
        <div className="flex justify-center pt-6">
            <Card className="flex w-full max-w-[500px] flex-col gap-5 p-6 sm:p-10">
                <Badge tone="navy" className="self-start">
                    {t('subscription.entry.storeManaged.badge', { store })}
                </Badge>
                <header className="flex flex-col gap-3">
                    <h1 className="text-2xl font-bold text-navy">{t('subscription.entry.storeManaged.title')}</h1>
                    <p className="text-[15px] leading-relaxed text-subtitle">
                        {t('subscription.entry.storeManaged.body', { store })}
                    </p>
                </header>

                <dl className="flex flex-col gap-3 rounded-xl bg-muted px-5 py-4 text-sm">
                    {rows.map(row => (
                        <div key={row.label} className="flex items-center justify-between">
                            <dt className="text-subtitle">{t(`subscription.entry.storeManaged.${row.label}`)}</dt>
                            <dd className="font-semibold text-navy">{row.value}</dd>
                        </div>
                    ))}
                </dl>

                <div className="rounded-xl border border-border px-5 py-4">
                    <p className="text-sm font-semibold text-navy">
                        {t('subscription.entry.storeManaged.howToTitle', { store })}
                    </p>
                    <p className="mt-1.5 text-[13px] text-desc-alt">
                        {t(`subscription.entry.storeManaged.howTo.${source}`)}
                    </p>
                </div>

                <Button size="lg" className="rounded-full" onClick={() => navigate(ROUTES.root)}>
                    {t('subscription.entry.storeManaged.confirm')}
                </Button>

                <p className="text-xs leading-relaxed text-subtitle">
                    {t('subscription.entry.storeManaged.moveToWeb')}
                </p>
            </Card>
        </div>
    );
};
