import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { logger } from '@chatic/bridges';
import { resizeImageToBase64, useNavigateWithTransition } from '@chatic/shared';

import { AlertDialog, FloatingButton, ModalTopBar, ProfileAvatar, Text, TextField, Toast } from '@chatic/web-ui-kit';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@chatic/ui-kit/components/ui/dialog';

// Direct path, not the `ui/layouts` barrel: the barrel pulls in PrivateLayout -> @chatic/assets,
// which jest cannot resolve, breaking every test that renders this dialog.
import { KeyboardSafeAreaSpacer } from '../../../ui/layouts/KeyboardSafeAreaSpacer';
import { ROUTES } from '../../../routes/paths';
import { useCreateChannel } from '../../channels/hooks';

const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
const NAME_MAX = 20;

interface Notice {
    variant: 'positive' | 'error';
    message: string;
}

interface CreateChannelDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

/**
 * Full-screen overlay to CREATE a group room (=Channel, stereo 'private'): name + optional photo.
 * On success it creates the room on the cloud server and navigates into it, then closes. Built on
 * @chatic/web-ui-kit; mirrors CreatePlaceDialog. Owner/PRO/limit gating lives in the caller
 * (HomePage). See place-channel-create.md.
 */
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
            setNotice({ variant: 'error', message: t('createChannel.imageSizeError') });
            return;
        }
        try {
            const base64 = await resizeImageToBase64(file, 150);
            setThumbnail(base64);
            setNotice(null);
        } catch {
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
            // Enter the freshly created room. Guard the id: an empty id would build "/channels//room"
            // (no route match, blank screen) — in that unlikely case just close and stay on home.
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
                className="m-0 flex h-full max-h-[100dvh] w-full max-w-full flex-col items-center rounded-none bg-background p-0"
                hideClose
                variant="slide-up"
                // The slide-up variant bakes in `pb-safe-bottom`, but KeyboardSafeAreaSpacer below the
                // CTA already reserves max(safe-bottom - CTA padding, keyboard-height). Keeping both
                // applies the home-indicator inset twice, and with the keyboard up it floats the CTA a
                // full inset above the keyboard instead of the intended 16px. Dropping it here leaves the
                // spacer as the single bottom inset — the same arrangement as PlaceProfileForm's page
                // container, which has no dialog padding to begin with. Inline rather than a `pb-0`
                // class: `pb-safe-bottom` is a custom spacing key tailwind-merge doesn't recognise, so
                // the two classes would both survive and the utility order would decide the winner.
                style={{ paddingBottom: 0 }}
            >
                <DialogTitle className="sr-only">{t('createChannel.title')}</DialogTitle>
                <DialogDescription className="sr-only">{t('createChannel.subtitle')}</DialogDescription>

                <div className="flex h-full w-full max-w-[440px] flex-col">
                    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
                        {/* Glass top bar floats above the scroll area (sticky + z-index) instead of
                            occupying a band of its own, so the content passes under the translucent bar
                            while the close button stays on top and tappable (Figma 3421-59848, the
                            overlay chrome idiom from e5a0a19d). Sticky rather than KeyboardAwareLayout's
                            absolute + measured padding: dialogs can't nest that layout (slide-up already
                            applies the safe-area insets), and with safeArea={false} this bar carries no
                            variable inset to measure — its flow position is exactly the space to reserve.
                            safeArea={false}: the native WebView is already inset below the status bar,
                            so adding the safe-top inset here would double the top gap. */}
                        <ModalTopBar
                            onClose={requestClose}
                            closeLabel={t('createChannel.close')}
                            safeArea={false}
                            className="sticky top-0 z-20 shrink-0"
                        />

                        {/* Title + subtitle */}
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

                        {/* Avatar + name */}
                        <div className="flex flex-col gap-8 py-10">
                            <div className="flex flex-col items-center gap-4 px-[18px]">
                                <ProfileAvatar
                                    src={thumbnail || undefined}
                                    glyph="group"
                                    onSelect={handleImageClick}
                                    selectLabel={t('createChannel.photoLabel')}
                                />
                                <div className="flex flex-col items-center gap-0.5">
                                    <Text variant="label" className="text-label">
                                        {t('createChannel.photoLabel')}
                                    </Text>
                                    <Text variant="caption" className="text-placeholder">
                                        {t('createChannel.photoOptional')}
                                    </Text>
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
