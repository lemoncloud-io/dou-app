import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { logger } from '@chatic/bridges';
import type { AppIconOption } from '@chatic/bridge-messages';
import { runtime } from '@chatic/runtime';

import { recordAppIconChange } from '../../../runtime/telemetry/appIcon';

/**
 * Whether an icon id names the primary icon. The app reports it as `DefaultIcon` (its stored
 * name), lists it with a `null` id, and this hook starts from `'default'` before the app has
 * answered — all three are the same icon, and comparing against only some of them left the
 * picker with no row checked while the primary icon was in use.
 */
export const isDefaultAppIcon = (id: string | null): boolean => id === null || id === 'default' || id === 'DefaultIcon';

/**
 * Encapsulates native app-icon support: fetching the current icon and the
 * available icon list on mount, changing the icon, and resolving the
 * localized label for the current icon. No-ops unless the frame offers alternate
 * icons (the host's `appShell` port); `isSupported` stays false there.
 */
export const useAppIcon = () => {
    const { t } = useTranslation();
    const [isSupported, setIsSupported] = useState(false);
    const [currentIcon, setCurrentIcon] = useState<string | null>('default');
    const [availableIcons, setAvailableIcons] = useState<AppIconOption[]>([]);

    useEffect(() => {
        const appIcon = runtime.appShell.appIcon;
        if (!appIcon) return;

        appIcon
            .current()
            .then(status => {
                if (status) {
                    setIsSupported(status.supported);
                    setCurrentIcon(status.iconName);
                }
            })
            .catch(err => {
                logger.error('APP_ICON', '[useAppIcon] failed to fetch app icon status', { error: err });
            });

        appIcon
            .options()
            .then(icons => {
                if (icons) {
                    setAvailableIcons(icons);
                }
            })
            .catch(err => {
                logger.error('APP_ICON', '[useAppIcon] failed to fetch app icon list', { error: err });
            });
    }, []);

    const selectIcon = async (iconId: string | null) => {
        const appIcon = runtime.appShell.appIcon;
        if (!appIcon) return false;
        try {
            const applied = await appIcon.change(iconId);
            if (applied) {
                // The icon the app says it applied, not the one asked for: that is what the user now has.
                recordAppIconChange(currentIcon, applied.iconName ?? iconId);
                setCurrentIcon(applied.iconName ?? 'default');
                return true;
            }
        } catch (err) {
            logger.error('APP_ICON', '[useAppIcon] failed to change app icon', { error: err, data: { iconId } });
        }
        return false;
    };

    const currentIconLabel = (() => {
        if (isDefaultAppIcon(currentIcon)) return t('mypage.appIcon.default');

        const found = availableIcons.find(icon => icon.id === currentIcon);
        if (!found) return t('mypage.appIcon.default');

        const translationKey = `mypage.appIcon.${found.id}`;
        const translated = t(translationKey);
        return translated !== translationKey ? translated : found.label;
    })();

    return { isSupported, currentIcon, availableIcons, selectIcon, currentIconLabel };
};
