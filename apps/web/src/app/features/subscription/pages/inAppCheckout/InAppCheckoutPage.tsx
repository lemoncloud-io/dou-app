import { useMemo, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { runtime } from '@chatic/runtime-react';
import { useNavigateWithTransition } from '@chatic/shared';
import {
    BILLING_COUNTRY_OPTIONS,
    createCardEntryChannel,
    currencyOfCountry,
    formatMoney,
    isPortError,
    payerRequiredIn,
    windowResultOfQuery,
    type BillingCountryOption,
    type Payer,
    type PaymentWindowRequest,
    type PlanId,
    type RegistrationOutcome,
} from '@chatic/web-checkout';
import { Button, IconBack, IconButton, ModalTopBar, ScreenLayout, SelectableCard, TextField } from '@chatic/web-ui-kit';

import { subscriptionKeys } from '../../../../hooks/queryKeys';
import { tabStore } from '../../../../storage';
import { IS_DEV } from '../../consts';
import { CHECKOUT_SANDBOX_KEY, checkoutSandbox, IN_APP_CHECKOUT_PATH } from '../../lib';
import { StandInCardDialog } from './StandInCardDialog';
import { StripeCardPanel } from './StripeCardPanel';
import { buyPlan, createInAppPaymentPort, mainUserOf, type InAppCheckoutOutcome } from './flow';

const PENDING_KEY = 'in-app-checkout.pending';

interface Pending {
    planId: PlanId;
    country: string;
    payer?: Payer;
}

const keepPending = (pending: Pending): void => {
    try {
        tabStore.set(PENDING_KEY, JSON.stringify(pending));
    } catch {
        return;
    }
};

const takePending = (): Pending | null => {
    try {
        const raw = tabStore.get(PENDING_KEY);
        tabStore.remove(PENDING_KEY);
        return raw ? (JSON.parse(raw) as Pending) : null;
    } catch {
        return null;
    }
};

type StandIn = PaymentWindowRequest & { answer: (outcome: RegistrationOutcome) => void };

export const InAppCheckoutPage = () => {
    const { t, i18n } = useTranslation();
    const navigate = useNavigateWithTransition();
    const queryClient = useQueryClient();
    const [search] = useSearchParams();
    const { subscription } = runtime.data.useRuntimeRepositories();
    const sandbox = checkoutSandbox(runtime.checkout, runtime.settings.get(CHECKOUT_SANDBOX_KEY), IS_DEV).on;

    const [standIn, setStandIn] = useState<StandIn | null>(null);
    const cardEntry = useMemo(() => createCardEntryChannel(), []);
    const cardRequest = useSyncExternalStore(cardEntry.subscribe, cardEntry.pending);
    const port = useMemo(
        () =>
            createInAppPaymentPort({
                api: subscription,
                user: () => mainUserOf(runtime.session.getRelaySessionUser()),
                sandbox,
                cardEntry,
                presentStandIn: request =>
                    new Promise<RegistrationOutcome>(answer => setStandIn({ ...request, answer })),
                returnUrl: planId =>
                    `${window.location.origin}${IN_APP_CHECKOUT_PATH}${planId ? `?plan=${planId}` : ''}`,
            }),
        [subscription, sandbox, cardEntry]
    );

    const [country, setCountry] = useState<BillingCountryOption>('KR');
    const [planId, setPlanId] = useState<PlanId | undefined>(undefined);
    const [payer, setPayer] = useState<Payer>({ name: '', phone: '', email: '' });
    const needsPayer = payerRequiredIn(country);

    const session = useQuery({ queryKey: ['in-app-checkout', 'session'], queryFn: () => port.getSession() });
    const plans = useQuery({
        queryKey: ['in-app-checkout', 'plans', country],
        queryFn: () => port.listPlans({ currency: currencyOfCountry(country) }),
        enabled: !!session.data,
    });

    const settled = (outcome: InAppCheckoutOutcome) => {
        if (outcome.step === 'checkout') void queryClient.invalidateQueries({ queryKey: subscriptionKeys.all });
        return outcome;
    };

    const returned = useQuery({
        queryKey: ['in-app-checkout', 'return', search.toString()],
        queryFn: async (): Promise<InAppCheckoutOutcome | null> => {
            const pending = windowResultOfQuery(search) ? takePending() : null;
            if (!pending) return null;
            const card = await port.completePaymentMethodRegistration({
                callback: search,
                purpose: 'start',
                payer: pending.payer,
            });
            if (card.outcome !== 'registered') return { step: 'card', outcome: card.outcome };
            const attempt = await port.startCheckout({ ...pending, card: card.card });
            return settled({ step: 'checkout', attempt });
        },
        enabled: !!session.data,
        staleTime: Infinity,
    });

    const buy = useMutation({
        mutationFn: async () => {
            if (!planId) throw new Error('no plan picked');
            const pending: Pending = { planId, country, payer: needsPayer ? payer : undefined };
            keepPending(pending);
            const outcome = await buyPlan(port, pending);
            takePending();
            return settled(outcome);
        },
    });

    const outcome = buy.data ?? returned.data ?? null;
    const failure = buy.error ?? returned.error ?? session.error ?? plans.error;
    const signedOut =
        (session.isSuccess && !session.data) ||
        (isPortError(failure) && (failure.code === 'unauthenticated' || failure.code === 'notAllowed'));
    const done = outcome?.step === 'checkout' && outcome.attempt.status !== 'failed';
    const payerReady = !needsPayer || (payer.name && payer.phone && payer.email);

    return (
        <ScreenLayout
            header={
                <ModalTopBar
                    safeArea
                    title={t('mypage.subscription.inAppCheckout.title')}
                    leftSlot={
                        <IconButton
                            icon={<IconBack className="size-[26px]" />}
                            label={t('common.back')}
                            onClick={() => navigate(-1)}
                        />
                    }
                />
            }
        >
            {sandbox && (
                <p role="status" className="bg-amber-500 px-4 py-1 text-center text-[13px] font-medium text-white">
                    {t('mypage.subscription.inAppCheckout.sandboxBand')}
                </p>
            )}
            {IS_DEV && (
                <p className="px-4 pt-2 text-center text-[12px] text-muted-foreground">
                    {t('mypage.subscription.inAppCheckout.changeInSettings')}
                </p>
            )}
            <div className="flex flex-col gap-4 px-4 py-5">
                {signedOut && (
                    <p role="alert" className="text-[15px] text-muted-foreground">
                        {t('mypage.subscription.inAppCheckout.signInRequired')}
                    </p>
                )}
                {failure && !signedOut && (
                    <p role="alert" className="text-[15px] text-destructive">
                        {t('mypage.subscription.inAppCheckout.failed')}
                    </p>
                )}
                {done ? (
                    <>
                        <p role="status" className="text-[17px] font-semibold text-foreground">
                            {t('mypage.subscription.inAppCheckout.done')}
                        </p>
                        <Button tone="green" fullWidth onClick={() => navigate(-1)}>
                            {t('common.confirm')}
                        </Button>
                    </>
                ) : (
                    session.data && (
                        <>
                            {outcome && (
                                <p role="alert" className="text-[15px] text-destructive">
                                    {t('mypage.subscription.inAppCheckout.notRegistered')}
                                </p>
                            )}
                            <div className="flex flex-wrap gap-2">
                                {BILLING_COUNTRY_OPTIONS.map(option => (
                                    <Button
                                        key={option}
                                        size="sm"
                                        variant={option === country ? 'solid' : 'outline'}
                                        onClick={() => setCountry(option)}
                                    >
                                        {option}
                                    </Button>
                                ))}
                            </div>
                            {(plans.data ?? []).map(plan => (
                                <SelectableCard
                                    key={plan.id}
                                    title={t('mypage.subscription.inAppCheckout.plan', {
                                        clouds: plan.maxClouds,
                                        price: formatMoney(plan.monthly, i18n.language),
                                    })}
                                    checked={plan.id === planId}
                                    onToggle={() => setPlanId(plan.id)}
                                />
                            ))}
                            {needsPayer && (
                                <>
                                    <TextField
                                        label={t('mypage.subscription.inAppCheckout.payerName')}
                                        value={payer.name}
                                        onChange={name => setPayer({ ...payer, name })}
                                    />
                                    <TextField
                                        label={t('mypage.subscription.inAppCheckout.payerPhone')}
                                        value={payer.phone}
                                        inputMode="tel"
                                        onChange={phone => setPayer({ ...payer, phone })}
                                    />
                                    <TextField
                                        label={t('mypage.subscription.inAppCheckout.payerEmail')}
                                        value={payer.email}
                                        inputMode="email"
                                        onChange={email => setPayer({ ...payer, email })}
                                    />
                                </>
                            )}
                            <Button
                                tone="green"
                                size="lg"
                                fullWidth
                                loading={buy.isPending}
                                disabled={!planId || !payerReady}
                                onClick={() => buy.mutate()}
                            >
                                {t('mypage.subscription.inAppCheckout.subscribe')}
                            </Button>
                        </>
                    )
                )}
            </div>
            {standIn && (
                <StandInCardDialog
                    onAnswer={answer => {
                        setStandIn(null);
                        standIn.answer(answer);
                    }}
                />
            )}
            {cardRequest && <StripeCardPanel channel={cardEntry} request={cardRequest} />}
        </ScreenLayout>
    );
};
