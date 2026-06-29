import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { isNative, webClient } from '@chatic/bridges';
import type { AppIconOption } from '@chatic/app-messages';

/**
 * Encapsulates native app-icon support: fetching the current icon and the
 * available icon list on mount, changing the icon, and resolving the
 * localized label for the current icon. No-ops on non-native platforms.
 */
export const useAppIcon = () => {
    const { t } = useTranslation();
    const [isSupported, setIsSupported] = useState(false);
    const [currentIcon, setCurrentIcon] = useState<string | null>('default');
    const [availableIcons, setAvailableIcons] = useState<AppIconOption[]>([]);

    useEffect(() => {
        if (!isNative()) return;

        webClient
            .request({ type: 'FetchAppIcon', data: {} })
            .then(res => {
                if (res.success && res.data) {
                    setIsSupported(res.data.supported);
                    setCurrentIcon(res.data.iconName);
                }
            })
            .catch(err => {
                console.error('Failed to fetch app icon status:', err);
            });

        webClient
            .request({ type: 'FetchAppIconList', data: {} })
            .then(res => {
                if (res.success && res.data) {
                    setAvailableIcons(res.data.availableIcons);
                }
            })
            .catch(err => {
                console.error('Failed to fetch app icon list:', err);
            });
    }, []);

    const selectIcon = async (iconId: string | null) => {
        try {
            const res = await webClient.request({ type: 'ChangeAppIcon', data: { iconName: iconId } });
            if (res.success && res.data?.success) {
                setCurrentIcon(res.data.iconName ?? 'default');
                return true;
            }
        } catch (err) {
            console.error('Failed to change app icon:', err);
        }
        return false;
    };

    const currentIconLabel = (() => {
        const isDefault = currentIcon === null || currentIcon === 'default';
        if (isDefault) return t('mypage.appIcon.default');

        const found = availableIcons.find(icon => icon.id === currentIcon);
        if (!found) return t('mypage.appIcon.default');

        const translationKey = `mypage.appIcon.${found.id}`;
        const translated = t(translationKey);
        return translated !== translationKey ? translated : found.label;
    })();

    return { isSupported, currentIcon, availableIcons, selectIcon, currentIconLabel };
};
