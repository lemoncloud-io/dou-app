import type { JSX } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { AlertDialog, Text } from '@chatic/web-ui-kit';

import { InviteAcceptLoading } from './InviteAcceptLoading';
import { InviteAcceptScreen } from './InviteAcceptScreen';
import { RelayInviteProfileDialog } from './RelayInviteProfileDialog';
import { PhoneVerifyScreen } from '../../../auth/components';
import { RELAY_INVITE_DECLINE_ENABLED } from '../../flags';
import { useRelayInviteFlow } from '../hooks';

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
    const flow = useRelayInviteFlow(code);

    // Already navigated home — the URL still carries the code for one more render.
    if (flow.phase === 'closed') return null;

    // Expired / already joined / invalid / wrong number / taken. Red title per Figma.
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

    if (flow.phase === 'profiling') {
        return <RelayInviteProfileDialog onDone={flow.onProfileSaved} onExit={flow.cancelStep} />;
    }

    if (flow.phase === 'verifying') {
        return (
            <PhoneVerifyScreen
                context="invite-accept"
                inviteCode={code}
                onVerified={flow.onVerified}
                onClose={flow.cancelStep}
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
            countdown={flow.countdown}
            targetKind="oneToOne"
            isAccepting={isBusy}
            onAccept={flow.accept}
            onClose={flow.close}
            onDecline={flow.decline}
            showDecline={RELAY_INVITE_DECLINE_ENABLED}
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
