import { Camera, User, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { cn } from '@chatic/lib/utils';
import { useWebCoreStore } from '@chatic/web-core';

export const ProfileEditPage = () => {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const profile = useWebCoreStore(s => s.profile);

    const initialName = profile?.$user?.name || '';
    const initialImageUrl = profile?.$user?.imageUrl || '';
    const [name, setName] = useState(initialName);
    const [imageUrl, setImageUrl] = useState(initialImageUrl);

    const hasChanges = name !== initialName || imageUrl !== initialImageUrl;
    const isValid = name.trim().length > 0 && name.length <= 20;

    const handleClose = () => {
        navigate(-1);
    };

    const handleSave = () => {
        if (!isValid || !hasChanges) return;
        // TODO: Implement save functionality
        navigate(-1);
    };

    const handleImageChange = () => {
        // TODO: Implement image picker functionality
        // For now, set a placeholder to demonstrate the change detection
        setImageUrl(imageUrl ? '' : 'placeholder');
    };

    return (
        <div className="flex min-h-screen flex-col bg-background pt-safe-top">
            {/* Header */}
            <header className="relative flex items-center justify-center px-4 py-3">
                <h1 className="text-[17px] font-semibold text-foreground">{t('profileEdit.title')}</h1>
                <button onClick={handleClose} className="absolute right-4 p-1" aria-label="Close">
                    <X size={24} className="text-foreground" />
                </button>
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
                                <img src={imageUrl} alt="Profile" className="h-full w-full object-cover" />
                            ) : (
                                <User size={36} className="text-muted-foreground" />
                            )}
                        </div>
                        <button
                            onClick={handleImageChange}
                            className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-[#B0EA10] shadow-md"
                            aria-label="Change profile photo"
                        >
                            <Camera size={16} className="text-foreground" />
                        </button>
                    </div>
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
