import type { JSX, ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { resolveInviteAcceptRedirect } from '../features/invite/accept/lib/inviteEntryRedirect';
import { useOnboarding } from '../hooks';

interface InviteEntryGateProps {
    children?: ReactNode;
}

export const InviteEntryGate = ({ children }: InviteEntryGateProps): JSX.Element => {
    const { search } = useLocation();
    const { isFirstRun } = useOnboarding();

    const target = isFirstRun ? null : resolveInviteAcceptRedirect(search);
    if (target) return <Navigate to={target} replace />;

    return <>{children}</>;
};
