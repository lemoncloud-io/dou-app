import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@chatic/lib/utils';
import { ProfileAvatar, PromoBanner } from '@chatic/web-ui-kit';

import { useActivePlaceName, useSetMyPlaceProfile } from '../../../hooks';
import { PlaceProfileCreateDialog } from '../../../ui/components/PlaceProfileCreateDialog';

interface PlaceProfileBannerProps {
    /** Whether the card shows — `usePlaceProfileNudge`. */
    visible: boolean;
    /** Closes the banner for this place (see `usePlaceProfileNudge`). */
    onDismiss: () => void;
    /** Called once the profile is saved. */
    onSaved: () => void;
    /** Applied to the padding wrapper, not the card — the same gutter rule as `CloudPromoBanner`. */
    className?: string;
}

/**
 * Home's banner for a place I have no profile in, and the create form it opens. The caller decides
 * whether the card shows; this only renders it.
 *
 * Mounted whether or not the card shows, because the form must outlive it. A save writes my nick to
 * the cache before the server answers, and that hides the card at once; a form inside it would go
 * with it, taking a failed save's error with it too.
 *
 * The form keeps its close button and the unsaved-changes guard, as in room settings: the banner is
 * an invitation, not a gate, and the place entry points already ask with a required step.
 */
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
