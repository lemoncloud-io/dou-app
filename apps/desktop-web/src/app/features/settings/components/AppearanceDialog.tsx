import { useTranslation } from 'react-i18next';

import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@chatic/ui-kit';

import { useAppearanceDialogStore } from '../stores/useAppearanceDialogStore';
import { AppearanceControls } from './AppearanceControls';

export const AppearanceDialog = () => {
    const { t } = useTranslation();
    const open = useAppearanceDialogStore(s => s.isOpen);
    const setOpen = useAppearanceDialogStore(s => s.setOpen);

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent closeLabel={t('common.close')} className="sm:max-w-xl">
                <DialogTitle>{t('settings.appearance')}</DialogTitle>
                <DialogDescription className="text-caption text-muted-foreground">
                    {t('settings.autosave')}
                </DialogDescription>
                <AppearanceControls className="pt-2" />
            </DialogContent>
        </Dialog>
    );
};
