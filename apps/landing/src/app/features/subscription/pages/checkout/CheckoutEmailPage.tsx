import { type JSX, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate } from 'react-router-dom';

import { ROUTES } from '../../../../routes/paths';
import { BillingEmailChangeDialog, EmailVerificationForm, PageLoader } from '../../components';
import { Badge, Button, Card } from '../../components/ui';
import { useAdoptSignInEmail, useBillingInfo, usePreviewCheckout, useSetPrimaryEmail } from '../../hooks';
import { primaryVerifiedEmail } from '../../lib/billingEmail';
import { isPortError } from '../../lib/port';
import { changePlanUrl, checkoutUrl } from './flow';
import { CheckoutSteps, CheckoutSummary, LoadError } from './parts';
import { usePlanRoute } from './usePlanRoute';

import type { BillingEmail } from '../../types';

const k = (key: string) => `subscription.checkout.emailStep.${key}`;

const READ_ONLY_FIELD =
    'h-12 min-w-0 flex-1 rounded-lg border border-border bg-muted px-3 pr-40 text-sm text-navy outline-none';

/**
 * W-24 — the email step between sign-in and W-08. The address verified here becomes the primary
 * billing address, which W-08 shows and every payment notice goes to.
 *
 * Three ways in, one way out:
 * - an account that already has a verified primary address sees it verified, with [change] opening
 *   the shared change popup;
 * - a Google sign-in is offered its own address, used as it is without a code;
 * - anyone else — Apple, or Google after "use another email" — verifies an address by code.
 *
 * Every limit the code step shows (lifetime, resend interval, tries) comes from the shared form and
 * the port's ticket; this screen holds none of them.
 */
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
    // An address the form verified, kept until it is the primary: if marking it fails, "next" tries again.
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

    // An address verified here is the billing address from now on. The port marks the first one primary
    // itself; an account whose primary mark sits on an address that is not verified gets it moved here.
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
        <div className="grid grid-cols-[minmax(0,1fr)_260px] gap-8">
            <div className="flex flex-col gap-6">
                <CheckoutSteps current={3} />
                <header className="flex flex-col gap-2">
                    <h1 className="text-[28px] font-bold text-navy">{t(k('title'))}</h1>
                    <p className="text-[15px] text-subtitle">{t(k('subtitle'))}</p>
                </header>

                <Card className="flex flex-col gap-2">
                    {scene === 'verify' ? (
                        <>
                            <EmailVerificationForm
                                idPrefix="checkout-email"
                                label={<FieldLabel />}
                                onVerified={onVerified}
                                onReset={() => setVerified(undefined)}
                            />
                            {account.provider === 'apple' && (
                                <p className="text-xs text-subtitle">ⓘ {t(k('appleNote'))}</p>
                            )}
                        </>
                    ) : (
                        <>
                            <label htmlFor="checkout-email-address">
                                <FieldLabel />
                            </label>
                            <div className="flex gap-2">
                                <div className="relative flex min-w-0 flex-1">
                                    <input
                                        id="checkout-email-address"
                                        type="email"
                                        readOnly
                                        className={READ_ONLY_FIELD}
                                        value={scene === 'verified' ? primary?.address : signInAddress}
                                    />
                                    <Badge tone="success" className="absolute right-3 top-1/2 -translate-y-1/2">
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
                                    <Button
                                        variant="secondary"
                                        size="lg"
                                        disabled={busy}
                                        onClick={() => setTyping(true)}
                                    >
                                        {t(k('useOther'))}
                                    </Button>
                                )}
                            </div>
                            <p className="text-xs text-status-success">
                                {t(k(scene === 'verified' ? 'verifiedNote' : 'signInNote'))}
                            </p>
                            <CodePolicy />
                        </>
                    )}
                    {stepError && (
                        <p role="alert" className="text-xs text-status-danger">
                            {t(stepError)}
                        </p>
                    )}
                </Card>

                <div className="flex flex-col items-center gap-3">
                    <Button size="lg" className="w-full" disabled={!canContinue} onClick={next}>
                        {t(k('next'))}
                    </Button>
                    {!canContinue && scene === 'verify' && <p className="text-xs text-subtitle">{t(k('nextHint'))}</p>}
                </div>
            </div>

            <CheckoutSummary preview={preview.data} />

            {changing && primary && (
                <BillingEmailChangeDialog current={primary} where="checkout" onClose={() => setChanging(false)} />
            )}
        </div>
    );
};

const errorKeyOf = (err: unknown): string => {
    if (isPortError(err, 'limit')) return 'subscription.common.email.error.limit';
    if (isPortError(err, 'network')) return 'subscription.common.error.network';
    return 'subscription.common.error.unknown';
};

/** "Email (required)" and what the address is for, above the field in every scene. */
const FieldLabel = (): JSX.Element => {
    const { t } = useTranslation();
    return (
        <span className="mb-2 flex flex-col gap-3">
            <span className="flex items-center gap-2 text-[15px] font-semibold text-navy">
                {t(k('label'))}
                <span className="text-xs font-normal text-status-danger">
                    {t('subscription.checkout.consent.required')}
                </span>
            </span>
            <span className="text-[13px] font-normal text-subtitle">{t(k('description'))}</span>
        </span>
    );
};

/**
 * The code rules, also shown when no code is asked for, as the designs do. The verification form draws
 * the same box itself in the code scene.
 */
const CodePolicy = (): JSX.Element => {
    const { t } = useTranslation();
    return (
        <div className="mt-1 rounded-lg bg-muted px-4 py-3 text-xs leading-5 text-desc-alt">
            <p>{t('subscription.common.email.policyCode')}</p>
            <p>{t('subscription.common.email.policyResend')}</p>
        </div>
    );
};
