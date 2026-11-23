import { type JSX, type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';

import { Logo } from '@chatic/assets';

import chevronLeft from '../../../../assets/subscription/chevron-left.svg';
import { ROUTES } from '../../../routes/paths';
import { useCurrentSubscription, useGoBack, useSession } from '../hooks';
import { useSupports, useToday } from '../lib/port';
import { useManagementScreens } from '../lib/screens';
import { sceneOf } from '../lib/sceneOf';
import { cn, formatDate } from '../utils';
import { AccountMenu } from './AccountMenu';
import { AccountTitleContext } from './PageHeader';

const MENU = [
    { to: ROUTES.subscription.root, key: 'manage', end: true },
    { to: ROUTES.subscription.paymentMethods, key: 'paymentMethods', end: false, screen: 'cards' },
    { to: ROUTES.subscription.history, key: 'history', end: false, needs: 'listInvoices' },
    { to: ROUTES.subscription.billingInfo, key: 'billingInfo', end: false, screen: 'emails' },
] as const;

const itemClass = ({ isActive }: { isActive: boolean }) =>
    cn(
        'shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-[13px] leading-[1.3] transition-colors',
        'md:rounded-lg md:px-3.5 md:py-2.5 md:text-sm md:leading-normal',
        isActive
            ? 'bg-navy font-bold text-white md:bg-[#f7fbe6] md:text-ink'
            : 'bg-line font-semibold text-mute hover:text-ink md:bg-transparent md:font-medium'
    );

export const AccountShell = ({ children }: { children?: ReactNode }): JSX.Element => {
    const { t } = useTranslation();
    const location = useLocation();
    const session = useSession();
    const { subscription, plan } = useCurrentSubscription();
    const today = useToday();
    const screens = useManagementScreens();
    const supports = useSupports();
    const [pageTitle, setPageTitle] = useState<string>();
    const cancellable = !!subscription && sceneOf(subscription, today).actions.includes('cancel');
    const onCancel = location.pathname.endsWith('/cancel');
    const inManage = !onCancel && !MENU.slice(1).some(item => location.pathname.startsWith(item.to));

    const back = useGoBack();

    return (
        <AccountTitleContext.Provider value={setPageTitle}>
            <div className="flex h-full flex-col overflow-auto bg-background md:flex-row md:overflow-hidden">
                <aside className="relative flex shrink-0 flex-col bg-background md:w-[286px] md:justify-between md:border-r md:border-line md:px-4 md:py-6">
                    <div className="flex h-[60px] items-center border-b border-surface p-2 md:hidden">
                        <button
                            type="button"
                            aria-label={t('subscription.common.actions.back')}
                            onClick={back}
                            className="flex size-11 shrink-0 items-center justify-center"
                        >
                            <img src={chevronLeft} alt="" aria-hidden className="size-6" />
                        </button>
                        <p className="min-w-0 flex-1 truncate text-center text-base font-semibold leading-normal text-[#222325]">
                            {pageTitle ?? t('subscription.common.sidebar.manage')}
                        </p>
                        <span className="w-11 shrink-0" aria-hidden />
                    </div>

                    <div className="flex flex-col md:flex-1 md:gap-6">
                        <Link to={ROUTES.root} className="hidden w-fit hover:opacity-80 md:flex md:items-center">
                            <img src={Logo.logo} alt="DoU" className="size-[38px]" />
                            <img src={Logo.douBk} alt="D.U" className="ml-2 h-4" />
                        </Link>
                        <div className="hidden flex-col gap-1.5 px-3.5 pb-4 md:flex">
                            {subscription && plan ? (
                                <>
                                    <p className="text-[15px] font-bold tracking-[-0.005em] text-ink">
                                        {t('subscription.common.planName', { sort: plan.sort })}
                                    </p>
                                    {subscription.nextBillingAt && (
                                        <p className="text-[13px] font-medium text-mute">
                                            {t('subscription.common.sidebar.summary', {
                                                date: formatDate(subscription.nextBillingAt),
                                            })}
                                        </p>
                                    )}
                                </>
                            ) : (
                                <p className="text-[13px] font-medium text-mute">
                                    {t('subscription.common.sidebar.noSubscription')}
                                </p>
                            )}
                        </div>
                        <nav className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden border-b border-line px-4 py-2 md:flex-1 md:flex-col md:gap-1 md:overflow-visible md:border-b-0 md:p-0">
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
                                        itemClass({ isActive: item.key === 'manage' ? inManage : isActive })
                                    }
                                >
                                    {t(`subscription.common.sidebar.${item.key}`)}
                                </NavLink>
                            ))}
                            {cancellable && (
                                <Link
                                    to={ROUTES.subscription.cancel(subscription.id)}
                                    className={cn(
                                        'shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-[13px] leading-[1.3] md:mt-auto md:rounded-lg md:px-3.5 md:py-2.5 md:leading-normal',
                                        onCancel
                                            ? 'bg-navy font-bold text-white md:bg-[#f7fbe6] md:text-ink'
                                            : 'bg-line font-semibold text-mute md:bg-transparent md:font-medium md:hover:text-ink'
                                    )}
                                >
                                    {t('subscription.common.sidebar.cancel')}
                                </Link>
                            )}
                        </nav>
                    </div>

                    {session.data && (
                        <div className="absolute right-2 top-2 md:static md:px-3.5 md:pt-3">
                            <AccountMenu account={session.data} placement="above" />
                        </div>
                    )}
                </aside>
                <main className="min-w-0 flex-1 px-4 pb-8 pt-6 md:overflow-auto md:p-10">{children ?? <Outlet />}</main>
            </div>
        </AccountTitleContext.Provider>
    );
};
