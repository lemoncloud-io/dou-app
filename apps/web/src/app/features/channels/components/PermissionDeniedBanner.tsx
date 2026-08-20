import { useTranslation } from 'react-i18next';

import { isNative } from '@chatic/bridges';
import { IconChevronRight, IconDangerCircle } from '@chatic/web-ui-kit';

import { appBridge } from '../../../bridge';

/**
 * Contacts-permission guidance for the friend picker — shown when the device returned no contacts
 * at all. The heading row itself is the call to action (Figma node 3263:29626): the standalone
 * outline button it replaces is hidden in that design, and the inline chevron next to the title
 * supplies the affordance the earlier bare banner lacked. It sits beside the invite-link CTA the
 * page renders under it, so a blank list has two ways forward: grant contacts, or invite by name
 * and number.
 */
export const PermissionDeniedBanner = () => {
    const { t } = useTranslation();

    const handleOpenSettings = () => {
        if (isNative()) {
            appBridge.openSettings();
        }
    };

    return (
        <div className="flex flex-col gap-3 px-5 pt-5">
            {/* A real button, not a tappable div: the row is the only route to OS settings, so it has
                to be focusable and named. The title is decorative to assistive tech (the label below
                carries the intent), hence `aria-label` over the visible heading text. */}
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
