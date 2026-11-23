import { useTranslation } from 'react-i18next';

import { Loader2 } from 'lucide-react';

import { ModalTopBar } from '@chatic/web-ui-kit';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@chatic/ui-kit/components/ui/dialog';

import { useMyProfile, useSetMyPlaceProfile } from '../../../hooks';

import { PlaceProfileFormDialog } from '../../../ui/components/PlaceProfileFormDialog';

interface PlaceProfileEditDialogProps {
    open: boolean;
    placeName: string;
    onClose: () => void;
    profileAbsent?: boolean;
}

export const PlaceProfileEditDialog = ({ open, placeName, onClose, profileAbsent }: PlaceProfileEditDialogProps) => {
    const { t } = useTranslation();
    const { profile: myProfile } = useMyProfile();
    const setMyPlaceProfile = useSetMyPlaceProfile();

    const title = t('placeProfileEdit.title', { place: placeName });
    const header = t('placeProfileEdit.header');
    const canSeed = !!myProfile || profileAbsent === true;

    if (open && !canSeed) {
        return (
            <Dialog open onOpenChange={next => !next && onClose()}>
                <DialogContent
                    className="flex h-full max-h-[100dvh] w-full flex-col rounded-none bg-background p-0"
                    hideClose
                    variant="slide-up"
                    style={{ paddingTop: 0, paddingBottom: 0 }}
                >
                    <DialogTitle className="sr-only">{title}</DialogTitle>
                    <DialogDescription className="sr-only">{t('placeProfileEdit.loading')}</DialogDescription>
                    <ModalTopBar title={header} onClose={onClose} closeLabel={t('placeProfileEdit.close')} />
                    <div
                        role="status"
                        aria-label={t('placeProfileEdit.loading')}
                        className="flex flex-1 items-center justify-center text-description"
                    >
                        <Loader2 aria-hidden className="size-7 animate-spin" />
                    </div>
                </DialogContent>
            </Dialog>
        );
    }

    return (
        <PlaceProfileFormDialog
            open={open}
            title={title}
            header={header}
            initialNick={myProfile?.nick ?? ''}
            initialThumbnail={myProfile?.thumbnail ?? ''}
            submitLabel={t('placeProfileEdit.done')}
            successToast={t('placeProfileEdit.successToast')}
            saveError={t('placeProfileEdit.saveError')}
            imageSizeError={t('placeProfileEdit.imageSizeError')}
            nameLabel={t('placeProfileEdit.nameLabel')}
            nameHint={t('placeProfileEdit.nameHint')}
            namePlaceholder={t('placeProfileEdit.namePlaceholder')}
            photoLabel={t('placeProfileEdit.photoLabel')}
            photoOptional={t('placeProfileEdit.photoOptional')}
            closeLabel={t('placeProfileEdit.close')}
            exit={{
                title: t('placeProfileEdit.exitTitle'),
                description: t('placeProfileEdit.exitDescription'),
                leaveLabel: t('placeProfileEdit.exitLeave'),
                continueLabel: t('placeProfileEdit.exitContinue'),
            }}
            onSubmit={setMyPlaceProfile}
            onDone={onClose}
            onExit={onClose}
        />
    );
};
