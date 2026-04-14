import { Camera, User } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useNavigateWithTransition } from '@chatic/shared';
import { resizeImageToBase64 } from '@chatic/shared';

import { cn } from '@chatic/lib/utils';
import { useWebCoreStore, useUpdateProfile } from '@chatic/web-core';

import { PageHeader } from '../../../shared/components';
import { KeyboardAwareLayout } from '../../../shared/layouts';

const MAX_IMAGE_SIZE = 2 * 1024 * 1024; // 2MB

export const ProfileEditPage = () => {
    const navigate = useNavigateWithTransition();
    const { t } = useTranslation();
    const profile = useWebCoreStore(s => s.profile);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { mutateAsync: updateProfile, isPending } = useUpdateProfile();

    const initialRef = useRef({ name: '', imageUrl: '', initialized: false });
    const [name, setName] = useState((profile?.$user.name || '').slice(0, 30));
    const [imageUrl, setImageUrl] = useState(profile?.$user.photo || '');
    const [imageSizeError, setImageSizeError] = useState(false);

    // profile 로드 시 초기값 고정 및 state 동기화
    if (profile?.$user && !initialRef.current.initialized) {
        const initName = profile.$user.name || '';
        const initImage = profile.$user.photo || '';
        initialRef.current = { name: initName, imageUrl: initImage, initialized: true };
        if (!name && initName) setName(initName.slice(0, 30));
        if (!imageUrl && initImage) setImageUrl(initImage);
    }

    const hasChanges = name !== initialRef.current.name || imageUrl !== initialRef.current.imageUrl;
    const isValid = name.trim().length > 0 && name.length <= 30;

    const handleSave = async () => {
        if (!isValid || !hasChanges) return;

        try {
            await updateProfile({
                name: name.trim(),
                imageUrl: imageUrl !== initialRef.current.imageUrl ? imageUrl : undefined,
            });

            navigate(-1);
        } catch (error) {
            console.error('Failed to update profile:', error);
        }
    };

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

    return (
        <KeyboardAwareLayout
            className="fixed inset-0 overflow-hidden"
            header={<PageHeader title={t('profileEdit.title')} />}
            footer={
                <div className="border-t border-border/50 bg-background px-5 py-4">
                    <button
                        onClick={handleSave}
                        disabled={!isValid || !hasChanges || isPending}
                        className={cn(
                            'w-full rounded-2xl py-4 text-[15px] font-semibold transition-all',
                            isValid && hasChanges && !isPending
                                ? 'bg-[#B0EA10] text-foreground active:scale-[0.98]'
                                : 'bg-muted text-muted-foreground'
                        )}
                    >
                        {t('profileEdit.save')}
                    </button>
                </div>
            }
        >
            <div className="px-5 pt-4">
                <div className="mb-8">
                    <p className="text-[22px] font-bold leading-tight text-foreground">
                        {t('profileEdit.description1')}
                    </p>
                    <p className="text-[22px] font-bold leading-tight text-foreground">
                        {t('profileEdit.description2')}
                    </p>
                </div>

                <div className="mb-6">
                    <label className="mb-2 block text-[14px] font-semibold text-foreground">
                        {t('profileEdit.nameLabel')}
                    </label>
                    <input
                        type="text"
                        value={name}
                        onChange={e => setName(e.target.value.slice(0, 30))}
                        className="w-full rounded-xl border border-border bg-background px-4 py-3.5 text-[15px] text-foreground outline-none transition-colors focus:border-foreground"
                    />
                    <div className="mt-2 flex justify-between">
                        <span className="text-[14px] text-muted-foreground">{t('profileEdit.nameHint')}</span>
                        <span className="text-[14px] text-muted-foreground">{name.length}/30</span>
                    </div>
                </div>

                <div>
                    <label className="mb-2 block text-[14px] font-semibold text-foreground">
                        {t('profileEdit.photoLabel')}{' '}
                        <span className="font-normal text-muted-foreground">{t('profileEdit.photoOptional')}</span>
                    </label>
                    <div className="relative inline-block">
                        <div className="flex h-[82px] w-[82px] items-center justify-center overflow-hidden rounded-full border border-border bg-muted">
                            {imageUrl ? (
                                <img
                                    src={imageUrl}
                                    alt="Profile"
                                    loading="lazy"
                                    decoding="async"
                                    className="h-full w-full object-cover"
                                />
                            ) : (
                                <User size={36} className="text-muted-foreground" />
                            )}
                        </div>
                        <button
                            onClick={handleImageClick}
                            className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-[#B0EA10] shadow-md"
                            aria-label="Change profile photo"
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
                        <p className="mt-2 text-[14px] text-destructive">{t('profileEdit.imageSizeError')}</p>
                    )}
                </div>
            </div>
        </KeyboardAwareLayout>
    );
};
