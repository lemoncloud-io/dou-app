import { BookUser } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { isNative } from '@chatic/bridges';
import { Button, IconChevronRight } from '@chatic/web-ui-kit';

import { appBridge } from '../../../bridge';

/**
 * Contacts-permission guidance for the friend picker — shown when the device returned no contacts
 * at all. The call to action is an explicit button rather than a tappable banner: the whole-banner
 * hit area gave no visible affordance, and this is the only route out of the empty state on a
 * production app build (where the invite-link flow is not offered).
 */
export const PermissionDeniedBanner = () => {
    const { t } = useTranslation();

    const handleOpenSettings = () => {
        if (isNative()) {
            appBridge.openSettings();
        }
    };

    return (
        <div className="flex flex-col gap-1 px-5 pt-5">
            <div className="flex items-center gap-2.5">
                <BookUser className="size-6 text-description" />
                <span className="text-[17px] font-medium leading-[26px] tracking-[-0.34px] text-foreground">
                    {t('inviteFriends.permissionDenied.title')}
                </span>
            </div>
            <p className="px-1 text-[14px] font-normal leading-[1.5] tracking-[-0.07px] text-label">
                {t('inviteFriends.permissionDenied.description')}
            </p>
            <div className="pt-4">
                <Button
                    variant="outline"
                    tone="black"
                    size="md"
                    fullWidth
                    onClick={handleOpenSettings}
                    trailingIcon={<IconChevronRight className="size-[18px]" strokeWidth={2} />}
                >
                    {t('inviteFriends.permissionDenied.action')}
                </Button>
            </div>
        </div>
    );
};
