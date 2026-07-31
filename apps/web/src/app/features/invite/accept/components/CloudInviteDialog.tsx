import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';

import { useNavigateWithTransition } from '@chatic/shared';
import { useInviteInfo } from '@chatic/web-core';
import { AlertDialog } from '@chatic/web-ui-kit';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@chatic/ui-kit/components/ui/dialog';

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

interface CloudInviteDialogProps {
    /** Parsed invite deeplink; the router guarantees this is a fully-formed cloud invite entry. */
    params: InviteParams;
}

/**
 * Cloud invite-accept overlay (ADR-0016). Mounted by InviteDialog once the deeplink is known to be a
 * cloud invite rather than a relay 1:1 one — URL detection and the onboarding suppression live in that
 * router, so this component may assume it should render.
 *
 * Dismiss/back strips the query string so the popup cannot reappear. This orchestrator owns the
 * overlay, routing and error dialogs; the visual accept screen lives in the presentational
 * InviteAcceptScreen. The accept pipeline (useInviteAccept) is unchanged.
 */
export const CloudInviteDialog = ({ params }: CloudInviteDialogProps): JSX.Element | null => {
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
    const doLogout = () => logout({ preserveUrl: true });
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
    // intro/thumbnail, member count — see types/invite.ts). Forward all of them: they are optional and
    // the screen degrades gracefully while they are absent, so this wiring is what lets each one light
    // up with no further code change (ADR-0033 D1).
    return (
        <Dialog open onOpenChange={next => !next && requestClose()}>
            <DialogContent
                className="m-0 flex h-full max-h-[100dvh] w-full max-w-full flex-col items-center rounded-none bg-background"
                // The shared `slide-up` variant bakes in `pt-safe-top pb-safe-bottom` so its white
                // sheet content clears the notch/home-indicator. This invite screen is instead a
                // full-bleed branded surface that owns the whole viewport and applies the safe insets
                // internally (header → top, footer → bottom). A className `p-0` can't win here: the
                // custom `pt-safe-*` utilities aren't recognized by tailwind-merge, so both survive and
                // the directional padding wins on CSS source order. Zero it inline so the colored
                // surface reaches the very top/bottom edges (no white safe-area bands).
                style={{ padding: 0 }}
                hideClose
                variant="slide-up"
            >
                <DialogTitle className="sr-only">{t('inviteAccept.title')}</DialogTitle>
                <DialogDescription className="sr-only">{t('inviteAccept.description')}</DialogDescription>

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
            </DialogContent>
        </Dialog>
    );
};
