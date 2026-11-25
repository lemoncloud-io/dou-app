import { useState, type JSX } from 'react';
import { useTranslation } from 'react-i18next';

import { logger } from '@chatic/bridges';
import { runtime } from '@chatic/runtime-react';
import { AlertDialog } from '@chatic/web-ui-kit';

import { InviteAcceptLoading } from './InviteAcceptLoading';
import { InviteAcceptScreen } from './InviteAcceptScreen';
import { PlaceProfileCreateDialog } from '../../../../ui/components/PlaceProfileCreateDialog';
import { useActivePlaceName, useSetMyPlaceProfile } from '../../../../hooks';
import { useSessionLogout } from '../../../../runtime/useSessionLogout';
import { resolveInviteErrorKey, useInviteAccept } from '../hooks';
import { resolveCloudInviteTargetKind } from '../lib/resolveCloudInviteTargetKind';
import { useInviteCountdown } from '../../hooks/useInviteCountdown';
import type { InviteInfo, InviteParams } from '../types';
import { useStackNavigate } from '../../../../navigation';
import { ROUTES } from '../../../../routes/paths';
import { resolvePlaceDisplayName } from '../../../../utils/resolvePlaceDisplayName';

type InviteDialogVariant = 'expired' | 'alreadyJoined' | 'channelDeleted' | 'inviteCanceled' | 'generic';

const resolveDialogVariant = (errorKey: string | null): InviteDialogVariant | null => {
    if (!errorKey) return null;
    if (errorKey === 'inviteAccept.expired') return 'expired';
    if (errorKey === 'inviteAccept.alreadyUsed') return 'alreadyJoined';
    return 'generic';
};

interface CloudInviteAcceptProps {
    params: InviteParams;
}

export const CloudInviteAccept = ({ params }: CloudInviteAcceptProps): JSX.Element | null => {
    const { t } = useTranslation();
    const enterStack = useStackNavigate();
    const logout = useSessionLogout();

    const { data, error: infoError, fetchStatus } = runtime.session.useInviteInfo(params.code, params.backend);
    const info: InviteInfo | undefined = data;
    const { accept, isAccepting, missingDelegator, errorKey, profilePending, finishProfile } = useInviteAccept({
        params,
        info,
    });
    const setMyPlaceProfile = useSetMyPlaceProfile();
    const activePlaceName = useActivePlaceName();
    const [profileSaveFailed, setProfileSaveFailed] = useState(false);
    const submitProfile = async (value: { nick: string; thumbnail?: string }) => {
        try {
            await setMyPlaceProfile(value);
        } catch (error) {
            setProfileSaveFailed(true);
            throw error;
        }
    };
    const countdown = useInviteCountdown(info?.expiredAt, { minuteUntilImminent: true });

    const goHome = () => enterStack('deeplink', ROUTES.home);
    const doLogout = () => {
        logger.info('AUTH', '[CloudInviteAccept] logout from invite missing-delegator dialog');
        return logout({ preserveUrl: true });
    };
    const requestClose = () => {
        if (!isAccepting) goHome();
    };

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

    if (profilePending) {
        return (
            <PlaceProfileCreateDialog
                open
                placeName={activePlaceName || resolvePlaceDisplayName(info?.site$, { isDefaultCloud: false }, t)}
                dismissible={profileSaveFailed}
                onSubmit={submitProfile}
                onDone={finishProfile}
                onExit={finishProfile}
            />
        );
    }

    const lookupNeverRuns = !info && !infoError && fetchStatus === 'idle';
    const readErrorKey = info
        ? null
        : infoError
          ? resolveInviteErrorKey('read-invite', infoError)
          : lookupNeverRuns
            ? 'inviteAccept.failed'
            : null;
    const variant = resolveDialogVariant(errorKey ?? readErrorKey);
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

    if (!info) return <InviteAcceptLoading />;

    return (
        <InviteAcceptScreen
            inviterName={info.inviter$?.nick?.trim() || undefined}
            inviterImage={info?.inviter$?.image}
            placeName={resolvePlaceDisplayName(info.site$, { isDefaultCloud: false }, t) || undefined}
            placeIntro={info?.site$?.intro}
            placeThumbnail={info?.site$?.thumbnail}
            memberCount={info?.memberCount}
            targetKind={resolveCloudInviteTargetKind(info)}
            targetName={info.channelName?.trim() || undefined}
            countdown={countdown}
            isAccepting={isAccepting}
            onAccept={accept}
            onClose={requestClose}
        />
    );
};
