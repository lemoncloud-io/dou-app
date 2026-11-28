import { useTranslation } from 'react-i18next';

import { SettingsNavRow, SettingsRowGroup } from '@chatic/design-system-components-desktop';
import { isPreProductionBuild, useMiniAppLauncher, useSubWebViewOpenScope } from '../hooks/useMiniAppLauncher';
import { MiniAppDialogs } from './MiniAppDialogs';

export const MiniAppSettingsItem = () => {
    const scope = useSubWebViewOpenScope();
    return scope === 'anyHttps' && isPreProductionBuild() ? <MiniAppSection /> : null;
};

const MiniAppSection = () => {
    const { t } = useTranslation();
    const launcher = useMiniAppLauncher();
    if (!launcher.available) {
        return null;
    }

    return (
        <section className="mt-8 flex flex-col gap-4">
            <h2 className="text-overline uppercase text-muted-foreground">{t('settings.miniApp')}</h2>
            <SettingsRowGroup>
                <SettingsNavRow
                    label={t('settings.miniApp.open')}
                    hint={
                        launcher.linkHost
                            ? t('settings.miniApp.openLinkHint', { host: launcher.linkHost })
                            : t('settings.miniApp.openHubHint')
                    }
                    onClick={() => void launcher.open()}
                />
                {launcher.isOwner && (
                    <SettingsNavRow
                        label={t('settings.miniApp.link')}
                        hint={
                            launcher.url === undefined
                                ? undefined
                                : (launcher.linkHost ?? t('settings.miniApp.linkUnset'))
                        }
                        onClick={() => void launcher.editLink()}
                    />
                )}
            </SettingsRowGroup>
            <MiniAppDialogs launcher={launcher} />
        </section>
    );
};
