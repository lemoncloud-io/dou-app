import { useTranslation } from 'react-i18next';

import { SettingsNavRow, SettingsRowGroup } from '../../../shared';
import { isPreProductionBuild, useMiniAppLauncher, useSubWebViewOpenScope } from '../hooks/useMiniAppLauncher';
import { MiniAppDialogs } from './MiniAppDialogs';

/**
 * The settings' "Mini app" section. Drawn only in a shell whose handshake says it opens any https
 * page (`subWebViewOpenScope: 'anyHttps'`), and only on pre-production builds: an older shell, the
 * phone, a plain browser and production never see it. The launcher's own hooks run only past that
 * check.
 */
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
                {/* Everyone opens the cloud's link; without one, the hub opens instead. */}
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
                        // No hint until the link is read: "Not set" would claim what is not known yet.
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
