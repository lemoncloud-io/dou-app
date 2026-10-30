import { type JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Outlet } from 'react-router-dom';

import { Logo } from '@chatic/assets';

import { ROUTES } from '../../../routes/paths';
import { useSession } from '../hooks';
import { AccountMenu } from './AccountMenu';
import { SiteFooter } from './SiteFooter';

/**
 * The frame for the pages a reader reaches before or while buying: a bar with the logo and either
 * `로그인` or the account menu — 60px on a phone, 64px from `sm` — over the page, with the company
 * footer under it. Not the home page's marketing header: that one floats over a hero and watches the
 * home page's own scroll container.
 *
 * Where the account surface is shut (`account` false) there is no sign-in to offer, so the bar keeps
 * the logo alone.
 */
export const PublicShell = ({ account = true }: { account?: boolean }): JSX.Element => {
    const { t } = useTranslation();
    const session = useSession();

    return (
        <div className="flex h-full flex-col overflow-auto bg-background">
            <header className="sticky top-0 z-30 border-b border-line bg-background">
                <div className="flex h-[60px] items-center gap-6 px-4 sm:h-16 sm:px-12">
                    <Link to={ROUTES.root} className="mr-auto flex shrink-0 items-center hover:opacity-80">
                        <img src={Logo.logo} alt="DoU" className="h-8 w-8" />
                        <img src={Logo.douBk} alt="D.U" className="ml-2 h-4" />
                    </Link>
                    {session.data ? (
                        <AccountMenu account={session.data} />
                    ) : (
                        account && (
                            <Link
                                to={ROUTES.subscription.login}
                                className="whitespace-nowrap rounded-lg border border-line px-2 py-2 text-[13px] font-semibold text-ink hover:bg-muted sm:px-4 sm:text-sm"
                            >
                                {t('subscription.common.nav.signIn')}
                            </Link>
                        )
                    )}
                </div>
            </header>
            <main className="mx-auto w-full max-w-[1100px] flex-1 px-4 pb-[62px] pt-6 sm:px-8 sm:pb-[68px] sm:pt-10 min-[1200px]:px-0">
                <Outlet />
            </main>
            <SiteFooter />
        </div>
    );
};
