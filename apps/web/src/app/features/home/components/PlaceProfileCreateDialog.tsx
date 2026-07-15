import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useRuntimeRepositories } from '@chatic/app-runtime';
import { logger } from '@chatic/bridges';
import { resizeImageToBase64 } from '@chatic/shared';

import { AlertDialog, FloatingButton, ModalTopBar, ProfileAvatar, Text, TextField, Toast } from '@chatic/web-ui-kit';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@chatic/ui-kit/components/ui/dialog';

const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
const NAME_MAX = 20;
const SUCCESS_CLOSE_DELAY = 1300; // keep the success toast visible briefly before closing

interface Notice {
    variant: 'positive' | 'error';
    message: string;
}

interface PlaceProfileCreateDialogProps {
    /** Controls visibility (owned by the caller). */
    open: boolean;
    /** Active place name, interpolated into the title. */
    placeName: string;
    /** Called after the profile is created successfully. */
    onDone: () => void;
    /** Called when the user chooses to leave without creating a profile. */
    onExit: () => void;
}

/**
 * Full-screen overlay to CREATE the per-place profile (nick + optional photo) for the active place.
 * Distinct from the edit screen (SiteProfileEditPage): shown by the home prompt when the place has
 * no profile yet. Built on @chatic/web-ui-kit; persists via ProfileRepositoryV2.setMyProfile.
 */
export const PlaceProfileCreateDialog = ({ open, placeName, onDone, onExit }: PlaceProfileCreateDialogProps) => {
    const { t } = useTranslation();
    const { profile: profileRepository } = useRuntimeRepositories();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

    // Clear a pending close timer on unmount.
    useEffect(() => () => clearTimeout(closeTimer.current ?? undefined), []);

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
            setNotice({ variant: 'error', message: t('placeProfileCreate.imageSizeError') });
            return;
        }
        try {
            const base64 = await resizeImageToBase64(file, 150);
            setThumbnail(base64);
            setNotice(null);
        } catch {
            setNotice({ variant: 'error', message: t('placeProfileCreate.imageSizeError') });
        }
    };

    // X / esc / overlay: confirm before leaving when there is unsaved input, else exit directly.
    const requestClose = () => {
        if (submitting) return;
        if (trimmed.length > 0 || thumbnail) setAlertOpen(true);
        else onExit();
    };

    const handleSubmit = async () => {
        if (!canSubmit) return;
        setSubmitting(true);
        setNotice(null);
        try {
            await profileRepository.setMyProfile({ nick: trimmed, thumbnail: thumbnail || undefined });
            // Show the success toast over the still-open screen, then close (matches Figma).
            setNotice({ variant: 'positive', message: t('placeProfileCreate.successToast') });
            closeTimer.current = setTimeout(onDone, SUCCESS_CLOSE_DELAY);
        } catch (error) {
            logger.error('PROFILE', 'Failed to create place profile', { error });
            setNotice({ variant: 'error', message: t('placeProfileCreate.saveError') });
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
                <DialogTitle className="sr-only">{t('placeProfileCreate.title', { place: placeName })}</DialogTitle>
                <DialogDescription className="sr-only">{t('placeProfileCreate.subtitle')}</DialogDescription>

                {/* Responsive: full-bleed on phones, capped to a phone-width column centered on wider
                    screens so the layout (and the full-width CTA) never stretches. */}
                <div className="flex h-full w-full max-w-[440px] flex-col">
                    <ModalTopBar onClose={requestClose} closeLabel={t('placeProfileCreate.close')} />

                    {/* Scrollable content: min-h-0 lets it shrink+scroll so the CTA never overlaps on short
                    viewports. Section paddings mirror the Figma spec (title px-4, avatar px-[18px],
                    TextField self-pads px-4). */}
                    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
                        {/* Title + subtitle */}
                        <div className="flex flex-col gap-2 px-4 py-4 text-center">
                            <Text
                                as="h1"
                                className="whitespace-pre-line break-keep text-[20px] font-semibold leading-[1.35] tracking-[-0.1px] text-foreground"
                            >
                                {t('placeProfileCreate.title', { place: placeName })}
                            </Text>
                            <Text className="whitespace-pre-line break-keep text-[14px] font-medium leading-[1.45] tracking-[-0.07px] text-description">
                                {t('placeProfileCreate.subtitle')}
                            </Text>
                        </div>

                        {/* Avatar + name — the Figma py-40 / gap-32 block */}
                        <div className="flex flex-col gap-8 py-10">
                            {/* Profile photo (optional) */}
                            <div className="flex flex-col items-center gap-4 px-[18px]">
                                <ProfileAvatar
                                    src={thumbnail || undefined}
                                    onSelect={handleImageClick}
                                    selectLabel={t('placeProfileCreate.photoLabel')}
                                />
                                <div className="flex flex-col items-center gap-0.5">
                                    <Text variant="label" className="text-label">
                                        {t('placeProfileCreate.photoLabel')}
                                    </Text>
                                    <Text variant="caption" className="text-placeholder">
                                        {t('placeProfileCreate.photoOptional')}
                                    </Text>
                                </div>
                            </div>

                            {/* Name (required, 1–20; soft cap so the over-limit error is reachable) */}
                            <TextField
                                label={t('placeProfileCreate.nameLabel')}
                                required
                                value={name}
                                onChange={setName}
                                maxLength={NAME_MAX}
                                enforceMaxLength={false}
                                placeholder={t('placeProfileCreate.namePlaceholder')}
                                description={t('placeProfileCreate.nameHint')}
                                error={isOverLimit ? t('placeProfileCreate.nameHint') : undefined}
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

                    {/* Inline notice (success / error) — rendered above the CTA like the Figma snackbar */}
                    {notice && (
                        <div className="pointer-events-none flex shrink-0 justify-center px-4 pb-2">
                            <Toast variant={notice.variant}>{notice.message}</Toast>
                        </div>
                    )}

                    <FloatingButton
                        label={t('placeProfileCreate.done')}
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
                    title={t('placeProfileCreate.exitTitle')}
                    description={t('placeProfileCreate.exitDescription')}
                    cancelLabel={t('placeProfileCreate.exitLeave')}
                    onCancel={onExit}
                    confirmLabel={t('placeProfileCreate.exitContinue')}
                    onConfirm={() => undefined}
                />
            </DialogContent>
        </Dialog>
    );
};
