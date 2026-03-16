import { Camera, ChevronLeft, User } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useNavigateWithTransition } from '@chatic/page-transition';

import { cn } from '@chatic/lib/utils';
import { useLocalProfileStore, useWebCoreStore } from '@chatic/web-core';

const MAX_IMAGE_SIZE = 2 * 1024 * 1024; // 2MB

export const ProfileEditPage = () => {
    const navigate = useNavigateWithTransition();
    const { t } = useTranslation();
    const profile = useWebCoreStore(s => s.profile);
    const localProfile = useLocalProfileStore();
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Use local overrides if they exist, otherwise use server profile
    const serverName = profile?.$user?.name || '';
    const serverImageUrl = profile?.$user?.imageUrl || '';
    const initialName = localProfile.name ?? serverName;
    const initialImageUrl = localProfile.imageData ?? serverImageUrl;

    const [name, setName] = useState(initialName);
    const [imageUrl, setImageUrl] = useState(initialImageUrl);
    const [imageSizeError, setImageSizeError] = useState(false);

    const hasChanges = name !== initialName || imageUrl !== initialImageUrl;
    const isValid = name.trim().length > 0 && name.length <= 20;

    const handleClose = () => {
        navigate(-1);
    };

    const handleSave = () => {
        if (!isValid || !hasChanges) return;

        // Save to local profile store
        if (name !== (localProfile.name ?? serverName)) {
            localProfile.setName(name);
        }
        if (imageUrl !== (localProfile.imageData ?? serverImageUrl)) {
            localProfile.setImage(imageUrl);
        }

        navigate(-1);
    };

    const handleImageClick = () => {
        fileInputRef.current?.click();
    };

    const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        // Validate file size
        if (file.size > MAX_IMAGE_SIZE) {
            setImageSizeError(true);
            return;
        }

        setImageSizeError(false);

        // Convert to base64
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64 = reader.result as string;
            setImageUrl(base64);
        };
        reader.readAsDataURL(file);

        // Reset input so the same file can be selected again
        event.target.value = '';
    };

    return (
        <div className="flex min-h-screen flex-col bg-background pt-safe-top">
            {/* Header */}
            <header className="flex items-center justify-center px-4 py-3">
                <button onClick={handleClose} className="absolute left-4 p-2" aria-label="Back">
                    <ChevronLeft size={24} strokeWidth={2} className="text-foreground" />
                </button>
                <h1 className="text-[17px] font-semibold text-foreground">{t('profileEdit.title')}</h1>
            </header>

            {/* Content */}
            <div className="flex-1 px-5 pt-4">
                {/* Description */}
                <div className="mb-8">
                    <p className="text-[22px] font-bold leading-tight text-foreground">
                        {t('profileEdit.description1')}
                    </p>
                    <p className="text-[22px] font-bold leading-tight text-foreground">
                        {t('profileEdit.description2')}
                    </p>
                </div>

                {/* Name Input */}
                <div className="mb-6">
                    <label className="mb-2 block text-[14px] font-semibold text-foreground">
                        {t('profileEdit.nameLabel')}
                    </label>
                    <div className="relative">
                        <input
                            type="text"
                            value={name}
                            onChange={e => setName(e.target.value.slice(0, 20))}
                            className="w-full rounded-xl border border-border bg-background px-4 py-3.5 text-[15px] text-foreground outline-none transition-colors focus:border-foreground"
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[14px] text-muted-foreground">
                            {name.length}/20
                        </span>
                    </div>
                    <p className="mt-2 text-[14px] text-muted-foreground">{t('profileEdit.nameHint')}</p>
                </div>

                {/* Profile Photo */}
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

            {/* Save Button */}
            <div className="px-5 pb-10 pt-4">
                <button
                    onClick={handleSave}
                    disabled={!isValid || !hasChanges}
                    className={cn(
                        'w-full rounded-2xl py-4 text-[15px] font-semibold transition-all',
                        isValid && hasChanges
                            ? 'bg-[#B0EA10] text-foreground active:scale-[0.98]'
                            : 'bg-muted text-muted-foreground'
                    )}
                >
                    {t('profileEdit.save')}
                </button>
            </div>
        </div>
    );
};
