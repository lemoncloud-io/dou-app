import { useState } from 'react';

import { cn } from '@chatic/lib/utils';
import { useWebCoreStore } from '@chatic/web-core';

import { useDebugLogin } from '../../auth/hooks';

const inputClass = cn(
    'h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none',
    'transition-colors focus:border-focus-border disabled:opacity-50'
);

/**
 * Dev-only account switcher docked in the Debug panel. Reuses the auth feature's
 * useDebugLogin so it works post-auth too — /auth/* redirects home once signed in,
 * so navigation can't reach the debug login page; this calls the hook directly,
 * which clears the current cloud session and swaps the profile in place. Lets you
 * jump to e.g. developer@lemoncloud.io to test cross-user notification delivery.
 */
export const DebugAuthPage = () => {
    const currentUid = useWebCoreStore(s => s.profile?.uid ?? '—');
    const currentName = useWebCoreStore(s => s.profile?.$user?.name ?? '');
    const { submit, isSubmitting, isError } = useDebugLogin();
    const [uid, setUid] = useState('developer@lemoncloud.io');
    const [pwd, setPwd] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (isSubmitting || !uid.trim() || !pwd) return;
        void submit(uid.trim(), pwd);
    };

    return (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-4">
            <div className="rounded-xl border border-border bg-card p-3 text-xs text-muted-foreground">
                signed in: <span className="text-foreground">{currentName || currentUid}</span>
                <span className="ml-1 opacity-60">({currentUid})</span>
            </div>

            <label className="flex flex-col gap-1 text-xs font-medium text-label">
                email
                <input
                    type="email"
                    autoComplete="off"
                    value={uid}
                    onChange={e => setUid(e.target.value)}
                    disabled={isSubmitting}
                    className={inputClass}
                />
            </label>

            <label className="flex flex-col gap-1 text-xs font-medium text-label">
                password
                <input
                    type="password"
                    value={pwd}
                    onChange={e => setPwd(e.target.value)}
                    disabled={isSubmitting}
                    className={inputClass}
                />
            </label>

            {isError && <p className="-mt-1 text-xs text-destructive">login failed — check credentials</p>}

            <button
                type="submit"
                disabled={isSubmitting || !uid.trim() || !pwd}
                className={cn(
                    'h-10 rounded-lg bg-primary text-sm font-semibold text-primary-foreground transition-all',
                    'hover:opacity-90 active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100'
                )}
            >
                {isSubmitting ? 'signing in…' : 'Sign in (switch account)'}
            </button>
        </form>
    );
};
