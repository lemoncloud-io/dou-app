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
    /** `above` for the sidebar's foot, where there is no room below. */
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
                className={
                    placement === 'below'
                        ? 'flex max-w-[220px] items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm font-semibold text-navy hover:bg-muted'
                        : 'flex max-w-full items-center gap-2 rounded-full py-1 pl-1 pr-3 text-sm text-navy hover:bg-muted'
                }
            >
                {/* The top bar shows who by name, the sidebar foot by avatar and address. */}
                {placement === 'below' ? (
                    <>
                        <span className="truncate">{account.displayName ?? label}</span>
                        <span aria-hidden className="text-[10px]">
                            ▾
                        </span>
                    </>
                ) : (
                    <>
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-navy text-xs font-semibold text-white">
                            {(account.displayName ?? label).slice(0, 1).toUpperCase()}
                        </span>
                        <span className="truncate">{label}</span>
                    </>
                )}
            </button>
            {open && (
                <div
                    role="menu"
                    className={cn(
                        'absolute z-40 w-64 rounded-xl border border-border bg-card p-2 shadow-lg',
                        placement === 'below' ? 'right-0 top-full mt-2' : 'bottom-full left-0 mb-2'
                    )}
                >
                    <div className="border-b border-border px-3 pb-3 pt-2">
                        <p className="truncate text-sm font-semibold text-navy">{label}</p>
                        <p className="text-xs text-subtitle">{t(`subscription.common.account.${account.provider}`)}</p>
                    </div>
                    <Link
                        role="menuitem"
                        to={ROUTES.subscription.root}
                        onClick={() => setOpen(false)}
                        className="mt-1 block rounded-lg px-3 py-2 text-sm text-navy hover:bg-muted"
                    >
                        {t('subscription.common.account.manage')}
                    </Link>
                    <button
                        role="menuitem"
                        type="button"
                        onClick={onSignOut}
                        disabled={signOut.isPending}
                        className="block w-full rounded-lg px-3 py-2 text-left text-sm text-status-danger hover:bg-muted"
                    >
                        {t('subscription.common.account.signOut')}
                    </button>
                </div>
            )}
        </div>
    );
};
