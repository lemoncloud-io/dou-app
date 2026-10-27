import { type JSX } from 'react';
import { useTranslation } from 'react-i18next';

import { storeUrls } from '../../../config/links';
import { useDeviceDetect } from '../../../hooks';

/**
 * W-23. On a phone the subscription is bought and managed in the app, through the store; the web
 * pages are for a desktop browser. This replaces every subscription page below the `md` breakpoint.
 * The app button goes to the store listing for the phone in hand (the App Store when it cannot tell).
 *
 * Where the account surface is shut (`account` false) nothing can be bought on a desktop either, so
 * the card pointing there is left out.
 */
export const DesktopOnlyNotice = ({ account = true }: { account?: boolean }): JSX.Element => {
    const { t } = useTranslation();
    const device = useDeviceDetect();
    const appUrl = device === 'android' ? storeUrls.android : storeUrls.ios;

    return (
        <main className="min-h-full bg-background px-6 py-8">
            <h1 className="mb-6 text-2xl font-bold text-navy">{t('subscription.common.desktopOnly.title')}</h1>
            <section className="mb-4 rounded-2xl border border-border p-5">
                <h2 className="mb-2 font-semibold text-navy">{t('subscription.common.desktopOnly.appTitle')}</h2>
                <p className="mb-4 text-sm leading-relaxed text-desc-alt">
                    {t('subscription.common.desktopOnly.appBody')}
                </p>
                <a
                    href={appUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex h-12 w-full items-center justify-center rounded-xl bg-main-green font-semibold text-navy hover:opacity-90"
                >
                    {t('subscription.common.desktopOnly.openApp')}
                </a>
            </section>
            {account && (
                <section className="rounded-2xl bg-muted p-5">
                    <h2 className="mb-2 font-semibold text-navy">{t('subscription.common.desktopOnly.pcTitle')}</h2>
                    <p className="text-sm leading-relaxed text-desc-alt">
                        {t('subscription.common.desktopOnly.pcBody')}
                    </p>
                </section>
            )}
        </main>
    );
};
