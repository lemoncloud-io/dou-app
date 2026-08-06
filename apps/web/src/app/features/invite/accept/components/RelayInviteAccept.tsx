import { lazy, Suspense, type JSX } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { AlertDialog, Text } from '@chatic/web-ui-kit';

import { InviteAcceptLoading } from './InviteAcceptLoading';
import { InviteAcceptScreen } from './InviteAcceptScreen';
// Direct file path, not the `channels/components` barrel: that barrel also exports
// AddFriendSheet, which pulls channels/hooks -> @chatic/app-runtime -> chatic-sockets-lib ->
// lemon-model (needs a TextEncoder global this test env doesn't polyfill). Same fix
// InviteWaitingPage.test.tsx documents for the same reason.
import { ConfirmDialog } from '../../../channels/components/ConfirmDialog';
import { PlaceProfileCreateDialog } from '../../../../ui/components/PlaceProfileCreateDialog';
import { useSetMyPlaceProfile } from '../../../../hooks';
import { useActivePlaceName } from '../../../../hooks';
import { useRelayInviteFlow } from '../hooks';

/**
 * Split out because this screen is the ONE eager consumer of `libphonenumber-js` — every other one
 * sits under a `React.lazy` route. `CommonRoutes` deliberately keeps the invite-accept page eager
 * (it is the invitee's first screen), so importing the verify step statically put ~35 kB gzip of
 * number metadata into the initial chunk — measured. `verifying` is never the first phase: the user
 * passes through `loading` and the accept screen first, so the fetch happens off the cold path and
 * ADR-0044's "code-split it so first entry does not pay" holds.
 */
const PhoneVerifyScreen = lazy(() =>
    import('../../../auth/components/PhoneVerifyScreen').then(m => ({ default: m.PhoneVerifyScreen }))
);

interface RelayInviteAcceptProps {
    /** Invite code from the deeplink. A credential — it stays in packet bodies, never in a log. */
    code: string;
}

/**
 * Relay 1:1 invite acceptance (ADR-0033), rendered by InviteAcceptPage when the deeplink carries the
 * `relay` marker; the URL detection lives there.
 *
 * This is the view layer only — every decision belongs to useRelayInviteFlow, so what is left here is
 * a switch over `phase`. Each phase simply takes over the page: no dialog wrapper, because the page
 * IS the surface. The verification step in particular used to be a Dialog nested inside another one,
 * since PhoneVerifyScreen brings its own.
 */
export const RelayInviteAccept = ({ code }: RelayInviteAcceptProps): JSX.Element | null => {
    const { t } = useTranslation();
    const setMyPlaceProfile = useSetMyPlaceProfile();
    const flow = useRelayInviteFlow(code);
    // Branded, so the relay's personal place reads "두유 홈" in the profile title rather than the raw
    // backend name "default" (ADR-0040 decision 7).
    const placeName = useActivePlaceName();

    // Already navigated home — the URL still carries the code for one more render.
    if (flow.phase === 'closed') return null;

    // Rejecting is final (05-client-guide §B-4), so the button only raises this confirm step —
    // the actual invite.reject waits for `confirmDecline` (ADR-0043, Figma 3446-17487).
    if (flow.phase === 'declining') {
        return (
            <ConfirmDialog
                open
                onOpenChange={next => !next && flow.cancelStep()}
                title={t('relayInviteAccept.declineDialog.title')}
                description={t('relayInviteAccept.declineDialog.description')}
                confirmLabel={t('relayInviteAccept.declineDialog.confirm')}
                onConfirm={flow.confirmDecline}
                isPending={flow.isRejecting}
            />
        );
    }

    // Expired / already joined / canceled / rejected / invalid / wrong number / taken. Red title per Figma.
    if (flow.phase === 'notice' && flow.notice) {
        // `generic` is the only recoverable one — it means the failure could not be classified (a
        // half-open socket, a 5xx), not that the invite is spent. Everything else is a verdict about
        // the invite, so offering a retry there would just replay the same answer.
        const isRecoverable = flow.notice === 'generic';
        return (
            <AlertDialog
                open
                onOpenChange={next => !next && flow.dismissNotice()}
                title={<span className="text-destructive">{t(`inviteAccept.dialog.${flow.notice}.title`)}</span>}
                description={t(`inviteAccept.dialog.${flow.notice}.description`)}
                cancelLabel={isRecoverable ? t('inviteAccept.close') : undefined}
                onCancel={isRecoverable ? flow.dismissNotice : undefined}
                confirmLabel={isRecoverable ? t('inviteAccept.retry') : t('inviteAccept.confirm')}
                onConfirm={isRecoverable ? flow.retry : flow.dismissNotice}
            />
        );
    }

    // The mode is the flow's call, not this switch's — a deeplink does not imply a device session,
    // and the server's own 403 can overrule the role cache (see `verifyMode`). `last4` lets a
    // mistyped number fail before a delivery is spent; note the server only cross-checks the WHOLE
    // number on a `login` send, since `link` carries no invite code (§B-2).
    if (flow.phase === 'verifying') {
        return (
            <Suspense fallback={<InviteAcceptLoading />}>
                <PhoneVerifyScreen
                    context="invite-accept"
                    mode={flow.verifyMode}
                    inviteCode={code}
                    inviteLast4={flow.invite?.last4}
                    onVerified={flow.onVerified}
                    onClose={flow.cancelStep}
                />
            </Suspense>
        );
    }

    // Naming yourself is a precondition of the accept, not a gate on the app (ADR-0041): `onExit`
    // shares `cancelStep` with verification because backing out of either means the same thing —
    // return to the review screen, nothing accepted. No `exit` copy, so X leaves at once.
    if (flow.phase === 'profiling') {
        return (
            <PlaceProfileCreateDialog
                onSubmit={setMyPlaceProfile}
                open
                placeName={placeName}
                onDone={flow.onProfileSaved}
                onExit={flow.cancelStep}
            />
        );
    }

    // The entry read is still out: we have the link but not the invitation. Showing the accept screen
    // with every field blank would offer a CTA for an invite we cannot describe yet.
    if (flow.phase === 'loading') return <InviteAcceptLoading />;

    const isBusy = flow.phase === 'submitting' || flow.phase === 'awaitingChannel';

    return (
        <InviteAcceptScreen
            inviterName={flow.invite?.inviter$?.name}
            inviterImage={flow.invite?.inviter$?.image}
            // The invited place. Wired ahead of the data (ADR-0033 D1): `site$` is on the invite
            // contract (`SiteHead` = id + name, extended at runtime with intro/thumbnail) but relay
            // `invite.get` is not known to populate it yet, so the card stays hidden until it does
            // rather than needing a code change on the day it arrives.
            placeName={flow.invite?.site$?.name}
            placeIntro={flow.invite?.site$?.intro}
            placeThumbnail={flow.invite?.site$?.thumbnail}
            countdown={flow.countdown}
            targetKind="oneToOne"
            isAccepting={isBusy}
            onAccept={flow.accept}
            onClose={flow.close}
            onDecline={flow.decline}
            overlay={
                // The accept succeeded but the room is built asynchronously and can take a few
                // seconds; hold the surface rather than dropping the user on home.
                flow.phase === 'awaitingChannel' ? (
                    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-background/70 backdrop-blur-sm">
                        <Loader2 size={28} className="animate-spin text-foreground" />
                        <Text as="p" className="text-[15px] font-medium text-description">
                            {t('relayInviteAccept.preparingRoom')}
                        </Text>
                    </div>
                ) : undefined
            }
        />
    );
};
