import { lazy, Suspense, useEffect, useState, type JSX } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { AlertDialog, Text } from '@chatic/web-ui-kit';

import { InviteAcceptLoading } from './InviteAcceptLoading';
import { InviteAcceptScreen } from './InviteAcceptScreen';
import { ConfirmDialog } from '../../../channels/components/ConfirmDialog';
import { PlaceProfileCreateDialog } from '../../../../ui/components/PlaceProfileCreateDialog';
import { useSetMyPlaceProfile } from '../../../../hooks';
import { useActivePlaceName } from '../../../../hooks';
import { useRelayInviteFlow } from '../hooks';
import { resolvePlaceDisplayName } from '../../../../utils/resolvePlaceDisplayName';

const PhoneVerifyScreen = lazy(() =>
    import('../../../auth/components/PhoneVerifyScreen').then(m => ({ default: m.PhoneVerifyScreen }))
);

interface RelayInviteAcceptProps {
    code: string;
}

export const RelayInviteAccept = ({ code }: RelayInviteAcceptProps): JSX.Element | null => {
    const { t } = useTranslation();
    const setMyPlaceProfile = useSetMyPlaceProfile();
    const flow = useRelayInviteFlow(code);
    const placeName = useActivePlaceName();
    const [profileSaveFailed, setProfileSaveFailed] = useState(false);
    const isProfiling = flow.phase === 'profiling';
    useEffect(() => {
        if (!isProfiling) setProfileSaveFailed(false);
    }, [isProfiling]);
    const submitProfile = async (value: { nick: string; thumbnail?: string }) => {
        try {
            await setMyPlaceProfile(value);
        } catch (error) {
            setProfileSaveFailed(true);
            throw error;
        }
    };

    if (flow.phase === 'closed') return null;

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

    if (flow.phase === 'notice' && flow.notice) {
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

    if (flow.phase === 'profiling') {
        return (
            <PlaceProfileCreateDialog
                onSubmit={submitProfile}
                open
                placeName={placeName}
                dismissible={profileSaveFailed}
                onDone={flow.onProfileSaved}
                onExit={flow.skipProfile}
            />
        );
    }

    if (flow.phase === 'loading') return <InviteAcceptLoading />;

    const isBusy = flow.phase === 'submitting' || flow.phase === 'awaitingChannel';
    const inviterNick = flow.invite?.inviter$?.nick?.trim() || undefined;

    return (
        <InviteAcceptScreen
            inviterName={inviterNick}
            inviterImage={flow.invite?.inviter$?.image}
            placeName={
                flow.invite?.site$
                    ? resolvePlaceDisplayName(flow.invite.site$, { isDefaultCloud: true }, t) || undefined
                    : undefined
            }
            placeIntro={flow.invite?.site$?.intro}
            placeThumbnail={flow.invite?.site$?.thumbnail}
            countdown={flow.countdown}
            targetKind="oneToOne"
            targetName={inviterNick}
            isAccepting={isBusy}
            onAccept={flow.accept}
            onClose={flow.close}
            onDecline={flow.decline}
            overlay={
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
