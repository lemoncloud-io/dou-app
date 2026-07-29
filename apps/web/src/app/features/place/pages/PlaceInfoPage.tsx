import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';

import { resizeImageToBase64, useNavigateWithTransition } from '@chatic/shared';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

import { AlertDialog, FloatingButton, ProfileAvatar, Text, TextField } from '@chatic/web-ui-kit';

import { PageHeader } from '../../../ui';
import { KeyboardAwareLayout } from '../../../ui/layouts';
import { useUpdatePlace } from '../../home';

import type { MySiteView } from '@lemoncloud/chatic-backend-api';
import { useRuntimeRepositories } from '@chatic/app-runtime';

const MAX_NAME_LENGTH = 20;
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * Edit a place's own name + profile image — owner-only (server `isOwner`). Reached from the settings
 * hub, whose row is already disabled for non-owners; the redirect here is a defensive backstop.
 * Save goes through the shared {@link useUpdatePlace} (optimistic cache write). See ADR-0031.
 */
export const PlaceInfoPage = () => {
    const { t } = useTranslation();
    const navigate = useNavigateWithTransition();
    const { toast } = useToast();
    const { placeId } = useParams<{ placeId: string }>();
    const { place: placeRepo } = useRuntimeRepositories();

    const { updatePlace, isPending } = useUpdatePlace();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [place, setPlace] = useState<MySiteView | null>(null);
    const [name, setName] = useState('');
    const [imageUrl, setImageUrl] = useState('');
    const [imageSizeError, setImageSizeError] = useState(false);
    const [isExitGuardOpen, setIsExitGuardOpen] = useState(false);

    const initialName = place?.name ?? '';
    const initialThumbnail = place?.thumbnail ?? '';

    useEffect(() => {
        if (!placeId) {
            setPlace(null);
            return;
        }
        return placeRepo.observeItem(placeId, setPlace);
    }, [placeRepo, placeId]);

    // Owner-only screen: a non-owner who reaches it directly is sent back.
    useEffect(() => {
        if (place && !place.isOwner) {
            navigate(-1);
        }
    }, [place, navigate]);

    // Seed the form once per place when it first loads. Keyed by placeId so a later background
    // re-emit of the observed place (sync / another device) can't clobber the user's in-progress edits.
    const seededPlaceIdRef = useRef<string | null>(null);
    useEffect(() => {
        if (place && seededPlaceIdRef.current !== placeId) {
            seededPlaceIdRef.current = placeId ?? null;
            setName(place.name ?? '');
            setImageUrl(place.thumbnail ?? '');
        }
    }, [place, placeId]);

    const isNameDirty = name !== initialName;
    const isImageDirty = imageUrl !== initialThumbnail;
    const isDirty = isNameDirty || isImageDirty;
    const isNameValid = name.length > 0 && name.length <= MAX_NAME_LENGTH;
    const canSubmit = isDirty && isNameValid && !isPending;

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
            setImageUrl(base64);
        } catch {
            setImageSizeError(true);
        }
    };

    // Back with unsaved edits asks first; a clean form leaves straight away.
    const requestClose = () => {
        if (isDirty) setIsExitGuardOpen(true);
        else navigate(-1);
    };

    const handleSubmit = async () => {
        if (!canSubmit || !placeId) return;
        try {
            await updatePlace({
                sid: placeId,
                name,
                ...(isImageDirty && { thumbnail: imageUrl }),
            });
            navigate(-1);
        } catch {
            toast({ title: t('error.unknownError'), variant: 'destructive' });
        }
    };

    const title = t('placeInfo.title');

    if (!place) {
        return (
            <KeyboardAwareLayout className="fixed inset-0 overflow-hidden" header={<PageHeader title={title} />}>
                <div className="flex min-h-full items-center justify-center">
                    <Text className="text-muted-foreground">{t('placeInfo.notFound')}</Text>
                </div>
            </KeyboardAwareLayout>
        );
    }

    return (
        <KeyboardAwareLayout
            className="fixed inset-0 overflow-hidden"
            header={<PageHeader title={title} onBack={requestClose} />}
            footer={
                <FloatingButton
                    label={t('placeInfo.confirm')}
                    disabled={!canSubmit}
                    loading={isPending}
                    onClick={handleSubmit}
                />
            }
        >
            {/* Centered photo above the name field (Figma 3408-27580) — the place profile reads as a
                profile screen, not a details list, so there is no created-date row. */}
            <div className="flex flex-col gap-8 py-10">
                <div className="flex flex-col items-center gap-4 px-[18px]">
                    <ProfileAvatar
                        src={imageUrl || undefined}
                        glyph="group"
                        onSelect={handleImageClick}
                        selectLabel={t('placeInfo.changeImage')}
                    />
                    <div className="flex flex-col items-center gap-0.5">
                        <Text variant="label" className="text-label">
                            {t('placeInfo.photoLabel')}
                        </Text>
                        <Text variant="caption" className="text-placeholder">
                            {t('placeInfo.photoOptional')}
                        </Text>
                    </div>
                    {imageSizeError && (
                        <Text variant="caption" className="text-destructive">
                            {t('placeInfo.imageSizeError')}
                        </Text>
                    )}
                </div>

                <TextField
                    label={t('placeInfo.nameLabel')}
                    required
                    value={name}
                    onChange={setName}
                    maxLength={MAX_NAME_LENGTH}
                    placeholder={t('placeInfo.namePlaceholder')}
                    description={t('placeInfo.nameDescription')}
                    enterKeyHint="done"
                    onKeyDown={e => {
                        // "Done" key dismisses the keyboard; ignore Enter while an IME is composing.
                        if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                            e.preventDefault();
                            e.currentTarget.blur();
                        }
                    }}
                />

                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleImageChange}
                    className="hidden"
                />
            </div>

            <AlertDialog
                open={isExitGuardOpen}
                onOpenChange={setIsExitGuardOpen}
                title={t('placeInfo.exitTitle')}
                description={t('placeInfo.exitDescription')}
                cancelLabel={t('placeInfo.exitLeave')}
                onCancel={() => navigate(-1)}
                confirmLabel={t('placeInfo.exitContinue')}
                onConfirm={() => undefined}
            />
        </KeyboardAwareLayout>
    );
};
