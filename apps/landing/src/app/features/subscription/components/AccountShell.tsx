import { type JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, Outlet } from 'react-router-dom';

import { Logo } from '@chatic/assets';

import { ROUTES } from '../../../routes/paths';
import { useCurrentSubscription, useSession } from '../hooks';
import { useSupports, useToday } from '../lib/port';
import { useManagementScreens } from '../lib/screens';
import { sceneOf } from '../lib/sceneOf';
import { cn, formatDate } from '../utils';
import { AccountMenu } from './AccountMenu';

// `screen` names the screens an entry belongs to (`lib/screens.tsx`); `needs`, the port method it is
// left out without.
const MENU = [
    { to: ROUTES.subscription.root, key: 'manage', end: true },
    { to: ROUTES.subscription.paymentMethods, key: 'paymentMethods', end: false, screen: 'cards' },
    { to: ROUTES.subscription.history, key: 'history', end: false, needs: 'listInvoices' },
    { to: ROUTES.subscription.billingInfo, key: 'billingInfo', end: false, screen: 'emails' },
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
    const screens = useManagementScreens();
    const supports = useSupports();
    // The same rule as the detail screen's buttons, so the sidebar never offers what the screen
    // would refuse (a scheduled downgrade, for one, is cancelled from its own card first).
    const cancellable = !!subscription && sceneOf(subscription, today).actions.includes('cancel');

    return (
        // On a phone the sidebar is a bar across the top and the page scrolls as one; from `md` it is
        // the fixed column with its own scrolling main beside it.
        <div className="flex h-full flex-col overflow-auto bg-background md:flex-row md:overflow-hidden">
            <aside className="flex shrink-0 flex-col border-b border-border px-4 py-3 md:w-[200px] md:border-b-0 md:border-r md:px-3 md:py-6">
                <Link to={ROUTES.root} className="mb-3 flex items-center gap-2 px-2 hover:opacity-80 md:mb-6">
                    <img src={Logo.logo} alt="DoU" className="h-7 w-7" />
                    <img src={Logo.douBk} alt="D.U" className="h-4" />
                </Link>
                <div className="mb-3 px-2 md:mb-6">
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
                <nav className="flex flex-row flex-wrap gap-1 md:flex-col">
                    {MENU.filter(
                        item =>
                            (!('screen' in item) || screens[item.screen]) &&
                            (!('needs' in item) || supports(item.needs))
                    ).map(item => (
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
                <div className="mt-3 flex flex-row flex-wrap items-center gap-3 md:mt-auto md:flex-col md:items-stretch">
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
            <main className="min-w-0 flex-1 px-4 py-6 md:overflow-auto md:px-8 md:py-8">
                <Outlet />
            </main>
        </div>
    );
};
