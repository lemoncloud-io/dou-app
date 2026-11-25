import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { logger } from '@chatic/bridges';
import { runtime } from '@chatic/runtime-react';
import { Button, IconClose, InviteLinkCard } from '@chatic/web-ui-kit';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

import { PageHeader } from '../../../ui/components';
import { copyMessageToClipboard } from '../utils/copyMessageToClipboard';

interface InviteLinkViewProps {
    inviteLink: string;
    name: string;
    avatarSrc?: string;
    onClose: () => void;
}

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
        if (shared) {
            onClose();
            return;
        }
        try {
            const { shareSheet } = runtime.links;
            if (shareSheet) {
                shareSheet.open(inviteLink);
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
