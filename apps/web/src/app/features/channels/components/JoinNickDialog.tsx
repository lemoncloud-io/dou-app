import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { X } from 'lucide-react';

import { logger } from '@chatic/bridges';
import { useSessionIdentity } from '@chatic/web-core';
import { Button } from '@chatic/ui-kit/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@chatic/ui-kit/components/ui/dialog';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';
import { TextField } from '@chatic/web-ui-kit';

// Direct path, not the `ui/layouts` barrel: the barrel reaches web-core / libs/shared, whose
// `import.meta` the CommonJS test transform cannot parse (directory-structure.md §6).
import { KeyboardSafeAreaSpacer } from '../../../ui/layouts/KeyboardSafeAreaSpacer';
import { useMyProfile } from '../../../hooks';
import { useChannel, useJoinMutations } from '../hooks';

interface JoinNickDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    channelId?: string;
    /** Which room kind is being named — selects the copy namespace. Defaults to the self-chat. */
    variant?: 'self' | 'dm';
    /**
     * The name the room currently falls back to, shown as the placeholder. Omit for a self-chat: it
     * defaults to my own place-profile nick, which is that room's fallback identity.
     */
    fallbackName?: string;
}

// Room names given by a member live on the per-user join `nick`, capped at 20 characters
// (Figma 3165-26764). An empty value clears the custom name so the title falls back down its chain.
const MAX_NAME_LENGTH = 20;

/**
 * Edit MY name for a room — the per-user join `nick`, written via `join.update` (ADR-0026) and
 * invisible to everyone else. Unlike {@link UpdateChannelDialog} (which edits `channel.name` +
 * thumbnail via `channel.update`, i.e. the room name everyone sees), this is name-only and private.
 *
 * Two variants share it because they need exactly the same write with different copy:
 *  - `self` — naming "나와의 채팅"; the fallback is my own place-profile nick
 *  - `dm` — naming a 1:1 room; the fallback is the peer (see resolveDmTitle / ADR-0039)
 */
export const JoinNickDialog = ({
    open,
    onOpenChange,
    channelId,
    variant = 'self',
    fallbackName,
}: JoinNickDialogProps) => {
    const { t } = useTranslation();
    const { channel } = useChannel(channelId ?? null);
    const { updateJoin, isPending } = useJoinMutations();
    const { userId } = useSessionIdentity();
    const { profile } = useMyProfile();
    const { toast } = useToast();

    const copy = variant === 'dm' ? 'dmChat.name' : 'selfChat.name';

    // The name shown when no custom join nick is set — the caller's fallback, or for a self-chat my
    // place-profile nick (the identity the self-chat title chain falls back to — useChannelTitle).
    const placeholderName = fallbackName ?? profile?.nick;

    const [name, setName] = useState('');

    // Prefill with the current nick each time the dialog opens.
    useEffect(() => {
        if (open) setName(channel?.$join?.nick ?? '');
    }, [open, channel]);

    const handleSubmit = async () => {
        if (!channelId) return;

        // `channel.$join` is always MY join row, so prefer its userId and fall back
        // to the session identity.
        const joinUserId = channel?.$join?.userId ?? userId;
        if (!joinUserId) return;

        try {
            // ChannelUpdateJoinInput types only channelId/joinId/notify; the engine
            // resolves the join row from channelId + userId at write time, so pass
            // userId + nick via a cast (mirrors the settings notify toggle).
            await updateJoin({ channelId, userId: joinUserId, nick: name.trim() } as never);
            toast({ title: t(`${copy}.success`) });
            onOpenChange(false);
        } catch (error) {
            logger.error('CHAT', 'Failed to update join nick', { error, data: { channelId, variant } });
            toast({ title: t(`${copy}.error`), variant: 'destructive' });
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className="flex w-full flex-col rounded-none bg-background"
                hideClose
                variant="slide-up"
                // The slide-up variant bakes in `pb-safe-bottom`, but KeyboardSafeAreaSpacer below the
                // CTA already reserves max(safe-bottom - CTA padding, keyboard-height). Keeping both
                // applies the home-indicator inset twice, and with the keyboard up it floats the CTA a
                // full inset above the keyboard. Inline rather than a `pb-0` class: `pb-safe-bottom` is
                // a custom spacing key tailwind-merge doesn't classify as padding-bottom, so both would
                // survive and utility order would decide the winner.
                style={{ paddingBottom: 0 }}
            >
                <DialogDescription className="sr-only">Edit my name for this room</DialogDescription>
                {/* Top Bar */}
                <div className="flex items-center justify-between bg-background px-1.5 py-3">
                    <div className="h-11 w-11" />
                    <DialogTitle className="text-[16px] font-semibold leading-[1.625] tracking-[0.005em] text-foreground">
                        {t(`${copy}.title`)}
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
                            label={t(`${copy}.label`)}
                            value={name}
                            onChange={setName}
                            maxLength={MAX_NAME_LENGTH}
                            placeholder={placeholderName || t(`${copy}.placeholder`)}
                            description={t(`${copy}.helper`)}
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
                                {isPending.update ? t(`${copy}.saving`) : t(`${copy}.done`)}
                            </Button>
                        </div>
                        <KeyboardSafeAreaSpacer />
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
};
