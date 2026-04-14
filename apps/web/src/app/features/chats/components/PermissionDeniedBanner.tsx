import { BookUser, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { getMobileAppInfo, postMessage } from '@chatic/app-messages';

export const PermissionDeniedBanner = () => {
    const { t } = useTranslation();

    const handleOpenSettings = () => {
        const { isOnMobileApp } = getMobileAppInfo();
        if (isOnMobileApp) {
            postMessage({ type: 'OpenSettings' });
        }
    };

    return (
        <button onClick={handleOpenSettings} className="flex flex-col gap-1 px-5 pb-2 pt-5 text-left w-full">
            <div className="flex items-center gap-2.5">
                <BookUser className="size-6 text-[#9FA2A7]" />
                <div className="flex items-center gap-1">
                    <span className="text-[17px] font-medium leading-[26px] tracking-[-0.34px] text-black">
                        {t('inviteFriends.permissionDenied.title')}
                    </span>
                    <ChevronRight className="size-5 text-[#9FA2A7]" />
                </div>
            </div>
            <div className="px-1">
                <p className="text-[14px] font-normal leading-[1.5] tracking-[-0.07px] text-label">
                    {t('inviteFriends.permissionDenied.description')}
                </p>
            </div>
        </button>
    );
};
