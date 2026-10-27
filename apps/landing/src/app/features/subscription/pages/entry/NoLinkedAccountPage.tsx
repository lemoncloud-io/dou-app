import { type JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';

import { storeUrls } from '../../../../config/links';
import { ROUTES } from '../../../../routes/paths';
import { Card } from '../../components/ui';
import { cn } from '../../utils';

import type { SignInProvider } from '../../types';

/**
 * What the callback page hands over in the history state. Not in the query: the masked address is
 * still a piece of the reader's email, and a URL is copied, logged and shared.
 */
export interface NoLinkedAccountState {
    provider: SignInProvider;
    hint?: string;
}

const readState = (state: unknown): NoLinkedAccountState | undefined => {
    const value = state as Partial<NoLinkedAccountState> | null;
    return value?.provider === 'google' || value?.provider === 'apple'
        ? { provider: value.provider, hint: typeof value.hint === 'string' ? value.hint : undefined }
        : undefined;
};

// The secondary button's look on an anchor: the store links leave the site, so they are links, not buttons.
const storeLinkClass = cn(
    'inline-flex h-12 items-center justify-center rounded-xl border border-border bg-white px-5',
    'text-[15px] font-semibold text-navy transition-all hover:bg-muted'
);

/**
 * W-02b — the provider signed the reader in, but no DoU account is linked to that sign-in. Nothing is
 * bought from here: the way on is the app (install it, sign in with the same account, come back) or
 * another account. Google shows the masked address it was; Apple shares none.
 */
export const NoLinkedAccountPage = (): JSX.Element => {
    const { t } = useTranslation();
    const state = readState(useLocation().state);
    // Reached without the hand-over (a reload in another tab, a typed URL), the page names both.
    const provider = t(`subscription.entry.provider.${state?.provider ?? 'either'}`);

    const body = state?.hint
        ? t('subscription.entry.noAccount.bodyHint', { hint: state.hint, provider })
        : t('subscription.entry.noAccount.body', { provider });
    const steps = [
        t('subscription.entry.noAccount.step1'),
        t('subscription.entry.noAccount.step2', { provider }),
        t('subscription.entry.noAccount.step3'),
    ];

    return (
        <div className="flex justify-center pt-6">
            <Card className="flex w-[520px] flex-col gap-5 p-10">
                <header className="flex flex-col gap-3">
                    <h1 className="text-2xl font-bold text-navy">{t('subscription.entry.noAccount.title')}</h1>
                    <p className="text-[15px] leading-relaxed text-subtitle">{body}</p>
                </header>

                <div className="rounded-xl bg-muted px-4 py-4">
                    <p className="text-sm font-semibold text-navy">{t('subscription.entry.noAccount.stepsTitle')}</p>
                    <ol className="mt-2 flex flex-col gap-1 text-[13px] text-desc-alt">
                        {steps.map((step, index) => (
                            <li key={step}>
                                {index + 1}. {step}
                            </li>
                        ))}
                    </ol>
                </div>

                <div className="flex flex-col gap-1 text-[13px] text-desc-alt">
                    <p className="font-semibold text-navy">{t('subscription.entry.noAccount.otherWaysTitle')}</p>
                    <p>{t('subscription.entry.noAccount.phoneUser', { provider })}</p>
                    <p>{t('subscription.entry.noAccount.otherProvider')}</p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <a href={storeUrls.ios} target="_blank" rel="noopener noreferrer" className={storeLinkClass}>
                        {t('subscription.entry.noAccount.appStore')}
                    </a>
                    <a href={storeUrls.android} target="_blank" rel="noopener noreferrer" className={storeLinkClass}>
                        {t('subscription.entry.noAccount.googlePlay')}
                    </a>
                </div>

                <Link
                    to={ROUTES.subscription.login}
                    className="self-start text-sm font-semibold text-navy underline-offset-2 hover:underline"
                >
                    {t('subscription.entry.noAccount.otherAccount')}
                </Link>
            </Card>
        </div>
    );
};
