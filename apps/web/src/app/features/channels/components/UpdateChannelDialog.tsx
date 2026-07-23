import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { logger } from '@chatic/bridges';
import { resizeImageToBase64 } from '@chatic/shared';
import { FloatingButton, ModalTopBar, ProfileAvatar, Text, TextField } from '@chatic/web-ui-kit';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@chatic/ui-kit/components/ui/dialog';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

import { KeyboardSafeAreaSpacer } from '../../../ui/layouts';
import { useChannel, useChannelMutations, useJoinMutations } from '../hooks';

interface UpdateChannelDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    channelId?: string;
}

const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
const NAME_MAX = 20;

/**
 * Room info dialog. Two role-based modes (ADR-0022):
 * - Owner: edit the shared room name + photo → `channel.update`.
 * - Invited member: the avatar is read-only (owner's photo); the name field sets
 *   MY personal room name (`join.update` nick), shown only to me. Ownership is
 *   derived from the observed channel, so no mode prop is needed.
 */
export const UpdateChannelDialog = ({ open, onOpenChange, channelId }: UpdateChannelDialogProps) => {
    const { t } = useTranslation();
    const { channel } = useChannel(channelId ?? null);
    const { updateChannel, isPending: channelPending } = useChannelMutations();
    const { updateJoin, isPending: joinPending } = useJoinMutations();
    const { toast } = useToast();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const isOwner = !!channel?.isOwner;
    const ownerRoomName = channel?.name ?? '';
    const myNick = channel?.$join?.nick ?? '';

    const [name, setName] = useState('');
    const [thumbnail, setThumbnail] = useState('');
    const [imageSizeError, setImageSizeError] = useState(false);
    const seededRef = useRef(false);

    // Seed transient state once per open (false→true). The observed channel can re-emit while the
    // dialog is open (background sync); re-seeding then would clobber in-progress edits, so we latch.
    // The name field starts empty for both roles — the current room name is surfaced as the
    // placeholder instead (see namePlaceholder), so typing overwrites it rather than editing in place.
    useEffect(() => {
        if (open && channel && !seededRef.current) {
            seededRef.current = true;
            setName('');
            setThumbnail(channel.thumbnail ?? '');
            setImageSizeError(false);
        } else if (!open) {
            seededRef.current = false;
        }
    }, [open, channel, isOwner, ownerRoomName, myNick]);

    const trimmed = name.trim();
    // The field starts empty (current name shown as placeholder), so an empty value means
    // "keep the current name" — it only counts as a change once something new is typed.
    const isNameDirty = trimmed.length > 0 && trimmed !== (isOwner ? ownerRoomName : myNick);
    // Owner edits name + photo; invited edits only their nick (no thumbnail on join.update).
    const isImageDirty = isOwner && thumbnail !== (channel?.thumbnail ?? '');
    const isDirty = isNameDirty || isImageDirty;
    const pending = isOwner ? channelPending.update : joinPending.update;
    const canSubmit = name.length <= NAME_MAX && isDirty && !pending;

    const handleImageClick = () => fileInputRef.current?.click();

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
            const base64 = await resizeImageToBase64(file, 150);
            setThumbnail(base64);
        } catch {
            setImageSizeError(true);
        }
    };

    const handleSubmit = async () => {
        if (!channelId || !canSubmit) return;
        try {
            if (isOwner) {
                await updateChannel({
                    channelId,
                    ...(isNameDirty && { name: trimmed }),
                    ...(isImageDirty && { thumbnail }),
                } as never);
            } else {
                await updateJoin({ channelId, nick: trimmed } as never);
            }
            toast({ title: t('updateChannel.success') });
            onOpenChange(false);
        } catch (error) {
            logger.error('CHAT', 'Failed to update channel info', { error, data: { channelId, isOwner } });
            toast({ title: t('updateChannel.error'), variant: 'destructive' });
        }
    };

    // Common placeholder = the current room name (channel.name) for both roles. Falls back to a
    // role-appropriate hint only when the room has no name yet.
    const namePlaceholder =
        ownerRoomName || (isOwner ? t('updateChannel.namePlaceholder') : t('updateChannel.invitedNamePlaceholder'));

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className="m-0 flex h-full max-h-[100dvh] w-full max-w-full flex-col items-center rounded-none bg-background p-0"
                hideClose
                variant="slide-up"
            >
                <DialogTitle className="sr-only">{t('updateChannel.readOnlyTitle')}</DialogTitle>
                <DialogDescription className="sr-only">Update room info</DialogDescription>

                {/* Full-bleed on phones, capped to a phone-width column on wider screens. */}
                <div className="flex h-full w-full max-w-[440px] flex-col">
                    {/* safeArea={false}: the native WebView is already inset below the status bar,
                        so adding the safe-top inset here would double the top gap. */}
                    <ModalTopBar
                        title={t('updateChannel.readOnlyTitle')}
                        onClose={() => onOpenChange(false)}
                        closeLabel={t('updateChannel.close')}
                        safeArea={false}
                    />

                    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
                        {/* Heading + invited-only subtitle */}
                        <div className="flex flex-col gap-2 px-4 py-4">
                            <Text
                                as="h1"
                                className="break-keep text-[21px] font-semibold leading-[1.35] tracking-[-0.5px] text-foreground"
                            >
                                {t('updateChannel.heading')}
                            </Text>
                            {!isOwner && (
                                <Text className="break-keep text-[14px] font-medium leading-[1.45] tracking-[-0.07px] text-description">
                                    {t('updateChannel.invitedSubtitle')}
                                </Text>
                            )}
                        </div>

                        {/* Avatar — editable (owner) or read-only owner photo + caption (invited) */}
                        <div className="flex flex-col items-center gap-1.5 py-6">
                            <ProfileAvatar
                                src={thumbnail || undefined}
                                glyph="group"
                                onSelect={isOwner ? handleImageClick : undefined}
                                selectLabel={t('updateChannel.selectPhoto')}
                            />
                            {!isOwner && ownerRoomName && (
                                <Text className="text-[14px] font-medium leading-[1.45] text-placeholder">
                                    {ownerRoomName}
                                </Text>
                            )}
                            {imageSizeError && (
                                <Text className="text-[12px] text-destructive">{t('placeInfo.imageSizeError')}</Text>
                            )}
                        </div>

                        {/* Name (owner: room name / invited: personal nick), 1–20 with counter */}
                        <TextField
                            label={t('updateChannel.nameFieldLabel')}
                            value={name}
                            onChange={setName}
                            maxLength={NAME_MAX}
                            placeholder={namePlaceholder}
                            description={t('updateChannel.nameHint')}
                        />

                        {isOwner && (
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/jpeg,image/png,image/webp"
                                onChange={handleImageChange}
                                className="hidden"
                            />
                        )}
                    </div>

                    <FloatingButton
                        label={pending ? t('updateChannel.updating') : t('updateChannel.done')}
                        loading={pending}
                        disabled={!canSubmit}
                        onClick={handleSubmit}
                        wrapperClassName="shrink-0"
                    />
                    <KeyboardSafeAreaSpacer />
                </div>
            </DialogContent>
        </Dialog>
    );
};
