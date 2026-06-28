import { Camera, User } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useRuntimeRepositories } from '@chatic/app-runtime';
import { logger } from '@chatic/bridges';
import { useNavigateWithTransition } from '@chatic/shared';
import { resizeImageToBase64 } from '@chatic/shared';

import { cn } from '@chatic/lib/utils';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';
import { useMyProfile } from '../../../hooks';
import { PageHeader } from '../../../ui/components';
import { KeyboardAwareLayout } from '../../../ui/layouts';

const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * Edits the per-site profile (nick/thumbnail) for the ACTIVE site via ProfileRepositoryV2.
 * Reached from the home header. Distinct from CloudProfileEditPage, which edits the cloud profile.
 */
export const SiteProfileEditPage = () => {
    const navigate = useNavigateWithTransition();
    const { t } = useTranslation();
    const { toast } = useToast();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { profile: profileRepository } = useRuntimeRepositories();
    // Source the current value from the V2 per-site profile (same source the header observes).
    const { profile: myProfile } = useMyProfile();

    const initialRef = useRef({ nick: '', thumbnail: '', initialized: false });
    const [name, setName] = useState('');
    const [thumbnail, setThumbnail] = useState('');
    const [imageSizeError, setImageSizeError] = useState(false);
    const [isPending, setIsPending] = useState(false);

    // Fix the initial values and sync state once the profile loads (mirrors ProfileEditPage).
    useEffect(() => {
        if (myProfile && !initialRef.current.initialized) {
            const initNick = myProfile.nick || '';
            const initThumbnail = myProfile.thumbnail || '';
            initialRef.current = { nick: initNick, thumbnail: initThumbnail, initialized: true };
            setName(initNick.slice(0, 30));
            setThumbnail(initThumbnail);
        }
    }, [myProfile]);

    const hasChanges = name !== initialRef.current.nick || thumbnail !== initialRef.current.thumbnail;
    const isValid = name.trim().length > 0 && name.length <= 30;

    const handleSave = async () => {
        if (!isValid || !hasChanges) return;
        setIsPending(true);
        try {
            // Persist nick + thumbnail to the per-site profile via ProfileRepositoryV2 (optimistic).
            await profileRepository.setMyProfile({ nick: name.trim(), thumbnail });

            toast({ title: t('profileEdit.siteSaveSuccess') });
            navigate(-1);
        } catch (error) {
            logger.error('PROFILE', 'Failed to update site profile', { error });
            toast({ title: t('profileEdit.siteSaveError'), variant: 'destructive' });
        } finally {
            setIsPending(false);
        }
    };

    const handleImageClick = () => fileInputRef.current?.click();

    const handleImageChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        if (file.size > MAX_IMAGE_SIZE) {
            setImageSizeError(true);
            event.target.value = '';
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
            header={<PageHeader title={t('profileEdit.tabSite')} />}
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
                        {t('profileEdit.siteDescription1')}
                    </p>
                    <p className="text-[22px] font-bold leading-tight text-foreground">
                        {t('profileEdit.siteDescription2')}
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
                                <img src={thumbnail} alt="Profile" className="h-full w-full object-cover" />
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
