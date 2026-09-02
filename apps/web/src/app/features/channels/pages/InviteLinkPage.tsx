import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useParams } from 'react-router-dom';

import { isNative, logger } from '@chatic/bridges';
import { useNavigateWithTransition } from '@chatic/shared';
import { Button, IconClose, InviteLinkCard } from '@chatic/web-ui-kit';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

import { appBridge } from '../../../bridge';
import { PageHeader } from '../../../ui/components';
import { ROUTES } from '../../../routes/paths';
import { useChannel } from '../hooks';
import { copyMessageToClipboard } from '../utils/copyMessageToClipboard';
import { getRoomDistance } from '../utils/roomDistance';

interface InviteLinkState {
    inviteLink?: string;
}

/**
 * 초대 링크 페이지 — AddFriendSheet에서 requestInvite로 획득한 Location 링크를 노출하고
 * 복사/공유한다. 링크는 route state로 전달되며, 새로고침 등으로 유실되면 채널 룸으로 복귀한다.
 */
export const InviteLinkPage = () => {
    const { t } = useTranslation();
    const { toast } = useToast();
    const navigate = useNavigateWithTransition();
    const { channelId } = useParams<{ channelId: string }>();
    const { state } = useLocation();
    const inviteLink = (state as InviteLinkState | null)?.inviteLink;
    // room -> [settings ->] invite -> here is at least 2 hops; used to pop the whole flow at once
    // (see roomDistance.ts) instead of leaving settings/invite entries stacked under this page.
    const roomDistance = getRoomDistance(state, 2);

    const { channel } = useChannel(channelId ?? null);
    const [shared, setShared] = useState(false);

    // Route state carries the link; without it there is nothing to show (e.g. after a reload).
    useEffect(() => {
        if (!inviteLink && channelId) {
            navigate(ROUTES.channels.room(channelId), { replace: true });
        }
    }, [inviteLink, channelId, navigate]);

    if (!inviteLink) return null;

    const handleCopy = async () => {
        try {
            await copyMessageToClipboard(inviteLink);
            toast({ title: t('inviteLink.copyDone') });
        } catch (error) {
            logger.error('INVITE', '[InviteLinkPage] copy failed', { error });
            toast({ title: t('inviteFriends.shareFailed'), variant: 'destructive' });
        }
    };

    const handleShare = async () => {
        // Once shared, the CTA turns into "공유 완료" (Figma node 3153-25568) — a second tap
        // means done, not re-share, so it pops the whole invite flow back to the room.
        if (shared) {
            navigate(-roomDistance);
            return;
        }
        try {
            if (isNative()) {
                appBridge.openShareSheet(inviteLink);
            } else {
                await copyMessageToClipboard(inviteLink);
                toast({ title: t('inviteLink.copyDone') });
            }
            setShared(true);
        } catch (error) {
            logger.error('INVITE', '[InviteLinkPage] share failed', { error });
            toast({ title: t('inviteFriends.shareFailed'), variant: 'destructive' });
        }
    };

    return (
        <div className="flex h-full flex-col bg-background pt-safe-top">
            <PageHeader
                title={t('inviteLink.title')}
                hideBack
                rightAction={
                    <button
                        type="button"
                        aria-label={t('inviteLink.close')}
                        onClick={() => navigate(-roomDistance)}
                        className="p-2"
                    >
                        <IconClose className="size-6 text-foreground" strokeWidth={2} />
                    </button>
                }
            />

            <div className="flex flex-1 flex-col gap-6 px-4 pt-4">
                <InviteLinkCard
                    name={channel?.name ?? ''}
                    url={inviteLink}
                    avatarSrc={channel?.thumbnail ?? undefined}
                    onCopy={handleCopy}
                    copyLabel={t('inviteLink.copyLink')}
                />

                <Button tone="green" size="lg" fullWidth onClick={handleShare}>
                    {shared ? `✓ ${t('inviteLink.shared')}` : t('inviteLink.share')}
                </Button>
            </div>
        </div>
    );
};
