import { useTranslation } from 'react-i18next';

import { runtime } from '@chatic/runtime-react';
import { IconChevronRight, IconDangerCircle } from '@chatic/web-ui-kit';

export const PermissionDeniedBanner = () => {
    const { t } = useTranslation();

    const handleOpenSettings = () => runtime.appShell.systemSettings?.open();

    return (
        <div className="flex flex-col gap-3 px-5 pt-5">
            <button
                type="button"
                onClick={handleOpenSettings}
                aria-label={t('inviteFriends.permissionDenied.action')}
                className="flex w-full items-center gap-2 text-left"
            >
                <IconDangerCircle size={28} className="shrink-0" />
                <span className="flex min-w-0 items-center gap-1">
                    <span className="text-[20px] font-semibold leading-[25px] tracking-[-0.5px] text-foreground">
                        {t('inviteFriends.permissionDenied.title')}
                    </span>
                    <IconChevronRight className="size-[18px] shrink-0 text-foreground" strokeWidth={2} />
                </span>
            </button>
            <p className="px-0.5 text-[16px] font-normal leading-[1.5] text-label">
                {t('inviteFriends.permissionDenied.description')}
            </p>
        </div>
    );
};
