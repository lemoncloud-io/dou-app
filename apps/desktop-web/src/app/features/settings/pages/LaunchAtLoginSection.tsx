import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { SettingsRowGroup, SettingsSwitchRow } from '../../../shared';
import { getLoginItemApi, type LaunchAtLoginState } from '../../../shared/utils/electronApi';

/**
 * "Launch at login", off unless the OS says otherwise.
 *
 * Renders nothing outside the desktop shell (desktop-web also runs in a plain browser) and
 * nothing on platforms Electron has no login-item integration for. Nothing is rendered until
 * the OS has answered either, so the switch never shows a value the OS did not report. It
 * carries its own section heading so that all of it disappears together — a bare "Startup"
 * header over an empty card is what splitting them would leave in a browser.
 *
 * The shell is the only state: every reply is the OS read back, because macOS 13+ can answer
 * `requires-approval` and leave the app unregistered — in which case the switch must fall
 * back to off rather than claim a registration that did not happen.
 */
export const LaunchAtLoginSection = () => {
    const { t } = useTranslation();
    const [state, setState] = useState<LaunchAtLoginState | null>(null);
    // contextBridge builds this object once, before any page script, so its identity is stable
    // across renders and is safe as an effect dependency.
    const api = getLoginItemApi();

    useEffect(() => {
        if (!api) return;
        // A failed read leaves state null, i.e. the row stays hidden — better than offering a
        // switch whose position is a guess.
        api.get()
            .then(setState)
            .catch((error: unknown) => console.error('[loginItem] read failed', error));
    }, [api]);

    // A failed write flips the switch back, which on its own reads as a flicker.
    // The notice below names it; the next toggle clears it.
    const [writeFailed, setWriteFailed] = useState(false);

    if (!api || !state?.supported) return null;

    const toggle = (enabled: boolean) => {
        const previous = state;
        setWriteFailed(false);
        setState({ ...state, enabled }); // optimistic; the reply below is the OS's answer
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
