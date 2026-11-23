import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';

import { logger } from '@chatic/bridges';
import { cn } from '@chatic/ui-kit';
import { AVATAR_IMAGE, prepareImage, useNavigateWithTransition } from '@chatic/shared';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

import { AlertDialog, FloatingButton, ProfileAvatar, Text, TextField, Textarea } from '@chatic/web-ui-kit';

import { PageHeader } from '../../../ui';
import { useKeyboardOpen } from '../../../ui/hooks';
import { KeyboardAwareLayout, fixedViewportScreen } from '../../../ui/layouts';
import { useUpdatePlace } from '../../home';

import type { MySiteView } from '@lemoncloud/chatic-backend-api';
import { runtime } from '@chatic/runtime';

const MAX_NAME_LENGTH = 20;
const MAX_DESC_LENGTH = 100;
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const DESC_BOX_HEIGHT = 116;

const SHRINK_TRANSITION = 'duration-[250ms] ease-out motion-reduce:transition-none';

export const PlaceEditPage = () => {
    const { t } = useTranslation();
    const navigate = useNavigateWithTransition();
    const { toast } = useToast();
    const { placeId } = useParams<{ placeId: string }>();
    const { place: placeRepo } = runtime.data.useRuntimeRepositories();

    const { updatePlace, isPending } = useUpdatePlace();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const isTyping = useKeyboardOpen();

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

    useEffect(() => {
        if (place && !place.isOwner) {
            navigate(-1);
        }
    }, [place, navigate]);

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
            const { avatar: base64 } = await prepareImage(file, AVATAR_IMAGE);
            if (!base64) throw new Error('Failed to prepare avatar image');
            setImageUrl(base64);
        } catch (error) {
            logger.warn('PLACE', 'place image encoding failed', {
                error,
                data: { sizeBytes: file.size, type: file.type },
            });
            setImageSizeError(true);
        }
    };

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
                ...(isDescDirty && { desc }),
                ...(isImageDirty && { thumbnail: imageUrl }),
            });
            navigate(-1);
        } catch (error) {
            logger.error('PLACE', 'place save failed', {
                error,
                data: { placeId, descChanged: isDescDirty, imageChanged: isImageDirty },
            });
            toast({ title: t('error.unknownError'), variant: 'destructive' });
        }
    };

    const title = t('placeEdit.title');

    if (!place) {
        return (
            <KeyboardAwareLayout
                className={fixedViewportScreen}
                headerSafeArea={false}
                header={<PageHeader title={title} />}
            >
                <div className="flex min-h-full items-center justify-center">
                    <Text className="text-muted-foreground">{t('placeEdit.notFound')}</Text>
                </div>
            </KeyboardAwareLayout>
        );
    }

    return (
        <KeyboardAwareLayout
            className={fixedViewportScreen}
            headerSafeArea={false}
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
            <div
                className={cn(
                    'flex flex-col transition-[gap,padding]',
                    SHRINK_TRANSITION,
                    isTyping ? 'gap-6 py-4' : 'gap-8 py-10'
                )}
            >
                <div
                    className={cn(
                        'flex flex-col items-center px-[18px] transition-[gap]',
                        SHRINK_TRANSITION,
                        isTyping ? 'gap-0' : 'gap-4'
                    )}
                >
                    <ProfileAvatar
                        src={imageUrl || undefined}
                        glyph="place"
                        onSelect={handleImageClick}
                        selectLabel={t('placeEdit.changeImage')}
                    />
                    <div
                        className={cn(
                            'grid transition-[grid-template-rows,opacity]',
                            SHRINK_TRANSITION,
                            isTyping ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100'
                        )}
                        aria-hidden={isTyping}
                    >
                        <div className="min-h-0 overflow-hidden">
                            <div className="flex flex-col items-center gap-0.5">
                                <Text variant="label" className="text-label">
                                    {t('placeEdit.photoLabel')}
                                </Text>
                                <Text variant="caption" className="text-placeholder">
                                    {t('placeEdit.photoOptional')}
                                </Text>
                            </div>
                        </div>
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
                />

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
