import { type JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, Outlet } from 'react-router-dom';

import { Logo } from '@chatic/assets';

import { ROUTES } from '../../../routes/paths';
import { useSession } from '../hooks';
import { cn } from '../utils';
import { AccountMenu } from './AccountMenu';

const navClass = ({ isActive }: { isActive: boolean }) =>
    cn('text-sm transition-colors', isActive ? 'font-semibold text-navy' : 'text-subtitle hover:text-navy');

/**
 * The frame for the pages a reader reaches before or while buying: a plain top bar with the logo, the
 * three destinations and either `로그인` or the account menu. Not the home page's marketing header —
 * that one floats over a hero and watches the home page's own scroll container.
 *
 * Where the account surface is shut (`account` false) the bar keeps the plans and the policy and
 * drops the two that lead nowhere there: the subscription list and sign-in.
 */
export const PublicShell = ({ account = true }: { account?: boolean }): JSX.Element => {
    const { t } = useTranslation();
    const session = useSession();

    return (
        <div className="flex h-full flex-col overflow-auto bg-background">
            <header className="sticky top-0 z-30 border-b border-border bg-background">
                {/* On a phone the links drop to a row of their own under the logo and the sign-in. */}
                <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-x-6 gap-y-1 px-4 py-2 sm:h-16 sm:flex-nowrap sm:px-8 sm:py-0">
                    <Link to={ROUTES.root} className="mr-auto flex shrink-0 items-center gap-2 hover:opacity-80">
                        <img src={Logo.logo} alt="DoU" className="h-8 w-8" />
                        <img src={Logo.douBk} alt="D.U" className="h-4" />
                    </Link>
                    <nav className="order-last flex w-full flex-wrap items-center gap-x-5 gap-y-1 pb-1 sm:order-none sm:w-auto sm:flex-nowrap sm:gap-6 sm:pb-0">
                        <NavLink to={ROUTES.subscription.plans} className={navClass}>
                            {t('subscription.common.nav.plans')}
                        </NavLink>
                        {account && (
                            <NavLink to={ROUTES.subscription.root} end className={navClass}>
                                {t('subscription.common.nav.manage')}
                            </NavLink>
                        )}
                        <NavLink to={ROUTES.policy.refund} className={navClass}>
                            {t('subscription.common.nav.policy')}
                        </NavLink>
                    </nav>
                    {session.data ? (
                        <AccountMenu account={session.data} />
                    ) : (
                        account && (
                            <Link
                                to={ROUTES.subscription.login}
                                className="whitespace-nowrap rounded-lg border border-border px-4 py-2 text-sm font-semibold text-navy hover:bg-muted"
                            >
                                {t('subscription.common.nav.signIn')}
                            </Link>
                        )
                    )}
                </div>
            </header>
            <main className="mx-auto w-full max-w-[880px] flex-1 px-4 py-6 sm:px-8 sm:py-10">
                <Outlet />
            </main>
        </div>
    );
};
