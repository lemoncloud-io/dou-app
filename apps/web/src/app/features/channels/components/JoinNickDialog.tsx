import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { X } from 'lucide-react';

import { logger } from '@chatic/bridges';
import { runtime } from '@chatic/runtime-react';
import { AVATAR_IMAGE, prepareImage } from '@chatic/shared';
import { Button } from '@chatic/ui-kit/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@chatic/ui-kit/components/ui/dialog';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';
import { DefaultAvatar, IconChevronRight, ImageAvatar, ProfileAvatar, Text, TextField } from '@chatic/web-ui-kit';

import { KeyboardSafeAreaSpacer } from '../../../ui/layouts/KeyboardSafeAreaSpacer';
import { useMyProfile } from '../../../hooks';
import { useChannel, useChannelMutations, useJoinMutations } from '../hooks';
import { resolveChannelAvatar } from '../lib/resolveChannelAvatar';

interface JoinNickDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    channelId?: string;
    variant?: 'self' | 'dm';
    fallbackName?: string;
    peerThumbnail?: string | null;
    peerHasLeft?: boolean;
    onReinvite?: () => void;
}

const MAX_NAME_LENGTH = 20;

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

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

    const placeholderName = fallbackName ?? profile?.nick;

    const [name, setName] = useState('');
    const [thumbnail, setThumbnail] = useState('');
    const [imageSizeError, setImageSizeError] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const seededRef = useRef(false);

    useEffect(() => {
        if (open && channel && !seededRef.current) {
            seededRef.current = true;
            setName(channel.$join?.nick ?? '');
            setThumbnail(channel.thumbnail ?? '');
            setImageSizeError(false);
        } else if (!open) {
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
            logger.warn('CHANNEL', 'self chat image encoding failed', {
                error,
                data: { sizeBytes: file.size, type: file.type },
            });
            setImageSizeError(true);
        }
    };

    const handleSubmit = async () => {
        if (!channelId || !canSubmit) return;

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
            const { delivered } = await updateJoin({ channelId, userId: joinUserId, nick: name.trim() } as never);
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
                style={{ paddingBottom: 0 }}
            >
                <DialogDescription className="sr-only">Edit my name for this room</DialogDescription>
                <div className="flex items-center justify-between bg-background px-1.5 py-3">
                    <div className="h-11 w-11" />
                    <DialogTitle className="text-[16px] font-semibold leading-[1.625] tracking-[0.005em] text-foreground">
                        {t(`${copy}.title`)}
                    </DialogTitle>
                    <button onClick={() => onOpenChange(false)} className="flex h-11 w-11 items-center justify-center">
                        <X className="h-6 w-6 text-foreground" />
                    </button>
                </div>

                <form
                    onSubmit={event => {
                        event.preventDefault();
                        void handleSubmit();
                    }}
                    className="flex flex-1 flex-col overflow-auto"
                >
                    <div className="flex flex-col gap-6 pt-6">
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

                    <div className="mt-auto">
                        <div className="flex flex-col gap-4 px-4 pb-4 pt-5">
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
