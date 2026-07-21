import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { X } from 'lucide-react';

import { logger } from '@chatic/bridges';
import { useSessionIdentity } from '@chatic/web-core';
import { Button } from '@chatic/ui-kit/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@chatic/ui-kit/components/ui/dialog';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';
import { TextField } from '@chatic/web-ui-kit';

import { useMyProfile } from '../../../hooks';
import { useChannel, useJoinMutations } from '../hooks';

interface SelfChatNameDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    channelId?: string;
}

// Self-chat names live on the per-user join `nick`, capped at 20 characters
// (Figma 3165-26764). An empty value clears the custom name so the title falls
// back to the owner's name.
const MAX_NAME_LENGTH = 20;

/**
 * Edit a self-chat ("나와의 채팅") name. Unlike {@link UpdateChannelDialog} (which
 * edits `channel.name` + thumbnail via `channel.update`), this writes the current
 * user's join `nick` via `join.update` (ADR-0026) and is name-only.
 */
export const SelfChatNameDialog = ({ open, onOpenChange, channelId }: SelfChatNameDialogProps) => {
    const { t } = useTranslation();
    const { channel } = useChannel(channelId ?? null);
    const { updateJoin, isPending } = useJoinMutations();
    const { userId } = useSessionIdentity();
    const { profile } = useMyProfile();
    const { toast } = useToast();

    // A self-chat's default name (when no custom join nick is set) is my place-profile nick, so
    // surface it as the placeholder — the same fallback identity used by useSelfChatTitle.
    const placeProfileName = profile?.nick;

    const [name, setName] = useState('');

    // Prefill with the current nick each time the dialog opens.
    useEffect(() => {
        if (open) setName(channel?.$join?.nick ?? '');
    }, [open, channel]);

    const handleSubmit = async () => {
        if (!channelId) return;

        // For a self-chat the only member/join is mine; prefer the join's userId
        // and fall back to the session identity.
        const joinUserId = channel?.$join?.userId ?? userId;
        if (!joinUserId) return;

        try {
            // ChannelUpdateJoinInput types only channelId/joinId/notify; the engine
            // resolves the join row from channelId + userId at write time, so pass
            // userId + nick via a cast (mirrors the settings notify toggle).
            await updateJoin({ channelId, userId: joinUserId, nick: name.trim() } as never);
            toast({ title: t('selfChat.name.success') });
            onOpenChange(false);
        } catch (error) {
            logger.error('CHAT', 'Failed to update self-chat name', { error, data: { channelId } });
            toast({ title: t('selfChat.name.error'), variant: 'destructive' });
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className="m-0 flex w-full max-w-full flex-col rounded-none bg-background"
                hideClose
                variant="slide-up"
            >
                <DialogDescription className="sr-only">Edit self-chat name</DialogDescription>
                {/* Top Bar */}
                <div className="flex items-center justify-between bg-background px-1.5 py-3">
                    <div className="h-11 w-11" />
                    <DialogTitle className="text-[16px] font-semibold leading-[1.625] tracking-[0.005em] text-foreground">
                        {t('selfChat.name.title')}
                    </DialogTitle>
                    <button onClick={() => onOpenChange(false)} className="flex h-11 w-11 items-center justify-center">
                        <X className="h-6 w-6 text-foreground" />
                    </button>
                </div>

                {/* Content */}
                <form
                    onSubmit={event => {
                        event.preventDefault();
                        void handleSubmit();
                    }}
                    className="flex flex-1 flex-col overflow-auto"
                >
                    <div className="flex flex-col gap-6 pt-6">
                        <TextField
                            label={t('selfChat.name.label')}
                            value={name}
                            onChange={setName}
                            maxLength={MAX_NAME_LENGTH}
                            placeholder={placeProfileName || t('selfChat.name.placeholder')}
                            description={t('selfChat.name.helper')}
                        />
                    </div>

                    {/* Bottom Button */}
                    <div className="mt-auto">
                        <div className="flex flex-col gap-4 px-4 pb-4 pt-5">
                            <Button
                                type="submit"
                                disabled={isPending.update}
                                className="flex h-[50px] items-center justify-center gap-1.5 rounded-full bg-[#B0EA10] px-6 py-3 text-[16px] font-semibold leading-[1.375] tracking-[0.005em] text-[#222325] hover:bg-[#9DD00E] disabled:bg-muted disabled:text-muted-foreground"
                            >
                                {isPending.update ? t('selfChat.name.saving') : t('selfChat.name.done')}
                            </Button>
                        </div>
                        <div
                            className="shrink-0 touch-none bg-background"
                            style={{ height: 'var(--keyboard-height, 0px)' }}
                            onTouchMove={e => e.preventDefault()}
                        />
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
};
