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

// Button looks on anchors: the store links leave the site and the other account is a route, so
// they are links, not buttons.
const linkButtonClass = cn(
    'inline-flex h-12 items-center justify-center rounded-xl px-5 text-[15px] font-semibold transition-all',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy/40'
);
const storeLinkClass = cn(linkButtonClass, 'flex-1 bg-navy text-white hover:opacity-90');
const otherAccountClass = cn(linkButtonClass, 'border border-border bg-white text-navy hover:bg-muted');

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
            <Card className="flex w-full max-w-[440px] flex-col gap-5 p-6 sm:p-10">
                <header className="flex flex-col gap-3">
                    <h1 className="text-2xl font-bold text-navy">{t('subscription.entry.noAccount.title')}</h1>
                    <p className="text-sm leading-relaxed text-subtitle">{body}</p>
                </header>

                <ol className="flex flex-col gap-2.5 rounded-xl bg-muted px-4 py-4 text-sm font-medium text-desc-alt">
                    {steps.map((step, index) => (
                        <li key={step} className="flex items-center gap-2">
                            <span
                                aria-hidden
                                className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-desc-alt text-[10px] leading-none"
                            >
                                {index + 1}
                            </span>
                            {step}
                        </li>
                    ))}
                </ol>

                <p className="text-[13px] leading-relaxed text-subtitle">
                    {t('subscription.entry.noAccount.phoneUser')} {t('subscription.entry.noAccount.otherProvider')}
                </p>

                <div className="flex flex-col gap-3">
                    <div className="flex flex-wrap gap-3">
                        <a href={storeUrls.ios} target="_blank" rel="noopener noreferrer" className={storeLinkClass}>
                            {t('subscription.entry.store.appStore')}
                        </a>
                        <a
                            href={storeUrls.android}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={storeLinkClass}
                        >
                            {t('subscription.entry.store.googlePlay')}
                        </a>
                    </div>
                    <Link to={ROUTES.subscription.login} className={otherAccountClass}>
                        {t('subscription.entry.noAccount.otherAccount')}
                    </Link>
                </div>
            </Card>
        </div>
    );
};
