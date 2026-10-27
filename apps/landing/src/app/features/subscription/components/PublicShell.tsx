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
 */
export const PublicShell = (): JSX.Element => {
    const { t } = useTranslation();
    const session = useSession();

    return (
        <div className="flex h-full flex-col overflow-auto bg-background">
            <header className="sticky top-0 z-30 border-b border-border bg-background">
                <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between px-8">
                    <Link to={ROUTES.root} className="flex items-center gap-2 hover:opacity-80">
                        <img src={Logo.logo} alt="DoU" className="h-8 w-8" />
                        <img src={Logo.douBk} alt="D.U" className="h-4" />
                    </Link>
                    <nav className="flex items-center gap-6">
                        <NavLink to={ROUTES.subscription.plans} className={navClass}>
                            {t('subscription.common.nav.plans')}
                        </NavLink>
                        <NavLink to={ROUTES.subscription.root} end className={navClass}>
                            {t('subscription.common.nav.manage')}
                        </NavLink>
                        <NavLink to={ROUTES.policy.refund} className={navClass}>
                            {t('subscription.common.nav.policy')}
                        </NavLink>
                        {session.data ? (
                            <AccountMenu account={session.data} />
                        ) : (
                            <Link
                                to={ROUTES.subscription.login}
                                className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-navy hover:bg-muted"
                            >
                                {t('subscription.common.nav.signIn')}
                            </Link>
                        )}
                    </nav>
                </div>
            </header>
            <main className="mx-auto w-full max-w-[880px] flex-1 px-8 py-10">
                <Outlet />
            </main>
        </div>
    );
};
