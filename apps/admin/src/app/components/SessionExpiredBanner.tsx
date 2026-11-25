import { useSyncExternalStore } from 'react';

import { runtime } from '@chatic/runtime-react';

import { authFailureNotice } from '../session/authFailureNotice';

export const SessionExpiredBanner = () => {
    const expired = useSyncExternalStore(authFailureNotice.subscribe, authFailureNotice.getSnapshot);

    if (!expired) return null;

    return (
        <div className="session-expired-banner" role="alert">
            <span>Your session has expired. The screen was left as-is — log in again to keep working.</span>
            <button type="button" onClick={() => void runtime.session.logoutSession()}>
                Log in again
            </button>
        </div>
    );
};
