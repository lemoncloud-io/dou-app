import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';

import { logger } from '@chatic/bridges';
import { useNavigateWithTransition } from '@chatic/shared';
import { useInviteInfo } from '@chatic/web-core';
import { AlertDialog } from '@chatic/web-ui-kit';

import { InviteAcceptScreen } from './InviteAcceptScreen';
import { useSessionLogout } from '../../../../runtime/useSessionLogout';
import { useInviteAccept } from '../hooks';
import { useInviteCountdown } from '../../hooks/useInviteCountdown';
import type { InviteInfo, InviteParams } from '../types';
import { ROUTES } from '../../../../routes/paths';

/** Which notice/error dialog to show over the accept screen (single-action AlertDialog). */
type InviteDialogVariant = 'expired' | 'alreadyJoined' | 'channelDeleted' | 'inviteCanceled' | 'generic';

/**
 * Map the accept-pipeline error key to a notice-dialog variant. Only `expired` is confidently
 * distinguished today; already-joined / channel-deleted / invite-canceled need backend error codes
 * (their UI/copy is ready — see ADR-0016) so they fall back to `generic` until wired. `missingDelegator`
 * is handled separately (it drives a logout action, not a home dismissal).
 */
const resolveDialogVariant = (errorKey: string | null): InviteDialogVariant | null => {
    if (!errorKey) return null;
    if (errorKey === 'inviteAccept.expired') return 'expired';
    return 'generic';
};

interface CloudInviteAcceptProps {
    /** Parsed invite deeplink; the page guarantees this is a fully-formed cloud invite entry. */
    params: InviteParams;
}

/**
 * Cloud invite acceptance (ADR-0016). Rendered by InviteAcceptPage once the deeplink is known to be a
 * cloud invite rather than a relay 1:1 one — the URL detection lives there, so this component may
 * assume it should render.
 *
 * This orchestrator owns the routing and the error dialogs; the visual accept screen lives in the
 * presentational InviteAcceptScreen, and the accept pipeline in useInviteAccept. Dismissing leaves
 * for home, which drops the invite out of the URL so it cannot reappear.
 */
export const CloudInviteAccept = ({ params }: CloudInviteAcceptProps): JSX.Element | null => {
    const { t } = useTranslation();
    const navigate = useNavigateWithTransition();
    const logout = useSessionLogout();

    // Invite metadata (inviter / place / expiry) to populate the screen. Widened to `InviteInfo`, which
    // declares the fields the backend denormalizes into the response but the published `MyInviteView`
    // does not yet carry — all optional, so this is the same widening `useInviteAccept` already takes.
    const { data } = useInviteInfo(params.code, params.backend);
    const info: InviteInfo | undefined = data;
    const { accept, isAccepting, missingDelegator, errorKey } = useInviteAccept({ params, info });
    const countdown = useInviteCountdown(info?.expiredAt);

    const goHome = () => navigate(ROUTES.home, { replace: true });
    const doLogout = () => {
        // A logout that never passes through LogoutPage — worth its own entry so the session end is
        // attributable to the missing-delegator dialog rather than looking like an unexplained drop.
        logger.info('AUTH', '[CloudInviteAccept] logout from invite missing-delegator dialog');
        return logout({ preserveUrl: true });
    };
    // Block dismissal (X / esc / overlay) while the accept pipeline is in flight, so a mid-accept
    // dismissal can't strip the URL and swallow a later failure dialog.
    const requestClose = () => {
        if (!isAccepting) goHome();
    };

    // Missing device credential: a dedicated logout-prompt dialog (not a home dismissal).
    if (missingDelegator) {
        return (
            <AlertDialog
                open
                onOpenChange={next => !next && doLogout()}
                title={t('inviteAccept.dialog.missingDelegator.title')}
                description={t('inviteAccept.dialog.missingDelegator.description')}
                confirmLabel={t('auth.logout')}
                onConfirm={doLogout}
            />
        );
    }

    // Invite failure: a single-action notice dialog reflecting the resolved cause (red title per Figma).
    const variant = resolveDialogVariant(errorKey);
    if (variant) {
        return (
            <AlertDialog
                open
                onOpenChange={next => !next && goHome()}
                title={<span className="text-destructive">{t(`inviteAccept.dialog.${variant}.title`)}</span>}
                description={t(`inviteAccept.dialog.${variant}.description`)}
                confirmLabel={t('inviteAccept.confirm')}
                onConfirm={goHome}
            />
        );
    }

    // Accept screen. `InviteInfo` extends the published Head types with the fields the backend
    // denormalizes into the invite response but has not shipped yet (inviter image, place
    // intro/thumbnail, member count — see ./types). Forward all of them: they are optional and
    // the screen degrades gracefully while they are absent, so this wiring is what lets each one light
    // up with no further code change (ADR-0033 D1).
    return (
        <InviteAcceptScreen
            inviterName={info?.inviter$?.name}
            inviterImage={info?.inviter$?.image}
            placeName={info?.site$?.name}
            placeIntro={info?.site$?.intro}
            placeThumbnail={info?.site$?.thumbnail}
            memberCount={info?.memberCount}
            countdown={countdown}
            isAccepting={isAccepting}
            onAccept={accept}
            onClose={requestClose}
        />
    );
};
