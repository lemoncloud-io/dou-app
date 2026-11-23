import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { logger } from '@chatic/bridges';
import { cn } from '@chatic/ui-kit';
import { AVATAR_IMAGE, prepareImage, useNavigateWithTransition } from '@chatic/shared';

import { AlertDialog, FloatingButton, ModalTopBar, ProfileAvatar, Text, TextField, Toast } from '@chatic/web-ui-kit';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@chatic/ui-kit/components/ui/dialog';

import { KeyboardSafeAreaSpacer } from '../../../ui/layouts/KeyboardSafeAreaSpacer';
import { ROUTES } from '../../../routes/paths';
import { useCreateChannel } from '../../channels/hooks';

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const NAME_MAX = 20;

interface Notice {
    variant: 'positive' | 'error';
    message: string;
}

interface CreateChannelDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

const logImageEncodeFailure = (error: unknown, file: File): void =>
    logger.warn('CHANNEL', 'channel image encoding failed', {
        error,
        data: { sizeBytes: file.size, type: file.type },
    });

export const CreateChannelDialog = ({ open, onOpenChange }: CreateChannelDialogProps) => {
    const { t } = useTranslation();
    const navigate = useNavigateWithTransition();
    const { createChannel } = useCreateChannel();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [name, setName] = useState('');
    const [thumbnail, setThumbnail] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [alertOpen, setAlertOpen] = useState(false);
    const [notice, setNotice] = useState<Notice | null>(null);
    const [editing, setEditing] = useState(false);

    useEffect(() => {
        if (open) {
            setName('');
            setThumbnail('');
            setSubmitting(false);
            setAlertOpen(false);
            setNotice(null);
            setEditing(false);
        }
    }, [open]);

    const trimmed = name.trim();
    const isOverLimit = name.length > NAME_MAX;
    const isValidName = trimmed.length >= 1 && !isOverLimit;
    const canSubmit = isValidName && !submitting;

    const handleImageClick = () => fileInputRef.current?.click();

    const handleImageChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        if (file.size > MAX_IMAGE_SIZE) {
            setNotice({ variant: 'error', message: t('createChannel.imageSizeError') });
            return;
        }
        try {
            const { avatar: base64 } = await prepareImage(file, AVATAR_IMAGE);
            if (!base64) throw new Error('Failed to prepare avatar image');
            setThumbnail(base64);
            setNotice(null);
        } catch (error) {
            logImageEncodeFailure(error, file);
            setNotice({ variant: 'error', message: t('createChannel.imageSizeError') });
        }
    };

    const requestClose = () => {
        if (submitting) return;
        if (trimmed.length > 0 || thumbnail) setAlertOpen(true);
        else onOpenChange(false);
    };

    const handleSubmit = async () => {
        if (!canSubmit) return;
        setSubmitting(true);
        setNotice(null);
        try {
            const created = await createChannel({
                stereo: 'private',
                name: trimmed,
                thumbnail: thumbnail || undefined,
            });
            onOpenChange(false);
            if (created.id) navigate(ROUTES.channels.room(created.id));
        } catch (error) {
            logger.error('CHANNEL', 'Failed to create group room', { error });
            setNotice({ variant: 'error', message: t('createChannel.saveError') });
            setSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={next => !next && requestClose()}>
            <DialogContent
                className="flex h-full max-h-[100dvh] w-full flex-col rounded-none bg-background p-0"
                hideClose
                variant="slide-up"
                style={{ paddingTop: 0, paddingBottom: 0 }}
            >
                <DialogTitle className="sr-only">{t('createChannel.title')}</DialogTitle>
                <DialogDescription className="sr-only">{t('createChannel.subtitle')}</DialogDescription>

                <div className="flex h-full w-full flex-col">
                    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
                        <ModalTopBar
                            onClose={requestClose}
                            closeLabel={t('createChannel.close')}
                            className="sticky top-0 z-20 shrink-0"
                        />

                        <div
                            className={cn(
                                'grid transition-[grid-template-rows,opacity] duration-200 ease-out',
                                editing ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100'
                            )}
                            aria-hidden={editing}
                        >
                            <div className="min-h-0 overflow-hidden">
                                <div className="flex flex-col gap-2 px-4 py-4 text-center">
                                    <Text
                                        as="h1"
                                        className="whitespace-pre-line break-keep text-[20px] font-semibold leading-[1.35] tracking-[-0.1px] text-foreground"
                                    >
                                        {t('createChannel.title')}
                                    </Text>
                                    <Text className="whitespace-pre-line break-keep text-[14px] font-medium leading-[1.45] tracking-[-0.07px] text-description">
                                        {t('createChannel.subtitle')}
                                    </Text>
                                </div>
                            </div>
                        </div>

                        <div
                            className={cn(
                                'flex flex-col transition-all duration-200 ease-out',
                                editing ? 'gap-4 py-4' : 'gap-8 py-10'
                            )}
                        >
                            <div
                                className={cn(
                                    'flex flex-col items-center px-[18px] transition-all duration-200 ease-out',
                                    editing ? 'gap-0' : 'gap-4'
                                )}
                            >
                                <span onMouseDown={event => event.preventDefault()}>
                                    <ProfileAvatar
                                        src={thumbnail || undefined}
                                        glyph="group"
                                        onSelect={handleImageClick}
                                        selectLabel={t('createChannel.photoLabel')}
                                    />
                                </span>
                                <div
                                    className={cn(
                                        'grid transition-[grid-template-rows,opacity] duration-200 ease-out',
                                        editing ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100'
                                    )}
                                    aria-hidden={editing}
                                >
                                    <div className="min-h-0 overflow-hidden">
                                        <div className="flex flex-col items-center gap-0.5">
                                            <Text variant="label" className="text-label">
                                                {t('createChannel.photoLabel')}
                                            </Text>
                                            <Text variant="caption" className="text-placeholder">
                                                {t('createChannel.photoOptional')}
                                            </Text>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <TextField
                                label={t('createChannel.nameLabel')}
                                required
                                value={name}
                                onChange={setName}
                                maxLength={NAME_MAX}
                                enforceMaxLength={false}
                                placeholder={t('createChannel.namePlaceholder')}
                                description={t('createChannel.nameHint')}
                                error={isOverLimit ? t('createChannel.nameHint') : undefined}
                                onFocus={() => setEditing(true)}
                                onBlur={() => setEditing(false)}
                            />
                        </div>

                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            onChange={handleImageChange}
                            className="hidden"
                        />
                    </div>

                    {notice && (
                        <div className="pointer-events-none flex shrink-0 justify-center px-4 pb-2">
                            <Toast variant={notice.variant}>{notice.message}</Toast>
                        </div>
                    )}

                    <FloatingButton
                        label={t('createChannel.done')}
                        loading={submitting}
                        disabled={!canSubmit}
                        onClick={handleSubmit}
                        wrapperClassName="shrink-0"
                    />
                    <KeyboardSafeAreaSpacer />
                </div>

                <AlertDialog
                    open={alertOpen}
                    onOpenChange={setAlertOpen}
                    title={t('createChannel.exitTitle')}
                    description={t('createChannel.exitDescription')}
                    cancelLabel={t('createChannel.exitLeave')}
                    onCancel={() => onOpenChange(false)}
                    confirmLabel={t('createChannel.exitContinue')}
                    onConfirm={() => undefined}
                />
            </DialogContent>
        </Dialog>
    );
};
