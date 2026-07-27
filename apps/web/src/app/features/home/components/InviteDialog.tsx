import type { JSX } from 'react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';

import { useNavigateWithTransition } from '@chatic/shared';
import { useInviteInfo } from '@chatic/web-core';
import { AlertDialog } from '@chatic/web-ui-kit';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@chatic/ui-kit/components/ui/dialog';

import { InviteAcceptScreen } from './invite';
import { useSessionLogout } from '../../../runtime/useSessionLogout';
import { useInviteAccept, useInviteCountdown } from '../hooks';
import { isInviteEntry, parseInviteDeeplink } from '../types';
import { ROUTES } from '../../../routes/paths';

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

interface InviteDialogProps {
    /** When true the popup is withheld (e.g. first-run onboarding takes precedence). */
    suppressed?: boolean;
}

/**
 * Self-contained invite-accept overlay driven by the current URL.
 *
 * Renders nothing unless the link is a fully-formed invite entry (`provider=invite` + `code` +
 * `_backend`), so home can mount it unconditionally. `suppressed` withholds it while a
 * higher-priority overlay (onboarding) is open. Dismiss/back strips the query string so the popup
 * cannot reappear. This orchestrator owns the overlay, routing and error dialogs; the visual accept
 * screen lives in the presentational InviteAcceptScreen. The accept pipeline (useInviteAccept) is
 * unchanged.
 */
export const InviteDialog = ({ suppressed = false }: InviteDialogProps): JSX.Element | null => {
    const { t } = useTranslation();
    const location = useLocation();
    const navigate = useNavigateWithTransition();
    const logout = useSessionLogout();

    const params = useMemo(() => parseInviteDeeplink(location.search), [location.search]);

    // Invite metadata (inviter / place / expiry) to populate the screen. Hooks must run before any
    // early return, so these are called unconditionally; the query stays disabled for non-invites.
    const { data: info } = useInviteInfo(params.code, params.backend);
    const { accept, isAccepting, missingDelegator, errorKey } = useInviteAccept({ params, info });
    const countdown = useInviteCountdown(info?.expiredAt);

    // Not an invite landing, or withheld by a higher-priority overlay: render nothing.
    if (!isInviteEntry(params) || suppressed) return null;

    const goHome = () => navigate(ROUTES.home, { replace: true });
    const doLogout = () => logout({ preserveUrl: true });
    // Block dismissal (X / esc / overlay) while the accept pipeline is in flight, so a mid-accept
    // dismissal can't strip the URL and swallow a later failure dialog (mirrors PlaceProfileCreateDialog).
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

    // Accept screen. The invite Head types (UserHead/SiteHead/MyInviteView) only carry id/name, so
    // inviter image, place intro/thumbnail, and member count are not available here — the screen's
    // props are optional and degrade gracefully when omitted.
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
                    placeName={info?.site$?.name}
                    expiredAt={info?.expiredAt}
                    countdown={countdown}
                    isAccepting={isAccepting}
                    onAccept={accept}
                    onClose={requestClose}
                />
            </DialogContent>
        </Dialog>
    );
};
