import { type JSX, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate } from 'react-router-dom';

import { ROUTES } from '../../../../routes/paths';
import { BillingEmailChangeDialog, EmailCodePolicy, EmailVerificationForm, PageLoader } from '../../components';
import { Badge, Button, Card } from '../../components/ui';
import { useAdoptSignInEmail, useBillingInfo, usePreviewCheckout, useSetPrimaryEmail } from '../../hooks';
import { primaryVerifiedEmail } from '../../lib/billingEmail';
import { isPortError } from '../../lib/port';
import { changePlanUrl, checkoutUrl } from './flow';
import { CheckoutLayout, CheckoutSteps, CheckoutSummary, LoadError } from './parts';
import { usePlanRoute } from './usePlanRoute';
import { commonErrorKey } from '../../lib/errorKey';

import type { BillingEmail } from '../../types';

const k = (key: string) => `subscription.checkout.emailStep.${key}`;

const READ_ONLY_FIELD =
    'h-[47px] min-w-0 flex-1 rounded-lg border border-[#d9dbe0] bg-note px-4 pr-40 text-sm font-medium text-ink outline-none';

export const CheckoutEmailPage = (): JSX.Element => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { loading, error, retry, target: plan, route } = usePlanRoute();
    const preview = usePreviewCheckout(route === 'checkout' ? plan?.id : undefined);
    const billing = useBillingInfo();
    const adopt = useAdoptSignInEmail();
    const setPrimary = useSetPrimaryEmail();

    const [typing, setTyping] = useState(false);
    const [changing, setChanging] = useState(false);
    const [verified, setVerified] = useState<BillingEmail>();
    const [stepError, setStepError] = useState<string>();

    if (loading) return <PageLoader />;
    if (error) return <LoadError error={error} onRetry={retry} />;
    if (!plan) return <Navigate to={ROUTES.subscription.plans} replace />;
    if (route === 'change') return <Navigate to={changePlanUrl(plan.id)} replace />;
    if (route === 'plans') return <Navigate to={ROUTES.subscription.plans} replace />;

    if (preview.isError) return <LoadError error={preview.error} onRetry={preview.refetch} />;
    if (billing.isError) return <LoadError error={billing.error} onRetry={billing.refetch} />;
    if (!preview.data || !billing.data) return <PageLoader />;

    const { account } = preview.data;
    const primary = primaryVerifiedEmail(billing.data);
    const signInAddress = account.provider === 'google' ? account.email : undefined;
    const scene = primary ? 'verified' : signInAddress && !typing ? 'signIn' : 'verify';
    const toDetails = () => navigate(checkoutUrl(plan.id));

    const makePrimary = (email: BillingEmail): Promise<unknown> =>
        email.primary ? Promise.resolve() : setPrimary.mutateAsync(email.id);

    const fail = (err: unknown) => setStepError(errorKeyOf(err));

    const onVerified = (email: BillingEmail) => {
        setVerified(email);
        setStepError(undefined);
        makePrimary(email).catch(fail);
    };

    const next = () => {
        setStepError(undefined);
        if (scene === 'verified') return toDetails();
        if (scene === 'verify') return verified && makePrimary(verified).then(toDetails, fail);
        adopt.mutate(undefined, { onSuccess: email => makePrimary(email).then(toDetails, fail), onError: fail });
    };

    const busy = adopt.isPending || setPrimary.isPending;
    const canContinue = (scene !== 'verify' || !!verified) && !busy;

    return (
        <CheckoutLayout
            head={
                <>
                    <CheckoutSteps current={3} />
                    <header className="flex flex-col gap-2">
                        <h1 className="text-[22px] font-bold leading-[1.5] text-ink md:text-[28px]">{t(k('title'))}</h1>
                        <p className="text-sm font-medium leading-[1.5] text-mute md:text-[15px]">{t(k('subtitle'))}</p>
                    </header>
                </>
            }
            summary={<CheckoutSummary preview={preview.data} />}
        >
            <Card className="flex flex-col gap-2 rounded-[14px] border-line p-4 md:rounded-2xl md:px-[25px] md:py-[21px]">
                {scene === 'verify' ? (
                    <EmailVerificationForm
                        idPrefix="checkout-email"
                        label={<FieldLabel />}
                        onVerified={onVerified}
                        onReset={() => setVerified(undefined)}
                        addressNote={
                            account.provider === 'apple' ? (
                                <p className="text-xs font-medium text-mute">ⓘ {t(k('appleNote'))}</p>
                            ) : undefined
                        }
                    />
                ) : (
                    <>
                        <label htmlFor="checkout-email-address">
                            <FieldLabel />
                        </label>
                        <div className="flex flex-wrap gap-2">
                            <div className="relative flex min-w-0 flex-1">
                                <input
                                    id="checkout-email-address"
                                    type="email"
                                    readOnly
                                    className={READ_ONLY_FIELD}
                                    value={scene === 'verified' ? primary?.address : signInAddress}
                                />
                                <Badge className="absolute right-3 top-1/2 -translate-y-1/2 bg-[#e5f7eb] px-2 py-0.5 font-semibold text-[#218c4d]">
                                    ✓{' '}
                                    {scene === 'verified'
                                        ? t('subscription.common.email.verified')
                                        : t(k('signInChip'))}
                                </Badge>
                            </div>
                            {scene === 'verified' ? (
                                <Button variant="secondary" size="lg" onClick={() => setChanging(true)}>
                                    {t(k('change'))}
                                </Button>
                            ) : (
                                <Button variant="secondary" size="lg" disabled={busy} onClick={() => setTyping(true)}>
                                    {t(k('useOther'))}
                                </Button>
                            )}
                        </div>
                        <p className="text-xs font-medium text-[#218c4d]">
                            {t(k(scene === 'verified' ? 'verifiedNote' : 'signInNote'))}
                        </p>
                        <EmailCodePolicy />
                    </>
                )}
                {stepError && (
                    <p role="alert" className="text-xs font-medium text-[#c1292e]">
                        {t(stepError)}
                    </p>
                )}
            </Card>

            <div className="flex flex-col items-center gap-3">
                <Button size="lg" className="w-full max-md:h-[54px]" disabled={!canContinue} onClick={next}>
                    {t(k('next'))}
                </Button>
                {!canContinue && scene === 'verify' && (
                    <p className="text-xs font-medium text-mute">{t(k('nextHint'))}</p>
                )}
            </div>

            {changing && primary && (
                <BillingEmailChangeDialog current={primary} where="checkout" onClose={() => setChanging(false)} />
            )}
        </CheckoutLayout>
    );
};

const errorKeyOf = (err: unknown): string => {
    if (isPortError(err, 'limit')) return 'subscription.common.email.error.limit';
    return commonErrorKey(err);
};

const FieldLabel = (): JSX.Element => {
    const { t } = useTranslation();
    return (
        <span className="mb-2 flex flex-col gap-3">
            <span className="flex items-center gap-2 text-[13px] font-bold text-ink">
                {t(k('label'))}
                <span className="text-xs font-semibold text-[#c1292e]">
                    {t('subscription.checkout.consent.required')}
                </span>
            </span>
            <span className="text-[13px] font-medium leading-[1.6] text-mute">{t(k('description'))}</span>
        </span>
    );
};
