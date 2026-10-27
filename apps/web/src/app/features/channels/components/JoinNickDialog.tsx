import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { X } from 'lucide-react';

import { logger } from '@chatic/bridges';
import { runtime } from '@chatic/app-runtime';
import { AVATAR_IMAGE, prepareImage } from '@chatic/shared';
import { Button } from '@chatic/ui-kit/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@chatic/ui-kit/components/ui/dialog';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';
import { DefaultAvatar, IconChevronRight, ImageAvatar, ProfileAvatar, Text, TextField } from '@chatic/web-ui-kit';

// Direct path, not the `ui/layouts` barrel: the barrel reaches web-core / libs/shared, whose
// `import.meta` the CommonJS test transform cannot parse (directory-structure.md §6).
import { KeyboardSafeAreaSpacer } from '../../../ui/layouts/KeyboardSafeAreaSpacer';
import { useMyProfile } from '../../../hooks';
import { useChannel, useChannelMutations, useJoinMutations } from '../hooks';
import { resolveChannelAvatar } from '../lib/resolveChannelAvatar';

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
    /** DM only: the peer's avatar for the friend-info header. */
    peerThumbnail?: string | null;
    /** DM only: renders the "left the chat" line under the avatar. */
    peerHasLeft?: boolean;
    /** DM only: opens the re-invite form. Omitted when re-inviting is not available (e.g. a guest). */
    onReinvite?: () => void;
}

// Room names given by a member live on the per-user join `nick`, capped at 20 characters
// (Figma 3165-26764). An empty value clears the custom name so the title falls back down its chain.
const MAX_NAME_LENGTH = 20;

// Same ceiling and encoding as a group room's photo (UpdateChannelDialog): the photo is stored on the
// channel record as a prepared avatar, not uploaded as a file.
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

/**
 * Edit MY name for a room — the per-user join `nick`, written via `join.update` (ADR-0026) and
 * invisible to everyone else. Unlike {@link UpdateChannelDialog} (which edits `channel.name` +
 * thumbnail via `channel.update`, i.e. the room name everyone sees), this is name-only and private.
 *
 * Two variants share it because they need exactly the same write with different copy:
 *  - `self` — naming "Chat with Me"; the fallback is my own place-profile nick
 *  - `dm` — naming a 1:1 room; the fallback is the peer (see resolveDmTitle / ADR-0039)
 *
 * The self variant also sets the room's photo. That one IS `channel.thumbnail`, written with
 * `channel.update` like a group room's photo: a self chat's only member is me, so the room's own
 * photo is seen by nobody else either. Until one is set the room shows my place-profile photo
 * (resolveChannelAvatar), which is what the picker shows too.
 *
 * 'Done' is enabled only when something differs from what the dialog opened with, in both variants.
 */
export const JoinNickDialog = ({
    open,
    onOpenChange,
    channelId,
    variant = 'self',
    fallbackName,
    peerThumbnail,
    peerHasLeft = false,
    onReinvite,
}: JoinNickDialogProps) => {
    const { t } = useTranslation();
    const { channel } = useChannel(channelId ?? null);
    const { updateJoin, isPending } = useJoinMutations();
    const { updateChannel, isPending: isChannelPending } = useChannelMutations();
    const { userId } = runtime.session.useSessionIdentity();
    const { profile } = useMyProfile();
    const { toast } = useToast();

    const isDm = variant === 'dm';
    const copy = isDm ? 'dmChat.name' : 'selfChat.name';

    // The name shown when no custom join nick is set — the caller's fallback, or for a self-chat my
    // place-profile nick (the identity the self-chat title chain falls back to — useChannelTitle).
    const placeholderName = fallbackName ?? profile?.nick;

    const [name, setName] = useState('');
    const [thumbnail, setThumbnail] = useState('');
    const [imageSizeError, setImageSizeError] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const seededRef = useRef(false);

    // Prefill with the current nick and photo once per open. The observed channel re-emits while the
    // dialog is open (background sync), and re-seeding then would throw away a name being typed or a
    // photo just picked.
    useEffect(() => {
        if (open && channel && !seededRef.current) {
            seededRef.current = true;
            setName(channel.$join?.nick ?? '');
            setThumbnail(channel.thumbnail ?? '');
            setImageSizeError(false);
        } else if (!open) {
            // Drop the draft too: the next open must not show (and count as a change) what was typed
            // or picked last time, before the channel has emitted to seed it.
            seededRef.current = false;
            setName('');
            setThumbnail('');
            setImageSizeError(false);
        }
    }, [open, channel]);

    const isNameDirty = name.trim() !== (channel?.$join?.nick ?? '').trim();
    const isPhotoDirty = !isDm && thumbnail !== (channel?.thumbnail ?? '');
    const isSaving = isPending.update || isChannelPending.update;
    const canSubmit = (isNameDirty || isPhotoDirty) && !isSaving;

    const { src: avatarSrc } = resolveChannelAvatar({
        channel: { stereo: 'self', thumbnail },
        myThumbnail: profile?.thumbnail,
    });

    const handleImageChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        if (file.size > MAX_IMAGE_SIZE) {
            setImageSizeError(true);
            return;
        }
        setImageSizeError(false);
        try {
            const { avatar: base64 } = await prepareImage(file, AVATAR_IMAGE);
            if (!base64) throw new Error('Failed to prepare avatar image');
            setThumbnail(base64);
        } catch (error) {
            // Size and type separate a codec failure from an oversized file; the contents are never logged.
            logger.warn('CHANNEL', 'self chat image encoding failed', {
                error,
                data: { sizeBytes: file.size, type: file.type },
            });
            setImageSizeError(true);
        }
    };

    const handleSubmit = async () => {
        if (!channelId || !canSubmit) return;

        // `channel.$join` is always MY join row, so prefer its userId and fall back to the session
        // identity. Resolved before any write, so a name that cannot be written never follows a photo
        // that already was.
        const joinUserId = channel?.$join?.userId ?? userId;
        if (isNameDirty && !joinUserId) {
            toast({ title: t(`${copy}.error`), variant: 'destructive' });
            return;
        }

        if (isPhotoDirty) {
            try {
                await updateChannel({ channelId, thumbnail } as never);
            } catch (error) {
                logger.error('CHAT', 'Failed to update self chat photo', { error, data: { channelId } });
                toast({ title: t('selfChat.name.infoError'), variant: 'destructive' });
                return;
            }
            if (!isNameDirty) {
                toast({ title: t('selfChat.name.infoSuccess') });
                onOpenChange(false);
                return;
            }
        }

        if (!joinUserId) return;

        try {
            // ChannelUpdateJoinInput types only channelId/joinId/notify; the engine
            // resolves the join row from channelId + userId at write time, so pass
            // userId + nick via a cast (mirrors the settings notify toggle).
            const { delivered } = await updateJoin({ channelId, userId: joinUserId, nick: name.trim() } as never);
            // Done locally now and sent when the socket can carry it; only a refusal comes back later.
            delivered.catch(() => toast({ title: t(`${copy}.error`), variant: 'destructive' }));
            toast({ title: t(isPhotoDirty ? 'selfChat.name.infoSuccess' : `${copy}.success`) });
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
                        {/* DM only — the friend-info header (Figma 4052-12782). The note says out loud
                            what the data already is: this name is written to MY join row, so nobody
                            else ever sees it (ADR-0068 decision 8). */}
                        {isDm && (
                            <div className="flex flex-col gap-5">
                                <p className="px-4 text-[14px] leading-[1.45] tracking-[-0.07px] text-description">
                                    {t(`${copy}.privateNote`)}
                                </p>
                                <div className="flex flex-col items-center gap-2">
                                    {peerThumbnail ? (
                                        <ImageAvatar src={peerThumbnail} alt={placeholderName ?? ''} size={86} />
                                    ) : (
                                        <DefaultAvatar size={86} />
                                    )}
                                    {peerHasLeft && (
                                        <p className="text-[14px] leading-[1.45] tracking-[-0.07px] text-description">
                                            {t('chat.settings.leftRoom')}
                                        </p>
                                    )}
                                </div>
                            </div>
                        )}
                        {/* Self only — the room's photo, editable. */}
                        {!isDm && (
                            <div className="flex flex-col items-center gap-1.5">
                                <ProfileAvatar
                                    src={avatarSrc}
                                    glyph="user"
                                    onSelect={() => fileInputRef.current?.click()}
                                    selectLabel={t('updateChannel.selectPhoto')}
                                />
                                {imageSizeError && (
                                    <Text className="text-[12px] text-destructive">
                                        {t('placeEdit.imageSizeError')}
                                    </Text>
                                )}
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/jpeg,image/png,image/webp"
                                    onChange={handleImageChange}
                                    className="hidden"
                                    data-testid="self-chat-photo-input"
                                />
                            </div>
                        )}
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
                            {/* Above the save button, and `type="button"` so it never submits the form
                                on its way out. */}
                            {isDm && onReinvite && (
                                <button
                                    type="button"
                                    onClick={onReinvite}
                                    className="flex h-[50px] items-center justify-center gap-1.5 rounded-full border border-input-border text-[16px] font-semibold text-foreground"
                                >
                                    {t(`${copy}.reinvite`)}
                                    <IconChevronRight className="size-[18px]" />
                                </button>
                            )}
                            <Button
                                type="submit"
                                disabled={!canSubmit}
                                className="flex h-[50px] items-center justify-center gap-1.5 rounded-full bg-[#B0EA10] px-6 py-3 text-[16px] font-semibold leading-[1.375] tracking-[0.005em] text-[#222325] hover:bg-[#9DD00E] disabled:bg-muted disabled:text-muted-foreground"
                            >
                                {isSaving ? t(`${copy}.saving`) : t(`${copy}.done`)}
                            </Button>
                        </div>
                        <KeyboardSafeAreaSpacer />
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
};
