import { type JSX, type ReactNode, createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Outlet, useLocation } from 'react-router-dom';

import { Logo } from '@chatic/assets';

import chevronLeft from '../../../../assets/subscription/chevron-left.svg';
import { ROUTES } from '../../../routes/paths';
import { useGoBack, useSession } from '../hooks';
import { AccountMenu } from './AccountMenu';
import { SiteFooter } from './SiteFooter';

const FLOW_PATHS = [
    ROUTES.subscription.login,
    ROUTES.subscription.checkout,
    ROUTES.subscription.change,
    ROUTES.subscription.storeManaged,
];

const ShellBackContext = createContext<() => () => void>(() => () => undefined);

export const useShellBack = (): void => {
    const claim = useContext(ShellBackContext);
    useEffect(() => claim(), [claim]);
};

export const PublicShell = ({ account = true, children }: { account?: boolean; children?: ReactNode }): JSX.Element => {
    const { t } = useTranslation();
    const session = useSession();
    const { pathname } = useLocation();
    const goBack = useGoBack();
    const flow = FLOW_PATHS.some(path => pathname === path || pathname.startsWith(`${path}/`));
    const onSignIn = pathname === ROUTES.subscription.login || pathname.startsWith(`${ROUTES.subscription.login}/`);
    const ended = pathname === ROUTES.subscription.checkoutStatus || pathname === ROUTES.subscription.checkoutComplete;
    const [backClaims, setBackClaims] = useState(0);
    const claimBack = useCallback(() => {
        setBackClaims(count => count + 1);
        return () => setBackClaims(count => count - 1);
    }, []);

    return (
        <div className="flex h-full flex-col overflow-auto bg-background">
            <header className="sticky top-0 z-30 border-b border-line bg-background">
                <div className="flex h-[60px] items-center gap-6 px-2 sm:h-16 sm:px-12">
                    {flow && (!ended || backClaims > 0) && (
                        <button
                            type="button"
                            aria-label={t('subscription.common.actions.back')}
                            onClick={goBack}
                            className="-mr-4 flex size-11 shrink-0 items-center justify-center"
                        >
                            <img src={chevronLeft} alt="" aria-hidden className="size-6" />
                        </button>
                    )}
                    <Link
                        to={ROUTES.root}
                        className={`mr-auto flex shrink-0 items-center hover:opacity-80 ${flow ? '' : 'max-sm:pl-2'}`}
                    >
                        <img src={Logo.logo} alt="DoU" className="h-8 w-8" />
                        <img src={Logo.douBk} alt="D.U" className="ml-2 h-4" />
                    </Link>
                    {session.data ? (
                        <AccountMenu account={session.data} className="max-sm:pr-2" />
                    ) : (
                        account &&
                        !onSignIn && (
                            <Link
                                to={ROUTES.subscription.login}
                                className="whitespace-nowrap rounded-lg border border-line px-2 py-2 text-[13px] font-semibold text-ink hover:bg-muted max-sm:mr-2 sm:px-4 sm:text-sm"
                            >
                                {t('subscription.common.nav.signIn')}
                            </Link>
                        )
                    )}
                </div>
            </header>
            <main className="mx-auto w-full max-w-[1100px] flex-1 px-4 pb-[62px] pt-6 sm:px-8 sm:pb-[68px] sm:pt-10 min-[1200px]:px-0">
                <ShellBackContext.Provider value={claimBack}>{children ?? <Outlet />}</ShellBackContext.Provider>
            </main>
            {!flow && <SiteFooter />}
        </div>
    );
};
