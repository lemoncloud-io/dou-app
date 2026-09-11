import { useSyncExternalStore } from 'react';

import { runtime } from '@chatic/app-runtime';

import { authFailureNotice } from '../session/authFailureNotice';

/**
 * The console's reaction to a server-confirmed auth failure — a bar, not a redirect.
 *
 * The default runtime reaction is `window.alert` plus a hard jump to `/auth/logout`, which is right
 * for a chat app and wrong here: an admin mid-investigation loses their filters, their pinned rows
 * and their place in a 1,000-row corpus, and the alert blocks the tab while it happens. Nothing is
 * gained by the jump — the screen behind it is still readable, just not refreshable, and the admin
 * is the one who should choose when to leave it.
 *
 * Purely a reader. The reaction that raises the notice is registered at boot (`main.tsx`), not
 * here: a failure can land while this component is unmounted — on the admin gate screen, or before
 * the first console route renders — and a policy that depends on which screen is up is not a
 * policy.
 */
export const SessionExpiredBanner = () => {
    const expired = useSyncExternalStore(authFailureNotice.subscribe, authFailureNotice.getSnapshot);

    if (!expired) return null;

    return (
        <div className="session-expired-banner" role="alert">
            <span>세션이 만료되었습니다. 화면은 그대로 두었으니, 이어서 작업하려면 다시 로그인해 주세요.</span>
            <button type="button" onClick={() => void runtime.session.logoutSession()}>
                다시 로그인
            </button>
        </div>
    );
};
