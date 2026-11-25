import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { logger } from '@chatic/bridges';
import type { AppIconOption } from '@chatic/bridge-messages';
import { runtime } from '@chatic/runtime-react';

import { recordAppIconChange } from '../../../runtime/telemetry/appIcon';

export const isDefaultAppIcon = (id: string | null): boolean => id === null || id === 'default' || id === 'DefaultIcon';

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
