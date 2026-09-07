import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';

import { resizeImageToBase64, useNavigateWithTransition } from '@chatic/shared';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

import { AlertDialog, FloatingButton, ProfileAvatar, Text, TextField, Textarea } from '@chatic/web-ui-kit';

import { PageHeader } from '../../../ui';
import { KeyboardAwareLayout, fixedViewportScreen } from '../../../ui/layouts';
import { useUpdatePlace } from '../../home';

import type { MySiteView } from '@lemoncloud/chatic-backend-api';
import { useRuntimeRepositories } from '@chatic/app-runtime';

const MAX_NAME_LENGTH = 20;
const MAX_DESC_LENGTH = 100;
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
// Shorter than Textarea's 198px default, which is sized for long-form input (feedback's 5000
// characters). Sized so a FULL 100 characters still fits without scrolling: worst case is all-CJK,
// which wraps to four 20.3px lines (81px) inside the box's 16px vertical padding — measured, not
// guessed. At 96px the last line was cut off and a maxed-out field had to be scrolled to reread.
const DESC_BOX_HEIGHT = 116;

/**
 * Edit a place's own name, introduction text and profile image — owner-only (server `isOwner`).
 * Reached from the settings
 * hub, whose row is already disabled for non-owners; the redirect here is a defensive backstop.
 * Save goes through the shared {@link useUpdatePlace} (optimistic cache write). See ADR-0031.
 */
export const PlaceEditPage = () => {
    const { t } = useTranslation();
    const navigate = useNavigateWithTransition();
    const { toast } = useToast();
    const { placeId } = useParams<{ placeId: string }>();
    const { place: placeRepo } = useRuntimeRepositories();

    const { updatePlace, isPending } = useUpdatePlace();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [place, setPlace] = useState<MySiteView | null>(null);
    const [name, setName] = useState('');
    const [desc, setDesc] = useState('');
    const [imageUrl, setImageUrl] = useState('');
    const [imageSizeError, setImageSizeError] = useState(false);
    const [isExitGuardOpen, setIsExitGuardOpen] = useState(false);

    const initialName = place?.name ?? '';
    const initialDesc = place?.desc ?? '';
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
            setDesc(place.desc ?? '');
            setImageUrl(place.thumbnail ?? '');
        }
    }, [place, placeId]);

    const isNameDirty = name !== initialName;
    const isDescDirty = desc !== initialDesc;
    const isImageDirty = imageUrl !== initialThumbnail;
    const isDirty = isNameDirty || isDescDirty || isImageDirty;
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
                id: placeId,
                sid: placeId,
                name,
                // Sent only when touched, so saving a name edit never rewrites the other two
                // fields. An emptied box sends `''` on purpose — that is how a place clears its
                // introduction.
                ...(isDescDirty && { desc }),
                ...(isImageDirty && { thumbnail: imageUrl }),
            });
            navigate(-1);
        } catch {
            toast({ title: t('error.unknownError'), variant: 'destructive' });
        }
    };

    const title = t('placeEdit.title');

    if (!place) {
        return (
            <KeyboardAwareLayout className={fixedViewportScreen} header={<PageHeader title={title} />}>
                <div className="flex min-h-full items-center justify-center">
                    <Text className="text-muted-foreground">{t('placeEdit.notFound')}</Text>
                </div>
            </KeyboardAwareLayout>
        );
    }

    return (
        <KeyboardAwareLayout
            className={fixedViewportScreen}
            header={<PageHeader title={title} onBack={requestClose} />}
            footer={
                <FloatingButton
                    label={t('placeEdit.confirm')}
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
                        glyph="place"
                        onSelect={handleImageClick}
                        selectLabel={t('placeEdit.changeImage')}
                    />
                    <div className="flex flex-col items-center gap-0.5">
                        <Text variant="label" className="text-label">
                            {t('placeEdit.photoLabel')}
                        </Text>
                        <Text variant="caption" className="text-placeholder">
                            {t('placeEdit.photoOptional')}
                        </Text>
                    </div>
                    {imageSizeError && (
                        <Text variant="caption" className="text-destructive">
                            {t('placeEdit.imageSizeError')}
                        </Text>
                    )}
                </div>

                <TextField
                    label={t('placeEdit.nameLabel')}
                    required
                    value={name}
                    onChange={setName}
                    maxLength={MAX_NAME_LENGTH}
                    placeholder={t('placeEdit.namePlaceholder')}
                    description={t('placeEdit.nameDescription')}
                    enterKeyHint="done"
                    onKeyDown={e => {
                        // "Done" key dismisses the keyboard; ignore Enter while an IME is composing.
                        if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                            e.preventDefault();
                            e.currentTarget.blur();
                        }
                    }}
                />

                {/* `Textarea` deliberately ships no counter and no hard cap — its doc comment sends
                    callers that need one to clamp in `onChange`, which is what the feedback form
                    does too. Adding a counter belongs in the component as an opt-in prop, not here. */}
                <Textarea
                    label={t('placeEdit.descLabel')}
                    value={desc}
                    onChange={value => setDesc(value.slice(0, MAX_DESC_LENGTH))}
                    placeholder={t('placeEdit.descPlaceholder')}
                    description={t('placeEdit.descDescription')}
                    height={DESC_BOX_HEIGHT}
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
                title={t('placeEdit.exitTitle')}
                description={t('placeEdit.exitDescription')}
                cancelLabel={t('placeEdit.exitLeave')}
                onCancel={() => navigate(-1)}
                confirmLabel={t('placeEdit.exitContinue')}
                onConfirm={() => undefined}
            />
        </KeyboardAwareLayout>
    );
};
