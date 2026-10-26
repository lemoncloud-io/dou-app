import { type JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, Outlet } from 'react-router-dom';

import { Logo } from '@chatic/assets';

import { ROUTES } from '../../../routes/paths';
import { useCurrentSubscription, useSession } from '../hooks';
import { useToday } from '../lib/port';
import { sceneOf } from '../lib/sceneOf';
import { cn, formatDate } from '../utils';
import { AccountMenu } from './AccountMenu';

const MENU = [
    { to: ROUTES.subscription.root, key: 'manage', end: true },
    { to: ROUTES.subscription.paymentMethods, key: 'paymentMethods', end: false },
    { to: ROUTES.subscription.history, key: 'history', end: false },
    { to: ROUTES.subscription.billingInfo, key: 'billingInfo', end: false },
] as const;

/**
 * The frame for managing a subscription already bought: a sidebar with the plan in force, the four
 * management pages, cancelling, and the account menu at its foot. There is no usage or credits entry —
 * that is a later piece of work.
 */
export const AccountShell = (): JSX.Element => {
    const { t } = useTranslation();
    const session = useSession();
    const { subscription, plan } = useCurrentSubscription();
    const today = useToday();
    // The same rule as the detail screen's buttons, so the sidebar never offers what the screen
    // would refuse (a scheduled downgrade, for one, is cancelled from its own card first).
    const cancellable = !!subscription && sceneOf(subscription, today).actions.includes('cancel');

    return (
        <div className="flex h-full bg-background">
            <aside className="flex w-[200px] shrink-0 flex-col border-r border-border px-3 py-6">
                <Link to={ROUTES.root} className="mb-6 flex items-center gap-2 px-2 hover:opacity-80">
                    <img src={Logo.logo} alt="DoU" className="h-7 w-7" />
                    <img src={Logo.douBk} alt="D.U" className="h-4" />
                </Link>
                <div className="mb-6 px-2">
                    {subscription && plan ? (
                        <>
                            <p className="text-sm font-semibold text-navy">
                                {t('subscription.common.planName', { sort: plan.sort })}
                            </p>
                            {subscription.nextBillingAt && (
                                <p className="mt-0.5 text-[11px] text-subtitle">
                                    {t('subscription.common.sidebar.summary', {
                                        date: formatDate(subscription.nextBillingAt),
                                    })}
                                </p>
                            )}
                        </>
                    ) : (
                        <p className="text-xs text-subtitle">{t('subscription.common.sidebar.noSubscription')}</p>
                    )}
                </div>
                <nav className="flex flex-col gap-1">
                    {MENU.map(item => (
                        <NavLink
                            key={item.key}
                            to={item.to}
                            end={item.end}
                            className={({ isActive }) =>
                                cn(
                                    'rounded-lg px-3 py-2 text-sm transition-colors',
                                    isActive
                                        ? 'bg-main-green/15 font-semibold text-navy'
                                        : 'text-subtitle hover:text-navy'
                                )
                            }
                        >
                            {t(`subscription.common.sidebar.${item.key}`)}
                        </NavLink>
                    ))}
                </nav>
                <div className="mt-auto flex flex-col gap-3">
                    {cancellable && (
                        <Link
                            to={ROUTES.subscription.cancel(subscription.id)}
                            className="px-3 text-xs text-subtitle hover:text-navy"
                        >
                            {t('subscription.common.sidebar.cancel')}
                        </Link>
                    )}
                    {session.data && <AccountMenu account={session.data} placement="above" />}
                </div>
            </aside>
            <main className="min-w-0 flex-1 overflow-auto px-8 py-8">
                <Outlet />
            </main>
        </div>
    );
};
