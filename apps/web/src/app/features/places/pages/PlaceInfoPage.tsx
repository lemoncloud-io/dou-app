import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';

import { Calendar, Camera, Users } from 'lucide-react';

import { useNavigateWithTransition, resizeImageToBase64 } from '@chatic/shared';
import { cn } from '@chatic/ui-kit';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

import { PageHeader } from '../../../shared/components';
import { KeyboardAwareLayout } from '../../../shared/layouts';
import { useMyPlaces } from '../../home/hooks/useMyPlaces';
import { useUpdateMyPlace } from '../../home/hooks/useUpdateMyPlace';

import type { MySiteView } from '@lemoncloud/chatic-backend-api';

const MAX_NAME_LENGTH = 20;
const MAX_IMAGE_SIZE = 2 * 1024 * 1024; // 2MB

export const PlaceInfoPage = () => {
    const { t, i18n } = useTranslation();
    const navigate = useNavigateWithTransition();
    const { toast } = useToast();
    const { placeId } = useParams<{ placeId: string }>();
    const { places } = useMyPlaces();
    const { updatePlace, isPending } = useUpdateMyPlace();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [place, setPlace] = useState<MySiteView | null>(null);
    const [name, setName] = useState('');
    const [imageUrl, setImageUrl] = useState('');
    const [imageSizeError, setImageSizeError] = useState(false);

    const initialName = place?.name ?? '';
    const initialThumbnail = place?.thumbnail ?? '';

    useEffect(() => {
        if (placeId && places.length > 0) {
            const found = places.find(p => p.id === placeId);
            setPlace(found ?? null);
            setName(found?.name ?? '');
            setImageUrl(found?.thumbnail ?? '');
        }
    }, [placeId, places]);

    const formatDate = useCallback(
        (timestamp?: number) => {
            if (!timestamp) return '-';
            const date = new Date(timestamp);
            const year = date.getFullYear();
            const month = date.getMonth() + 1;
            if (i18n.language === 'ko') return `${year}년 ${month}월`;
            const monthNames = [
                'January',
                'February',
                'March',
                'April',
                'May',
                'June',
                'July',
                'August',
                'September',
                'October',
                'November',
                'December',
            ];
            return `${monthNames[month - 1]} ${year}`;
        },
        [i18n.language]
    );

    const isNameDirty = name !== initialName;
    const isImageDirty = imageUrl !== initialThumbnail;
    const isDirty = isNameDirty || isImageDirty;
    const isNameValid = name.length > 0 && name.length <= MAX_NAME_LENGTH;
    const canSubmit = isDirty && isNameValid && !isPending;

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
            const base64 = await resizeImageToBase64(file, 50);
            setImageUrl(base64);
        } catch {
            setImageSizeError(true);
        }

        event.target.value = '';
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
        } catch (error) {
            toast({ title: t('error.unknownError'), variant: 'destructive' });
        }
    };

    const title = t('placeInfo.title');

    if (!place) {
        return (
            <KeyboardAwareLayout className="fixed inset-0 overflow-hidden" header={<PageHeader title={title} />}>
                <div className="flex min-h-full items-center justify-center">
                    <span className="text-muted-foreground">{t('placeInfo.notFound')}</span>
                </div>
            </KeyboardAwareLayout>
        );
    }

    return (
        <KeyboardAwareLayout
            className="fixed inset-0 overflow-hidden"
            header={<PageHeader title={title} />}
            footer={
                <div className="border-t border-border/50 bg-background px-5 py-4">
                    <button
                        disabled={!canSubmit}
                        onClick={handleSubmit}
                        className={cn(
                            'w-full rounded-2xl py-4 text-[15px] font-semibold transition-all',
                            canSubmit
                                ? 'bg-[#B0EA10] text-foreground active:scale-[0.98]'
                                : 'bg-muted text-muted-foreground'
                        )}
                    >
                        {t('placeInfo.confirm')}
                    </button>
                </div>
            }
        >
            <div className="px-5 pt-4">
                <div className="mb-6 flex items-center gap-3">
                    <Calendar size={18} className="shrink-0 text-muted-foreground" />
                    <div className="flex flex-col gap-0.5">
                        <span className="text-[14px] font-semibold text-foreground">{t('placeInfo.createdDate')}</span>
                        <span className="text-[14px] text-muted-foreground">{formatDate(place.createdAt)}</span>
                    </div>
                </div>

                <div className="mb-6 h-px bg-border" />

                {/* Name */}
                <div className="mb-6">
                    <label className="mb-2 block text-[14px] font-semibold text-foreground">
                        {t('placeInfo.nameLabel')}
                    </label>
                    <div className="relative">
                        <input
                            className="w-full rounded-xl border border-border bg-background px-4 py-3.5 text-[15px] text-foreground outline-none transition-colors focus:border-foreground placeholder:text-muted-foreground"
                            value={name}
                            onChange={e => setName(e.target.value.slice(0, MAX_NAME_LENGTH))}
                            placeholder={t('placeInfo.namePlaceholder')}
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[14px] text-muted-foreground">
                            {name.length}/{MAX_NAME_LENGTH}
                        </span>
                    </div>
                    <p className="mt-2 text-[14px] text-muted-foreground">{t('placeInfo.nameDescription')}</p>
                </div>

                {/* Image */}
                <div className="mb-6">
                    <label className="mb-2 block text-[14px] font-semibold text-foreground">
                        {t('placeInfo.photoLabel')}{' '}
                        <span className="font-normal text-muted-foreground">{t('placeInfo.photoOptional')}</span>
                    </label>
                    <div className="relative inline-block">
                        <div className="flex h-[82px] w-[82px] items-center justify-center overflow-hidden rounded-full border border-border bg-muted">
                            {imageUrl ? (
                                <img
                                    src={imageUrl}
                                    alt="Place"
                                    loading="lazy"
                                    decoding="async"
                                    className="h-full w-full object-cover"
                                />
                            ) : (
                                <Users size={36} className="text-muted-foreground" />
                            )}
                        </div>
                        <button
                            onClick={handleImageClick}
                            className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-[#B0EA10] shadow-md"
                            aria-label={t('placeInfo.changeImage')}
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
                        <p className="mt-2 text-[14px] text-destructive">{t('placeInfo.imageSizeError')}</p>
                    )}
                </div>
            </div>
        </KeyboardAwareLayout>
    );
};
