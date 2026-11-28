import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { SettingsRowGroup, SettingsSwitchRow } from '../../../shared';
import { getLoginItemApi, type LaunchAtLoginState } from '@chatic/host-web-desktop-shell';

export const LaunchAtLoginSection = () => {
    const { t } = useTranslation();
    const [state, setState] = useState<LaunchAtLoginState | null>(null);
    const api = getLoginItemApi();

    useEffect(() => {
        if (!api) return;
        api.get()
            .then(setState)
            .catch((error: unknown) => console.error('[loginItem] read failed', error));
    }, [api]);

    const [writeFailed, setWriteFailed] = useState(false);

    if (!api || !state?.supported) return null;

    const toggle = (enabled: boolean) => {
        const previous = state;
        setWriteFailed(false);
        setState({ ...state, enabled });
        api.set(enabled)
            .then(setState)
            .catch((error: unknown) => {
                console.error('[loginItem] write failed', error);
                setState(previous);
                setWriteFailed(true);
            });
    };

    const label = t('settings.launchAtLogin', 'Launch at login');

    return (
        <section className="mt-8 flex flex-col gap-4">
            <h2 className="text-overline uppercase text-muted-foreground">{t('settings.startup', 'Startup')}</h2>

            <SettingsRowGroup>
                <SettingsSwitchRow
                    label={label}
                    hint={t('settings.launchAtLoginHint', 'Start DoU automatically when you sign in to this computer.')}
                    checked={state.enabled}
                    onCheckedChange={toggle}
                >
                    {writeFailed && (
                        <p role="alert" className="text-caption text-destructive">
                            {t('settings.launchAtLoginFailed', 'Could not change this setting.')}
                        </p>
                    )}
                </SettingsSwitchRow>
            </SettingsRowGroup>
        </section>
    );
};
