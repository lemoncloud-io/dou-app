import { type JSX, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';

import { ROUTES } from '../../../routes/paths';
import { useSignOut } from '../hooks';
import { cn } from '../utils';
import { useToast } from './ui';

import type { Account } from '../types';

/** The address an account is shown by: its email, else the masked hint, else the provider's name. */
export const accountLabel = (account: Account, t: (key: string) => string): string =>
    account.email ?? account.emailHint ?? t(`subscription.common.account.${account.provider}`);

const MENU_ITEM = 'block w-full rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-ink hover:bg-muted';

/**
 * The signed-in reader's menu, shared by both shells: who is signed in and how, the way to the
 * subscription list, and signing out. Signing out asks nothing — it is undone by signing in — and
 * lands on the plans with a short notice.
 */
export const AccountMenu = ({
    account,
    placement = 'below',
    className,
}: {
    account: Account;
    /**
     * `above` for the sidebar's foot, where there is no room below, so the menu opens upward and the
     * address shows beside the avatar. On a phone that avatar sits in the shell's top bar instead, and
     * the menu opens downward from it.
     */
    placement?: 'below' | 'above';
    className?: string;
}): JSX.Element => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const toast = useToast();
    const signOut = useSignOut();
    const [open, setOpen] = useState(false);
    const root = useRef<HTMLDivElement>(null);
    const label = accountLabel(account, t);

    useEffect(() => {
        if (!open) return;
        const close = (event: MouseEvent) => {
            if (!root.current?.contains(event.target as Node)) setOpen(false);
        };
        const escape = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
        document.addEventListener('mousedown', close);
        document.addEventListener('keydown', escape);
        return () => {
            document.removeEventListener('mousedown', close);
            document.removeEventListener('keydown', escape);
        };
    }, [open]);

    const onSignOut = () => {
        setOpen(false);
        signOut.mutate(undefined, {
            onSuccess: () => {
                navigate(ROUTES.subscription.plans);
                toast(t('subscription.common.account.signedOut'));
            },
            onError: () => toast(t('subscription.common.error.unknown')),
        });
    };

    return (
        <div ref={root} className={cn('relative', className)}>
            <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={open}
                aria-label={t('subscription.common.account.menu')}
                onClick={() => setOpen(value => !value)}
                className={cn('flex items-center gap-2.5', placement === 'above' && 'max-w-full')}
            >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-[#dfe0e2] bg-white text-lg font-bold text-ink">
                    {(account.displayName ?? label).slice(0, 1).toUpperCase()}
                </span>
                {/* The sidebar foot says who by address too; the top bar's avatar stands alone. */}
                {placement === 'above' && (
                    <span className="truncate text-[13px] font-semibold text-[#4d4f57] max-md:hidden">{label}</span>
                )}
            </button>
            {open && (
                <div
                    role="menu"
                    className={cn(
                        'absolute right-0 top-full z-40 mt-2 w-[220px] rounded-2xl border border-line bg-card p-2 shadow-lg',
                        placement === 'above' && 'md:bottom-full md:left-0 md:right-auto md:top-auto md:mb-2 md:mt-0'
                    )}
                >
                    <div className="border-b border-line px-3 pb-3 pt-2">
                        <p className="truncate text-sm font-bold text-ink">{label}</p>
                        <p className="mt-0.5 text-xs text-mute">
                            {t(`subscription.common.account.${account.provider}`)}
                        </p>
                    </div>
                    <Link
                        role="menuitem"
                        to={ROUTES.subscription.plans}
                        onClick={() => setOpen(false)}
                        className={cn(MENU_ITEM, 'mt-1')}
                    >
                        {t('subscription.common.nav.plans')}
                    </Link>
                    <Link
                        role="menuitem"
                        to={ROUTES.subscription.root}
                        onClick={() => setOpen(false)}
                        className={MENU_ITEM}
                    >
                        {t('subscription.common.account.manage')}
                    </Link>
                    <button
                        role="menuitem"
                        type="button"
                        onClick={onSignOut}
                        disabled={signOut.isPending}
                        className={MENU_ITEM}
                    >
                        {t('subscription.common.account.signOut')}
                    </button>
                </div>
            )}
        </div>
    );
};
