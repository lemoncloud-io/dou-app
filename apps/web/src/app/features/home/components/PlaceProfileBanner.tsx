import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@chatic/ui-kit';
import { ProfileAvatar, PromoBanner } from '@chatic/web-ui-kit';

import { useActivePlaceName, useSetMyPlaceProfile } from '../../../hooks';
import { PlaceProfileCreateDialog } from '../../../ui/components/PlaceProfileCreateDialog';

interface PlaceProfileBannerProps {
    visible: boolean;
    onDismiss: () => void;
    onSaved: () => void;
    className?: string;
}

export const PlaceProfileBanner = ({ visible, onDismiss, onSaved, className }: PlaceProfileBannerProps) => {
    const { t } = useTranslation();
    const placeName = useActivePlaceName();
    const setMyPlaceProfile = useSetMyPlaceProfile();
    const [isFormOpen, setIsFormOpen] = useState(false);

    return (
        <>
            {visible && (
                <div className={cn('px-4', className)}>
                    <PromoBanner
                        icon={<ProfileAvatar size={48} />}
                        title={t('placeProfileBanner.title', { place: placeName })}
                        actionLabel={t('placeProfileBanner.action')}
                        onAction={() => setIsFormOpen(true)}
                        onDismiss={onDismiss}
                        dismissLabel={t('placeProfileBanner.dismiss')}
                    />
                </div>
            )}
            <PlaceProfileCreateDialog
                onSubmit={setMyPlaceProfile}
                open={isFormOpen}
                placeName={placeName}
                onDone={() => {
                    setIsFormOpen(false);
                    onSaved();
                }}
                onExit={() => setIsFormOpen(false)}
                exit={{
                    title: t('placeProfileCreate.exitTitle'),
                    description: t('placeProfileCreate.exitDescription'),
                    leaveLabel: t('placeProfileCreate.exitLeave'),
                    continueLabel: t('placeProfileCreate.exitContinue'),
                }}
            />
        </>
    );
};
