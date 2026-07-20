import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useParams } from 'react-router-dom';

import { isNative } from '@chatic/bridges';
import { useNavigateWithTransition } from '@chatic/shared';
import { reportError } from '@chatic/web-core';
import { Button, IconClose, InviteLinkCard } from '@chatic/web-ui-kit';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

import { appBridge } from '../../../bridge';
import { PageHeader } from '../../../ui/components';
import { ROUTES } from '../../../routes/paths';
import { toError } from '../../../utils/errors';
import { useChannel } from '../hooks';
import { copyMessageToClipboard } from '../utils/copyMessageToClipboard';

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
            reportError(toError(error));
            toast({ title: t('inviteFriends.shareFailed'), variant: 'destructive' });
        }
    };

    const handleShare = async () => {
        try {
            if (isNative()) {
                appBridge.openShareSheet(inviteLink);
            } else {
                await copyMessageToClipboard(inviteLink);
                toast({ title: t('inviteLink.copyDone') });
            }
            setShared(true);
        } catch (error) {
            reportError(toError(error));
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
                        onClick={() => channelId && navigate(ROUTES.channels.room(channelId), { replace: true })}
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
                    copyLabel={t('inviteLink.copyDone')}
                />

                <Button tone="green" size="lg" fullWidth onClick={handleShare}>
                    {shared ? `✓ ${t('inviteLink.shared')}` : t('inviteLink.share')}
                </Button>
            </div>
        </div>
    );
};
