import type { JSX } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { AlertDialog, Text } from '@chatic/web-ui-kit';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@chatic/ui-kit/components/ui/dialog';

import { InviteAcceptScreen } from './InviteAcceptScreen';
import { RelayInviteProfileDialog } from './RelayInviteProfileDialog';
// TODO(track-a): replace with the real PhoneVerifyScreen — see trackAMock.tsx for the swap.
import { PhoneVerifyScreen } from './trackAMock';
import { RELAY_INVITE_DECLINE_ENABLED } from '../../flags';
import { useRelayInviteFlow } from '../../hooks';

/** Full-bleed dialog surface shared by the accept screen and the verification step. */
const FULL_SCREEN_CONTENT = 'm-0 flex h-full max-h-[100dvh] w-full max-w-full flex-col items-center rounded-none';

interface RelayInviteDialogProps {
    /** Invite code from the deeplink. A credential — it stays in packet bodies, never in a URL or log. */
    code: string;
}

/**
 * Relay 1:1 invite-accept overlay (ADR-0033). Mounted by InviteDialog when the deeplink carries the
 * `relay` marker; the URL detection and onboarding suppression live there.
 *
 * This is the view layer only — every decision belongs to useRelayInviteFlow, so what is left here is
 * a switch over `phase`. The same full-screen surface hosts the accept screen and the verification
 * step so the flow does not flash the home page between them.
 */
export const RelayInviteDialog = ({ code }: RelayInviteDialogProps): JSX.Element | null => {
    const { t } = useTranslation();
    const flow = useRelayInviteFlow(code);

    // Already navigated home — the URL still carries the code for one more render.
    if (flow.phase === 'closed') return null;

    // Terminal: expired / already joined / invalid / wrong number / taken. Red title per Figma.
    if (flow.phase === 'notice' && flow.notice) {
        return (
            <AlertDialog
                open
                onOpenChange={next => !next && flow.dismissNotice()}
                title={<span className="text-destructive">{t(`inviteAccept.dialog.${flow.notice}.title`)}</span>}
                description={t(`inviteAccept.dialog.${flow.notice}.description`)}
                confirmLabel={t('inviteAccept.confirm')}
                onConfirm={flow.dismissNotice}
            />
        );
    }

    if (flow.phase === 'profiling') {
        return <RelayInviteProfileDialog onDone={flow.onProfileSaved} onExit={flow.cancelStep} />;
    }

    if (flow.phase === 'verifying') {
        return (
            <Dialog open onOpenChange={next => !next && flow.cancelStep()}>
                <DialogContent className={FULL_SCREEN_CONTENT} style={{ padding: 0 }} hideClose variant="slide-up">
                    <DialogTitle className="sr-only">{t('relayInviteAccept.verifyTitle')}</DialogTitle>
                    <DialogDescription className="sr-only">{t('inviteAccept.description')}</DialogDescription>
                    <PhoneVerifyScreen
                        context="invite-accept"
                        inviteCode={code}
                        onVerified={flow.onVerified}
                        onClose={flow.cancelStep}
                    />
                </DialogContent>
            </Dialog>
        );
    }

    const isBusy = flow.phase === 'submitting' || flow.phase === 'awaitingChannel';

    return (
        <Dialog open onOpenChange={next => !next && flow.close()}>
            <DialogContent
                // Same full-bleed treatment as the cloud accept screen: the shared `slide-up` variant
                // bakes in safe-area padding that this branded surface applies internally instead, and
                // the custom `pt-safe-*` utilities survive tailwind-merge, so zero it inline.
                className={`${FULL_SCREEN_CONTENT} bg-background`}
                style={{ padding: 0 }}
                hideClose
                variant="slide-up"
            >
                <DialogTitle className="sr-only">{t('inviteAccept.title')}</DialogTitle>
                <DialogDescription className="sr-only">{t('inviteAccept.description')}</DialogDescription>

                <InviteAcceptScreen
                    inviterName={flow.invite?.inviter$?.name}
                    inviterImage={flow.invite?.inviter$?.image}
                    expiredAt={flow.invite?.expiredAt}
                    countdown={flow.countdown}
                    targetKind="oneToOne"
                    isAccepting={isBusy}
                    onAccept={flow.accept}
                    onClose={flow.close}
                    onDecline={flow.decline}
                    showDecline={RELAY_INVITE_DECLINE_ENABLED}
                    overlay={
                        // The accept succeeded but the room is built asynchronously and can take a
                        // few seconds; hold the surface rather than dropping the user on home.
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
            </DialogContent>
        </Dialog>
    );
};
