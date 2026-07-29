import type { JSX } from 'react';
import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';

import { CloudInviteDialog, RelayInviteDialog } from './invite';
import { isInviteEntry, isRelayInvite, parseInviteDeeplink } from '../types';

interface InviteDialogProps {
    /** When true the popup is withheld (e.g. first-run onboarding takes precedence). */
    suppressed?: boolean;
}

/**
 * Invite-accept entry point, driven by the current URL. Renders nothing unless the link is a
 * fully-formed invite entry (`provider=invite` + `code` + either `_backend` or the `relay` marker),
 * so home can mount it unconditionally; `suppressed` withholds it while a higher-priority overlay
 * (onboarding) is open.
 *
 * Beyond that this is only a router: the issuer's `relay` marker (ADR-0033) picks between the relay
 * 1:1 accept flow (invite.get / phone verification / invite.accept over the sockets) and the existing
 * cloud one (REST accept pipeline — ADR-0016). It deliberately calls no data hooks of its own, so a
 * relay link never fires the cloud invite lookup — which is why the branch lives here rather than
 * inside the cloud orchestrator.
 */
export const InviteDialog = ({ suppressed = false }: InviteDialogProps): JSX.Element | null => {
    const location = useLocation();
    const params = useMemo(() => parseInviteDeeplink(location.search), [location.search]);

    // Not an invite landing, or withheld by a higher-priority overlay: render nothing.
    if (!isInviteEntry(params) || suppressed) return null;

    // `isRelayInvite` implies `isInviteEntry`, which already asserted a non-empty code.
    if (isRelayInvite(params)) return <RelayInviteDialog code={params.code as string} />;

    return <CloudInviteDialog params={params} />;
};
