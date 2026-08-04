import type { JSX, ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { resolveInviteAcceptRedirect } from '../features/invite/accept/lib/inviteEntryRedirect';
import { usePreferenceStore } from '../stores/usePreferenceStore';

interface InviteEntryGateProps {
    /** What to render when this is not an invite landing. Omit to render nothing (the signed-out hold). */
    children?: ReactNode;
}

/**
 * Root-path guard: forwards an invite landing to the accept page before home can mount.
 *
 * Invite links are supposed to reach `/invite/accept` directly, but `/?provider=invite&…` will keep
 * arriving forever — that is the address baked into every already-installed native app, and no store
 * release can change it. Catching it here rather than inside HomePage is the whole point: the
 * redirect happens instead of home's render, so a person arriving on an invitation never pays for the
 * place list, channel list, unread aggregation and membership lookup they are about to navigate away
 * from.
 *
 * Mounted at the root of BOTH route sets. Signed out it wraps nothing, preserving the existing
 * "hold on `/` and wait for the background guest login" behaviour (see PublicRoutes) — except an
 * invite now waits on the accept screen instead of a blank page.
 */
export const InviteEntryGate = ({ children }: InviteEntryGateProps): JSX.Element => {
    const { search } = useLocation();
    const isFirstRun = usePreferenceStore(state => state.isFirstRun);

    // First run keeps onboarding in front, as the popup did when home suppressed it. Holding the
    // redirect rather than the accept screen is what makes that work: home leaves the query string
    // alone, so completing onboarding re-renders this gate and the invite proceeds from here.
    const target = isFirstRun ? null : resolveInviteAcceptRedirect(search);
    if (target) return <Navigate to={target} replace />;

    return <>{children}</>;
};
