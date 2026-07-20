import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { logger } from '@chatic/bridges';
import { resizeImageToBase64 } from '@chatic/shared';

import { AlertDialog, FloatingButton, ModalTopBar, ProfileAvatar, Text, TextField, Toast } from '@chatic/web-ui-kit';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@chatic/ui-kit/components/ui/dialog';

import { useSiteSwitch } from '../../../runtime/useSiteSwitch';
import { useCreatePlace } from '../hooks';

const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
const NAME_MAX = 20;

interface Notice {
    variant: 'positive' | 'error';
    message: string;
}

interface CreatePlaceDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

/**
 * Full-screen overlay to CREATE a place (=Site): name + optional photo. On success it creates the
 * place on the cloud server and switches the active site into it, then closes — the home screen
 * re-renders on the new place. Built on @chatic/web-ui-kit; mirrors PlaceProfileCreateDialog's
 * layout. Owner/limit gating lives in the caller (HomePage). See place-channel-create.md.
 */
export const CreatePlaceDialog = ({ open, onOpenChange }: CreatePlaceDialogProps) => {
    const { t } = useTranslation();
    const { createPlace } = useCreatePlace();
    const { switchSite } = useSiteSwitch();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [name, setName] = useState('');
    const [thumbnail, setThumbnail] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [alertOpen, setAlertOpen] = useState(false);
    const [notice, setNotice] = useState<Notice | null>(null);

    // Reset transient state each time the overlay opens.
    useEffect(() => {
        if (open) {
            setName('');
            setThumbnail('');
            setSubmitting(false);
            setAlertOpen(false);
            setNotice(null);
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
            setNotice({ variant: 'error', message: t('createPlace.imageSizeError') });
            return;
        }
        try {
            const base64 = await resizeImageToBase64(file, 150);
            setThumbnail(base64);
            setNotice(null);
        } catch {
            setNotice({ variant: 'error', message: t('createPlace.imageSizeError') });
        }
    };

    // X / esc / overlay: confirm before leaving when there is unsaved input, else exit directly.
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
            const created = await createPlace({ name: trimmed, thumbnail: thumbnail || undefined });
            // Navigate into the new place. The place already exists on the server, so a switch
            // failure is non-fatal — log it and still close; the user can pick it from the list.
            try {
                await switchSite(created.id);
            } catch (error) {
                logger.error('PLACE', 'Failed to switch to created place', { error });
            }
            onOpenChange(false);
        } catch (error) {
            logger.error('PLACE', 'Failed to create place', { error });
            setNotice({ variant: 'error', message: t('createPlace.saveError') });
            setSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={next => !next && requestClose()}>
            <DialogContent
                className="m-0 flex h-full max-h-[100dvh] w-full max-w-full flex-col items-center rounded-none bg-background p-0"
                hideClose
                variant="slide-up"
            >
                <DialogTitle className="sr-only">{t('createPlace.title')}</DialogTitle>
                <DialogDescription className="sr-only">{t('createPlace.subtitle')}</DialogDescription>

                <div className="flex h-full w-full max-w-[440px] flex-col">
                    <ModalTopBar onClose={requestClose} closeLabel={t('createPlace.close')} />

                    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
                        {/* Title + subtitle */}
                        <div className="flex flex-col gap-2 px-4 py-4 text-center">
                            <Text
                                as="h1"
                                className="whitespace-pre-line break-keep text-[20px] font-semibold leading-[1.35] tracking-[-0.1px] text-foreground"
                            >
                                {t('createPlace.title')}
                            </Text>
                            <Text className="whitespace-pre-line break-keep text-[14px] font-medium leading-[1.45] tracking-[-0.07px] text-description">
                                {t('createPlace.subtitle')}
                            </Text>
                        </div>

                        {/* Avatar + name */}
                        <div className="flex flex-col gap-8 py-10">
                            <div className="flex flex-col items-center gap-4 px-[18px]">
                                <ProfileAvatar
                                    src={thumbnail || undefined}
                                    onSelect={handleImageClick}
                                    selectLabel={t('createPlace.photoLabel')}
                                />
                                <div className="flex flex-col items-center gap-0.5">
                                    <Text variant="label" className="text-label">
                                        {t('createPlace.photoLabel')}
                                    </Text>
                                    <Text variant="caption" className="text-placeholder">
                                        {t('createPlace.photoOptional')}
                                    </Text>
                                </div>
                            </div>

                            <TextField
                                label={t('createPlace.nameLabel')}
                                required
                                value={name}
                                onChange={setName}
                                maxLength={NAME_MAX}
                                enforceMaxLength={false}
                                placeholder={t('createPlace.namePlaceholder')}
                                description={t('createPlace.nameHint')}
                                error={isOverLimit ? t('createPlace.nameHint') : undefined}
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
                        label={t('createPlace.done')}
                        loading={submitting}
                        disabled={!canSubmit}
                        onClick={handleSubmit}
                        wrapperClassName="shrink-0"
                    />
                    <div
                        className="shrink-0 touch-none bg-background"
                        style={{ height: 'var(--keyboard-height, 0px)' }}
                        onTouchMove={e => e.preventDefault()}
                    />
                </div>

                <AlertDialog
                    open={alertOpen}
                    onOpenChange={setAlertOpen}
                    title={t('createPlace.exitTitle')}
                    description={t('createPlace.exitDescription')}
                    cancelLabel={t('createPlace.exitLeave')}
                    onCancel={() => onOpenChange(false)}
                    confirmLabel={t('createPlace.exitContinue')}
                    onConfirm={() => undefined}
                />
            </DialogContent>
        </Dialog>
    );
};
