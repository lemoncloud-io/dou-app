import { useTranslation } from 'react-i18next';

import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@chatic/ui-kit/components/ui/dialog';

import { useAppearanceDialogStore } from '../stores/useAppearanceDialogStore';
import { AppearanceControls } from './AppearanceControls';

/**
 * Display mode, theme, text size, density and language in a popup, so a change is seen on the
 * screen behind it as it is made. The only place these are set: the Settings page no longer has an
 * Appearance card. Mounted once at the router, like the shortcuts sheet, so the account menu can
 * open it from any page.
 */
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
