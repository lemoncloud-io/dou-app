import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { logger } from '@chatic/bridges';
import { useNavigateWithTransition } from '@chatic/shared';
import { resizeImageToBase64 } from '@chatic/shared';

import { FloatingButton, ProfileAvatar, Text, TextField } from '@chatic/web-ui-kit';

import { useUpdateProfile } from '../hooks';
import { useMyUser } from '../../../hooks';
import { PageHeader } from '../../../ui/components';
import { KeyboardAwareLayout, fixedViewportScreen } from '../../../ui/layouts';

const MAX_NAME_LENGTH = 30;
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB

export const ProfileEditPage = () => {
    const navigate = useNavigateWithTransition();
    const { t } = useTranslation();
    const profile = useMyUser();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { mutateAsync: updateProfile, isPending } = useUpdateProfile();

    const initialRef = useRef({ name: '', imageUrl: '', initialized: false });
    const [name, setName] = useState((profile?.name || '').slice(0, MAX_NAME_LENGTH));
    const [imageUrl, setImageUrl] = useState(profile?.photo || '');
    const [imageSizeError, setImageSizeError] = useState(false);

    // profile 로드 시 초기값 고정 및 state 동기화
    useEffect(() => {
        if (profile && !initialRef.current.initialized) {
            const initName = profile.name || '';
            const initImage = profile.photo || '';
            initialRef.current = { name: initName, imageUrl: initImage, initialized: true };
            if (!name && initName) setName(initName.slice(0, MAX_NAME_LENGTH));
            if (!imageUrl && initImage) setImageUrl(initImage);
        }
    }, [profile]);

    const hasChanges = name !== initialRef.current.name || imageUrl !== initialRef.current.imageUrl;
    const isValid = name.trim().length > 0 && name.length <= MAX_NAME_LENGTH;

    const handleSave = async () => {
        if (!isValid || !hasChanges) return;

        try {
            await updateProfile({
                name: name.trim(),
                photo: imageUrl !== initialRef.current.imageUrl ? imageUrl : undefined,
            });

            navigate(-1);
        } catch (error) {
            logger.error('PROFILE', 'Failed to update profile', { error });
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
            event.target.value = '';
            return;
        }

        setImageSizeError(false);

        try {
            const base64 = await resizeImageToBase64(file, 150);
            setImageUrl(base64);
        } catch {
            setImageSizeError(true);
        }

        event.target.value = '';
    };

    return (
        <KeyboardAwareLayout
            className={fixedViewportScreen}
            header={<PageHeader title={t('profileEdit.title')} />}
            footer={
                <FloatingButton
                    label={t('profileEdit.save')}
                    disabled={!isValid || !hasChanges || isPending}
                    loading={isPending}
                    onClick={handleSave}
                />
            }
        >
            {/* Same centered-photo-above-name rhythm as PlaceEditPage so the profile screens match. */}
            <div className="flex flex-col gap-8 py-10">
                <div className="flex flex-col items-center gap-4 px-[18px]">
                    <ProfileAvatar
                        src={imageUrl || undefined}
                        glyph="user"
                        onSelect={handleImageClick}
                        selectLabel={t('profileEdit.photoLabel')}
                    />
                    <div className="flex flex-col items-center gap-0.5">
                        <Text variant="label" className="text-label">
                            {t('profileEdit.photoLabel')}
                        </Text>
                        <Text variant="caption" className="text-placeholder">
                            {t('profileEdit.photoOptional')}
                        </Text>
                    </div>
                    {imageSizeError && (
                        <Text variant="caption" className="text-destructive">
                            {t('profileEdit.imageSizeError')}
                        </Text>
                    )}
                </div>

                <TextField
                    label={t('profileEdit.nameLabel')}
                    required
                    value={name}
                    onChange={value => setName(value.slice(0, MAX_NAME_LENGTH))}
                    maxLength={MAX_NAME_LENGTH}
                    description={t('profileEdit.nameHint')}
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
        </KeyboardAwareLayout>
    );
};
