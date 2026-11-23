import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { logger } from '@chatic/bridges';
import { AVATAR_IMAGE, prepareImage } from '@chatic/shared';
import { FloatingButton, ModalTopBar, ProfileAvatar, Text, TextField } from '@chatic/web-ui-kit';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@chatic/ui-kit/components/ui/dialog';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

import { KeyboardSafeAreaSpacer } from '../../../ui/layouts/KeyboardSafeAreaSpacer';
import { useChannel, useChannelMutations } from '../hooks';

interface UpdateChannelDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    channelId?: string;
}

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const NAME_MAX = 20;

const logImageEncodeFailure = (error: unknown, file: File): void =>
    logger.warn('CHANNEL', 'channel image encoding failed', {
        error,
        data: { sizeBytes: file.size, type: file.type },
    });

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

    const namePlaceholder = roomName || t('updateChannel.namePlaceholder');

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className="flex h-full max-h-[100dvh] w-full flex-col rounded-none bg-background p-0"
                hideClose
                variant="slide-up"
                style={{ paddingTop: 0, paddingBottom: 0 }}
            >
                <DialogTitle className="sr-only">{t('updateChannel.readOnlyTitle')}</DialogTitle>
                <DialogDescription className="sr-only">Update room info</DialogDescription>

                <div className="flex h-full w-full flex-col">
                    <ModalTopBar
                        title={t('updateChannel.readOnlyTitle')}
                        onClose={() => onOpenChange(false)}
                        closeLabel={t('updateChannel.close')}
                    />

                    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
                        <div className="flex flex-col gap-2 px-4 py-4">
                            <Text
                                as="h1"
                                className="break-keep text-[21px] font-semibold leading-[1.35] tracking-[-0.5px] text-foreground"
                            >
                                {t('updateChannel.heading')}
                            </Text>
                        </div>

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
