import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { logger } from '@chatic/bridges';
import { cn } from '@chatic/ui-kit';
import { AVATAR_IMAGE, prepareImage } from '@chatic/shared';
import { runtime } from '@chatic/runtime-react';

import { AlertDialog, FloatingButton, ModalTopBar, ProfileAvatar, Text, TextField, Toast } from '@chatic/web-ui-kit';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@chatic/ui-kit/components/ui/dialog';

import { KeyboardSafeAreaSpacer } from '../../../ui/layouts/KeyboardSafeAreaSpacer';
import { useSiteSwitch } from '../../../runtime/useSiteSwitch';
import { useSetMyPlaceProfile } from '../../../hooks';
import { PlaceProfileCreateDialog } from '../../../ui/components/PlaceProfileCreateDialog';

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const NAME_MAX = 20;

interface Notice {
    variant: 'positive' | 'error';
    message: string;
}

interface CreatePlaceDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

const logImageEncodeFailure = (error: unknown, file: File): void =>
    logger.warn('PLACE', 'place image encoding failed', {
        error,
        data: { sizeBytes: file.size, type: file.type },
    });

export const CreatePlaceDialog = ({ open, onOpenChange }: CreatePlaceDialogProps) => {
    const { t } = useTranslation();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { createPlace } = runtime.data.useCreatePlace();
    const { switchSite } = useSiteSwitch();
    const setMyPlaceProfile = useSetMyPlaceProfile();

    const [name, setName] = useState('');
    const [thumbnail, setThumbnail] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [alertOpen, setAlertOpen] = useState(false);
    const [notice, setNotice] = useState<Notice | null>(null);
    const [editing, setEditing] = useState(false);
    const [unswitchedPlace, setUnswitchedPlace] = useState<{ id: string; name: string } | null>(null);
    const [profilePlaceName, setProfilePlaceName] = useState<string | null>(null);
    const [profileSaveFailed, setProfileSaveFailed] = useState(false);

    useEffect(() => {
        if (open) {
            setName('');
            setThumbnail('');
            setSubmitting(false);
            setAlertOpen(false);
            setNotice(null);
            setEditing(false);
            setUnswitchedPlace(null);
            setProfilePlaceName(null);
            setProfileSaveFailed(false);
        }
    }, [open]);

    const trimmed = name.trim();
    const isOverLimit = name.length > NAME_MAX;
    const canSubmit = trimmed.length >= 1 && !isOverLimit && !submitting;

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
            const { avatar: base64 } = await prepareImage(file, AVATAR_IMAGE);
            if (!base64) throw new Error('Failed to prepare avatar image');
            setThumbnail(base64);
            setNotice(null);
        } catch (error) {
            logImageEncodeFailure(error, file);
            setNotice({ variant: 'error', message: t('createPlace.imageSizeError') });
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
            let place = unswitchedPlace;
            if (!place) {
                const created = await createPlace({ name: trimmed, thumbnail: thumbnail || undefined });
                place = { id: created.id, name: created.name || trimmed };
                setUnswitchedPlace(place);
            }
            await switchSite(place.id);
            setUnswitchedPlace(null);
            setSubmitting(false);
            setProfilePlaceName(place.name);
        } catch (error) {
            logger.error('PLACE', 'Failed to create place', { error });
            setNotice({ variant: 'error', message: t('createPlace.saveError') });
            setSubmitting(false);
        }
    };

    const submitProfile = async (value: { nick: string; thumbnail?: string }) => {
        try {
            await setMyPlaceProfile(value);
        } catch (error) {
            setProfileSaveFailed(true);
            throw error;
        }
    };

    if (open && profilePlaceName !== null) {
        return (
            <PlaceProfileCreateDialog
                open
                placeName={profilePlaceName}
                dismissible={profileSaveFailed}
                onSubmit={submitProfile}
                onDone={() => onOpenChange(false)}
                onExit={() => onOpenChange(false)}
            />
        );
    }

    return (
        <Dialog open={open} onOpenChange={next => !next && requestClose()}>
            <DialogContent
                className="flex h-full max-h-[100dvh] w-full flex-col rounded-none bg-background p-0"
                hideClose
                variant="slide-up"
                style={{ paddingTop: 0, paddingBottom: 0 }}
            >
                <DialogTitle className="sr-only">{t('createPlace.title')}</DialogTitle>
                <DialogDescription className="sr-only">{t('createPlace.subtitle')}</DialogDescription>

                <div className="flex h-full w-full flex-col">
                    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
                        <ModalTopBar
                            onClose={requestClose}
                            closeLabel={t('createPlace.close')}
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
                                        {t('createPlace.title')}
                                    </Text>
                                    <Text className="whitespace-pre-line break-keep text-[14px] font-medium leading-[1.45] tracking-[-0.07px] text-description">
                                        {t('createPlace.subtitle')}
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
                                        glyph="place"
                                        onSelect={handleImageClick}
                                        selectLabel={t('createPlace.photoLabel')}
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
                                                {t('createPlace.photoLabel')}
                                            </Text>
                                            <Text variant="caption" className="text-placeholder">
                                                {t('createPlace.photoOptional')}
                                            </Text>
                                        </div>
                                    </div>
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
                        label={t('createPlace.done')}
                        disabled={!canSubmit}
                        onClick={handleSubmit}
                        wrapperClassName="shrink-0"
                    />
                    <KeyboardSafeAreaSpacer />
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
