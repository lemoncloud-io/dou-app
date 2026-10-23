import { type JSX, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useRouteError } from 'react-router-dom';

import { Logo } from '@chatic/assets';
import { ERROR_MESSAGES } from '@chatic/shared';

import { ROUTES } from './paths';

/**
 * What a route shows when it throws — a lazy chunk that failed to load is the likely case.
 *
 * Not the shared package's `RouterErrorFallback`, which the web app uses: that one is built from
 * the shared UI kit's buttons and expects the shadcn tokens (`primary`, `ring`, …) this site's
 * Tailwind config does not define.
 *
 * The copy follows the same rule as the shared screens: each line is looked up under
 * `error.screen.*` with the English text as its default. This site's locale files carry no such
 * keys today, so the screen reads English in both languages until someone adds them.
 */
export const RouteErrorFallback = (): JSX.Element => {
    const error = useRouteError();
    const { t } = useTranslation();
    const copy = ERROR_MESSAGES.unknown;

    // The error itself is only for whoever opens the console; the screen stays the same for all.
    useEffect(() => {
        console.error('[RouteErrorFallback]', error);
    }, [error]);

    return (
        <div
            role="alert"
            className="w-full h-full flex flex-col items-center justify-center gap-6 px-6 text-center bg-background"
        >
            <img src={Logo.logo} alt="DoU" className="h-16 w-16 opacity-40" />
            <div className="flex flex-col gap-2">
                <h1 className="text-lg font-semibold text-navy">
                    {t('error.screen.unknown.title', { defaultValue: copy.title })}
                </h1>
                <p className="text-sm text-subtitle">
                    {t('error.screen.unknown.description', { defaultValue: copy.description })}
                </p>
            </div>
            <div className="flex flex-col gap-3 w-full max-w-[280px]">
                <button
                    type="button"
                    onClick={() => window.location.reload()}
                    className="w-full rounded-full bg-main-green text-navy px-5 py-3 font-semibold hover:opacity-90"
                >
                    {t('error.screen.unknown.primaryAction', { defaultValue: copy.primaryAction })}
                </button>
                {/* A full load, not a router link: the router that just failed is the one that would handle it. */}
                <a href={ROUTES.root} className="w-full rounded-full px-5 py-3 text-subtitle hover:text-navy">
                    {t('error.screen.unknown.secondaryAction', { defaultValue: copy.secondaryAction })}
                </a>
            </div>
        </div>
    );
};
