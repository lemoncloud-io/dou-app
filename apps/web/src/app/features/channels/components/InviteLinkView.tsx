import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { isNative, logger } from '@chatic/bridges';
import { Button, IconClose, InviteLinkCard } from '@chatic/web-ui-kit';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

import { appBridge } from '../../../bridge';
import { PageHeader } from '../../../ui/components';
import { copyMessageToClipboard } from '../utils/copyMessageToClipboard';

interface InviteLinkViewProps {
    inviteLink: string;
    /** What the invite is into — the room's, or the place's, name and picture. */
    name: string;
    avatarSrc?: string;
    /** Leaves the whole invite flow: the close button, and the second tap after sharing. */
    onClose: () => void;
}

/**
 * The invite link screen's body: the link card, copy, and share. Shared by the room invite and the
 * place invite, whose pages only decide what the card names and where closing returns to.
 */
export const InviteLinkView = ({ inviteLink, name, avatarSrc, onClose }: InviteLinkViewProps) => {
    const { t } = useTranslation();
    const { toast } = useToast();
    const [shared, setShared] = useState(false);

    const handleCopy = async () => {
        try {
            await copyMessageToClipboard(inviteLink);
            toast({ title: t('inviteLink.copyDone') });
        } catch (error) {
            logger.error('INVITE', '[InviteLinkView] copy failed', { error });
            toast({ title: t('inviteFriends.shareFailed'), variant: 'destructive' });
        }
    };

    const handleShare = async () => {
        // Once shared, the CTA turns into "Share complete" (Figma node 3153-25568) — a second tap
        // means done, not re-share, so it leaves the whole invite flow.
        if (shared) {
            onClose();
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
            logger.error('INVITE', '[InviteLinkView] share failed', { error });
            toast({ title: t('inviteFriends.shareFailed'), variant: 'destructive' });
        }
    };

    return (
        <div className="flex h-full flex-col bg-background">
            <PageHeader
                title={t('inviteLink.title')}
                hideBack
                rightAction={
                    <button type="button" aria-label={t('inviteLink.close')} onClick={onClose} className="p-2">
                        <IconClose className="size-6 text-foreground" strokeWidth={2} />
                    </button>
                }
            />

            <div className="flex flex-1 flex-col gap-6 px-4 pt-4">
                <InviteLinkCard
                    name={name}
                    url={inviteLink}
                    avatarSrc={avatarSrc}
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
