import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { Camera, MessageSquare, X } from 'lucide-react';

import { logger } from '@chatic/bridges';
import { resizeImageToBase64 } from '@chatic/shared';
import { Button } from '@chatic/ui-kit/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@chatic/ui-kit/components/ui/dialog';
import { Input } from '@chatic/ui-kit/components/ui/input';
import { Label } from '@chatic/ui-kit/components/ui/label';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';
import { useChannel, useChannelMutations } from '../../../hooks';

interface UpdateChannelDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    channelId?: string;
}

const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB

export const UpdateChannelDialog = ({ open, onOpenChange, channelId }: UpdateChannelDialogProps) => {
    const { t } = useTranslation();
    const { updateChannel, isPending: mutationPending } = useChannelMutations();
    const { channel } = useChannel(channelId ?? null);
    const { toast } = useToast();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [imageUrl, setImageUrl] = useState('');
    const [imageSizeError, setImageSizeError] = useState(false);

    const {
        register,
        handleSubmit,
        formState: { errors },
        reset,
    } = useForm<{ name: string }>({
        defaultValues: {
            name: channel?.name || '',
        },
    });

    // dialog가 열릴 때 channel 데이터로 폼/이미지 초기화
    useEffect(() => {
        if (open && channel) {
            reset({ name: channel.name || '' });
            setImageUrl(channel.thumbnail || '');
            setImageSizeError(false);
        }
    }, [open, channel, reset]);

    const initialThumbnail = channel?.thumbnail || '';
    const isImageDirty = imageUrl !== initialThumbnail;

    const handleImageClick = () => {
        fileInputRef.current?.click();
    };

    const handleImageChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        if (file.size > MAX_IMAGE_SIZE) {
            setImageSizeError(true);
            return;
        }

        setImageSizeError(false);

        try {
            const base64 = await resizeImageToBase64(file, 150);
            setImageUrl(base64);
        } catch {
            setImageSizeError(true);
        }

        event.target.value = '';
    };

    const onSubmit = async (data: { name: string }) => {
        if (!channelId || !data.name) return;

        try {
            await updateChannel({
                channelId,
                name: data.name,
                ...(isImageDirty && { thumbnail: imageUrl }),
            } as any);
            toast({ title: t('updateChannel.success') });
            onOpenChange(false);
        } catch (error) {
            logger.error('CHAT', 'Failed to update channel', { error, data: { channelId } });
            toast({ title: t('updateChannel.error'), variant: 'destructive' });
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className="m-0 flex w-full max-w-full flex-col rounded-none bg-background"
                hideClose
                variant="slide-up"
            >
                <DialogDescription className="sr-only">Update channel settings</DialogDescription>
                {/* Top Bar */}
                <div className="flex items-center justify-between bg-background px-1.5 py-3">
                    <div className="h-11 w-11" />
                    <DialogTitle className="text-[16px] font-semibold leading-[1.625] tracking-[0.005em] text-foreground">
                        {t('updateChannel.title')}
                    </DialogTitle>
                    <button onClick={() => onOpenChange(false)} className="flex h-11 w-11 items-center justify-center">
                        <X className="h-6 w-6 text-foreground" />
                    </button>
                </div>

                {/* Content */}
                <form onSubmit={handleSubmit(onSubmit)} className="flex flex-1 flex-col overflow-auto">
                    <div className="flex flex-col gap-6 pt-6">
                        {/* Title Section */}
                        <div className="flex flex-col gap-1.5 px-4">
                            <div className="flex flex-col gap-[2px]">
                                <span className="text-[21px] font-semibold leading-[1.35] tracking-[-0.025em] text-foreground">
                                    {t('updateChannel.subtitle1')}
                                </span>
                                <span className="text-[21px] font-semibold leading-[1.35] tracking-[-0.025em] text-foreground">
                                    {t('updateChannel.subtitle2')}
                                </span>
                            </div>
                        </div>

                        {/* Thumbnail */}
                        <div className="flex flex-col items-center justify-center gap-1.5 px-4">
                            <div className="relative inline-block">
                                <div className="flex h-[82px] w-[82px] items-center justify-center overflow-hidden rounded-full border border-border bg-muted">
                                    {imageUrl ? (
                                        <img
                                            src={imageUrl}
                                            alt="Channel"
                                            loading="lazy"
                                            decoding="async"
                                            className="h-full w-full object-cover"
                                        />
                                    ) : (
                                        <MessageSquare size={36} className="text-muted-foreground" />
                                    )}
                                </div>
                                <button
                                    type="button"
                                    onClick={handleImageClick}
                                    className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-[#B0EA10] shadow-md"
                                >
                                    <Camera size={16} className="text-foreground" />
                                </button>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/jpeg,image/png,image/webp"
                                    onChange={handleImageChange}
                                    className="hidden"
                                />
                            </div>
                            {imageSizeError && (
                                <p className="mt-1 text-[12px] text-destructive">{t('placeInfo.imageSizeError')}</p>
                            )}
                        </div>

                        {/* Room Name Input */}
                        <div className="flex flex-col items-center justify-center gap-1.5 rounded-lg px-4">
                            <div className="flex w-full flex-col gap-1.5">
                                <Label className="text-[14px] font-normal leading-[1.571] tracking-[0.005em] text-muted-foreground">
                                    {t('updateChannel.nameLabel')}
                                </Label>
                                <Input
                                    {...register('name', {
                                        required: t('updateChannel.nameRequired'),
                                        minLength: { value: 2, message: t('updateChannel.nameMinLength') },
                                        maxLength: { value: 20, message: t('updateChannel.nameMaxLength') },
                                    })}
                                    placeholder={t('updateChannel.namePlaceholder')}
                                    className="h-11 rounded-[10px] border border-border bg-background px-3.5 text-[15px] font-medium leading-[1.45] tracking-[0.005em] text-foreground placeholder:text-muted-foreground"
                                />
                                {errors.name && (
                                    <span className="text-[12px] text-destructive">{errors.name.message}</span>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Bottom Button */}
                    <div className="mt-auto">
                        <div className="flex flex-col gap-4 px-4 pb-4 pt-5">
                            <Button
                                type="submit"
                                disabled={mutationPending.update}
                                className="flex h-[50px] items-center justify-center gap-1.5 rounded-full bg-[#B0EA10] px-6 py-3 text-[16px] font-semibold leading-[1.375] tracking-[0.005em] text-[#222325] hover:bg-[#9DD00E] disabled:bg-muted disabled:text-muted-foreground"
                            >
                                {mutationPending.update ? t('updateChannel.updating') : t('updateChannel.done')}
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
