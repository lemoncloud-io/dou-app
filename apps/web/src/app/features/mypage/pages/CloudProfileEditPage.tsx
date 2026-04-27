import { Camera, User } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useNavigateWithTransition } from '@chatic/shared';
import { resizeImageToBase64 } from '@chatic/shared';

import { useUserMutations } from '@chatic/data';
import { cn } from '@chatic/lib/utils';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';
import { cloudCore, useWebCoreStore } from '@chatic/web-core';
import { PageHeader } from '../../../shared/components';
import { KeyboardAwareLayout } from '../../../shared/layouts';

import type { UserProfile$ } from '@lemoncloud/chatic-backend-api';

const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB

export const CloudProfileEditPage = () => {
    const navigate = useNavigateWithTransition();
    const { t } = useTranslation();
    const { toast } = useToast();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { updateProfile, isPending } = useUserMutations();

    // cloudToken에서 직접 읽어야 relay photo가 섞이지 않음
    const cloudToken = cloudCore.getCloudToken();
    const cloudName = cloudToken?.name || '';
    const cloudThumbnail = ((cloudToken as Record<string, unknown>)?.thumbnail as string) || '';

    const initialRef = useRef({ name: cloudName, thumbnail: cloudThumbnail, initialized: !!cloudToken });
    const [name, setName] = useState(cloudName.slice(0, 30));
    const [thumbnail, setThumbnail] = useState(cloudThumbnail);
    const [imageSizeError, setImageSizeError] = useState(false);

    const hasChanges = name !== initialRef.current.name || thumbnail !== initialRef.current.thumbnail;
    const isValid = name.trim().length > 0 && name.length <= 30;

    const handleSave = async () => {
        if (!isValid || !hasChanges) return;
        try {
            await updateProfile({
                name: name.trim(),
                thumbnail: thumbnail !== initialRef.current.thumbnail ? thumbnail : undefined,
            });

            // Sync cloudCore token so useDynamicProfile reads updated values
            const currentToken = cloudCore.getCloudToken();
            if (currentToken) {
                cloudCore.saveCloudToken({
                    ...currentToken,
                    name: name.trim(),
                    ...(thumbnail !== initialRef.current.thumbnail ? { thumbnail } : {}),
                } as typeof currentToken);
            }

            // Sync webCoreStore to trigger re-render
            const currentProfile = useWebCoreStore.getState().profile;
            if (currentProfile) {
                useWebCoreStore.getState().setProfile({
                    ...currentProfile,
                } as UserProfile$);
            }

            toast({ title: t('profileEdit.cloudSaveSuccess') });
            navigate(-1);
        } catch (error) {
            console.error('Failed to update cloud profile:', error);
            toast({ title: t('profileEdit.cloudSaveError'), variant: 'destructive' });
        }
    };

    const handleImageClick = () => fileInputRef.current?.click();

    const handleImageChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        if (file.size > MAX_IMAGE_SIZE) {
            setImageSizeError(true);
            return;
        }
        setImageSizeError(false);
        try {
            const base64 = await resizeImageToBase64(file, 150);
            setThumbnail(base64);
        } catch {
            setImageSizeError(true);
        }
        event.target.value = '';
    };

    return (
        <KeyboardAwareLayout
            className="fixed inset-0 overflow-hidden"
            header={<PageHeader title={t('profileEdit.tabCloud')} />}
            footer={
                <div className="border-t border-border/50 bg-background px-5 py-4">
                    <button
                        onClick={handleSave}
                        disabled={!isValid || !hasChanges || isPending['update-profile']}
                        className={cn(
                            'w-full rounded-2xl py-4 text-[15px] font-semibold transition-all',
                            isValid && hasChanges && !isPending['update-profile']
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
                        {t('profileEdit.cloudDescription1')}
                    </p>
                    <p className="text-[22px] font-bold leading-tight text-foreground">
                        {t('profileEdit.cloudDescription2')}
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
                        {t('profileEdit.thumbnailLabel')}{' '}
                        <span className="font-normal text-muted-foreground">{t('profileEdit.photoOptional')}</span>
                    </label>
                    <div className="relative inline-block">
                        <div className="flex h-[82px] w-[82px] items-center justify-center overflow-hidden rounded-full border border-border bg-muted">
                            {thumbnail ? (
                                <img
                                    src={thumbnail}
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
