import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { logger, webClient } from '@chatic/bridges';
import type { AppIconOption } from '@chatic/bridge-messages';
import { host } from '@chatic/host';

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
 * localized label for the current icon. No-ops unless the app runs the frame
 * around the page (the host's `appShell` port).
 */
export const useAppIcon = () => {
    const { t } = useTranslation();
    const [isSupported, setIsSupported] = useState(false);
    const [currentIcon, setCurrentIcon] = useState<string | null>('default');
    const [availableIcons, setAvailableIcons] = useState<AppIconOption[]>([]);

    useEffect(() => {
        if (host.ports.appShell.kind !== 'shell') return;

        webClient
            .request({ type: 'FetchAppIcon', data: {} })
            .then(res => {
                if (res.success && res.data) {
                    setIsSupported(res.data.supported);
                    setCurrentIcon(res.data.iconName);
                }
            })
            .catch(err => {
                logger.error('APP_ICON', '[useAppIcon] failed to fetch app icon status', { error: err });
            });

        webClient
            .request({ type: 'FetchAppIconList', data: {} })
            .then(res => {
                if (res.success && res.data) {
                    setAvailableIcons(res.data.availableIcons);
                }
            })
            .catch(err => {
                logger.error('APP_ICON', '[useAppIcon] failed to fetch app icon list', { error: err });
            });
    }, []);

    const selectIcon = async (iconId: string | null) => {
        try {
            const res = await webClient.request({ type: 'ChangeAppIcon', data: { iconName: iconId } });
            if (res.success && res.data?.success) {
                // The icon the app says it applied, not the one asked for: that is what the user now has.
                recordAppIconChange(currentIcon, res.data.iconName ?? iconId);
                setCurrentIcon(res.data.iconName ?? 'default');
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
