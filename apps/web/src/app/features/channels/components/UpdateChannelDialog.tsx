import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { logger } from '@chatic/bridges';
import { AVATAR_IMAGE, prepareImage } from '@chatic/shared';
import {
    COLUMN_INSET,
    FORM_COLUMN,
    FloatingButton,
    ModalTopBar,
    ProfileAvatar,
    Text,
    TextField,
} from '@chatic/web-ui-kit';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@chatic/ui-kit/components/ui/dialog';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

// Direct path, not the `ui/layouts` barrel: the barrel reaches web-core / libs/shared, whose
// `import.meta` the CommonJS test transform cannot parse (directory-structure.md §6).
import { KeyboardSafeAreaSpacer } from '../../../ui/layouts/KeyboardSafeAreaSpacer';
import { useChannel, useChannelMutations } from '../hooks';

interface UpdateChannelDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    channelId?: string;
}

const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
const NAME_MAX = 20;

/**
 * The screen shows the same "too large" message for a codec failure as for an oversized file, so
 * the two are indistinguishable to the user and were indistinguishable to us. Size and type are
 * what separate them; the file's contents are never recorded (ADR-0099).
 */
const logImageEncodeFailure = (error: unknown, file: File): void =>
    logger.warn('CHANNEL', 'channel image encoding failed', {
        error,
        data: { sizeBytes: file.size, type: file.type },
    });

/**
 * Room info dialog — the owner edits the room's shared name and photo (`channel.update`).
 *
 * Owner-only. A member once had a mode here that saved a personal name for the room (`join.nick`),
 * but a group's title is its shared name for everyone now — the name its push carries, since a push
 * is built once for every recipient — so that name would be shown nowhere. The settings row does not
 * open this dialog for a member; were it opened anyway, it saves nothing.
 */
export const UpdateChannelDialog = ({ open, onOpenChange, channelId }: UpdateChannelDialogProps) => {
    const { t } = useTranslation();
    const { channel } = useChannel(channelId ?? null);
    const { updateChannel, isPending } = useChannelMutations();
    const { toast } = useToast();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const isOwner = !!channel?.isOwner;
    const roomName = channel?.name ?? '';

    const [name, setName] = useState('');
    const [thumbnail, setThumbnail] = useState('');
    const [imageSizeError, setImageSizeError] = useState(false);
    const seededRef = useRef(false);

    // Seed transient state once per open (false→true). The observed channel can re-emit while the
    // dialog is open (background sync); re-seeding then would clobber in-progress edits, so we latch.
    // The name field starts empty — the current room name is surfaced as the placeholder instead
    // (see namePlaceholder), so typing overwrites it rather than editing in place.
    useEffect(() => {
        if (open && channel && !seededRef.current) {
            seededRef.current = true;
            setName('');
            setThumbnail(channel.thumbnail ?? '');
            setImageSizeError(false);
        } else if (!open) {
            seededRef.current = false;
        }
    }, [open, channel]);

    const trimmed = name.trim();
    // The field starts empty (current name shown as placeholder), so an empty value means
    // "keep the current name" — it only counts as a change once something new is typed.
    const isNameDirty = trimmed.length > 0 && trimmed !== roomName;
    const isImageDirty = thumbnail !== (channel?.thumbnail ?? '');
    const isDirty = isNameDirty || isImageDirty;
    const pending = isPending.update;
    const canSubmit = isOwner && name.length <= NAME_MAX && isDirty && !pending;

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
            const { avatar: base64 } = await prepareImage(file, AVATAR_IMAGE);
            // A record field has nothing to fall back to, so a preview that could not be made is
            // an error here, not a degraded result.
            if (!base64) throw new Error('Failed to prepare avatar image');
            setThumbnail(base64);
        } catch (error) {
            logImageEncodeFailure(error, file);
            setImageSizeError(true);
        }
    };

    const handleSubmit = async () => {
        if (!channelId || !canSubmit) return;
        try {
            await updateChannel({
                channelId,
                ...(isNameDirty && { name: trimmed }),
                ...(isImageDirty && { thumbnail }),
            } as never);
            toast({ title: t('updateChannel.success') });
            onOpenChange(false);
        } catch (error) {
            logger.error('CHAT', 'Failed to update channel info', { error, data: { channelId, isOwner } });
            toast({ title: t('updateChannel.error'), variant: 'destructive' });
        }
    };

    // Placeholder = the current room name (channel.name), or a hint when the room has no name yet.
    const namePlaceholder = roomName || t('updateChannel.namePlaceholder');

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className="flex h-full max-h-[100dvh] w-full flex-col rounded-none bg-background p-0"
                hideClose
                variant="slide-up"
                // Top: the slide-up variant's own `pt-safe-top` renders the status-bar band as
                // opaque `bg-background` ABOVE the glass bar, so only the 44px bar looked
                // frosted. The bar carries the inset itself (ModalTopBar's default `safeArea`),
                // which puts the whole band inside the translucent, blurred header.
                //
                // The slide-up variant bakes in `pb-safe-bottom`, but KeyboardSafeAreaSpacer below the
                // CTA already reserves max(safe-bottom - CTA padding, keyboard-height). Keeping both
                // applies the home-indicator inset twice, and with the keyboard up it floats the CTA a
                // full inset above the keyboard. Inline rather than a `pb-0` class: `pb-safe-bottom` is
                // a custom spacing key tailwind-merge doesn't classify as padding-bottom, so both would
                // survive and utility order would decide the winner.
                style={{ paddingTop: 0, paddingBottom: 0 }}
            >
                <DialogTitle className="sr-only">{t('updateChannel.readOnlyTitle')}</DialogTitle>
                <DialogDescription className="sr-only">Update room info</DialogDescription>

                {/* Full-bleed on phones, capped to a phone-width column on wider screens; the fields
                    and CTA keep to the form column inside it. */}
                <div className={`flex h-full w-full flex-col ${FORM_COLUMN}`}>
                    <ModalTopBar
                        title={t('updateChannel.readOnlyTitle')}
                        onClose={() => onOpenChange(false)}
                        closeLabel={t('updateChannel.close')}
                    />

                    <div className={`flex min-h-0 flex-1 flex-col overflow-y-auto ${COLUMN_INSET}`}>
                        {/* Heading */}
                        <div className="flex flex-col gap-2 px-4 py-4">
                            <Text
                                as="h1"
                                className="break-keep text-[21px] font-semibold leading-[1.35] tracking-[-0.5px] text-foreground"
                            >
                                {t('updateChannel.heading')}
                            </Text>
                        </div>

                        {/* Avatar — the room photo, editable */}
                        <div className="flex flex-col items-center gap-1.5 py-6">
                            <ProfileAvatar
                                src={thumbnail || undefined}
                                glyph="group"
                                onSelect={isOwner ? handleImageClick : undefined}
                                selectLabel={t('updateChannel.selectPhoto')}
                            />
                            {imageSizeError && (
                                <Text className="text-[12px] text-destructive">{t('placeEdit.imageSizeError')}</Text>
                            )}
                        </div>

                        {/* Room name, 1–20 with counter */}
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
