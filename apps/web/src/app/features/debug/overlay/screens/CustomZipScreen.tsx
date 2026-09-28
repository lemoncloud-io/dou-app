import { useCallback, useEffect, useState } from 'react';

import { Row } from '../../components/Row';
import { Section } from '../../components/Section';
import { useDebugOperation } from '../../hooks';
import { appBridge } from '../../../../bridge';
import { useCustomZipScreenStrings } from '../../i18n/screens/CustomZipScreen';

/**
 * Point the app's WebView at a custom web build — the app's Settings screen, moved here
 * (ADR-0080 decision 11 · open question 4).
 *
 * **PROD builds refuse, and the app decides that.** A zip URL chooses the code the WebView runs, so
 * it is the same production security surface decision 13 removed the web-address switcher for. The guard
 * lives natively on the baked `VITE_ENV` (`useCustomZipHandler`) precisely so a compromised web
 * bundle cannot unlock it — this screen only reports what the app says.
 *
 * Turning it OFF is never refused: a device that flipped to a PROD build while a zip was active
 * still needs a way back.
 */
interface Status {
    allowed: boolean;
    localRoot: string | null;
    serverUrl: string | null;
}

export const CustomZipScreen = () => {
    const { result, run } = useDebugOperation();
    const strings = useCustomZipScreenStrings();
    const [url, setUrl] = useState('');
    const [status, setStatus] = useState<Status | null>(null);

    const load = useCallback(async () => {
        try {
            const res = await appBridge.fetchCustomZipStatus();
            setStatus({
                allowed: res.data?.allowed ?? false,
                localRoot: res.data?.localRoot ?? null,
                serverUrl: res.data?.serverUrl ?? null,
            });
        } catch {
            // No shell, or an app build without the handler. The apply button reports that properly
            // through `run`; a status read failing just means "nothing to show".
            setStatus(null);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const active = Boolean(status?.serverUrl || status?.localRoot);

    return (
        <div className="flex flex-col gap-4 p-4">
            <div>
                <h1 className="text-[20px] font-semibold leading-[1.35]">{strings.title}</h1>
                <p className="mt-1 text-[13px] text-muted-foreground">{strings.subtitle}</p>
            </div>

            {status && !status.allowed && <p className="text-[13px] text-destructive">{strings.prodBlocked}</p>}

            <Section title={strings.statusSection}>
                <Row label={strings.serverLabel} value={status?.serverUrl ?? strings.defaultWeb} />
                <Row label={strings.unpackedAtLabel} value={status?.localRoot ?? '—'} />
            </Section>

            <label className="flex flex-col gap-1.5">
                <span className="text-[14px] font-semibold text-foreground">{strings.zipUrlLabel}</span>
                <input
                    type="text"
                    value={url}
                    onChange={e => setUrl(e.target.value)}
                    placeholder={strings.placeholder}
                    className="w-full rounded-xl border border-border bg-background px-4 py-3 text-[13px] outline-none focus:border-foreground"
                />
            </label>

            <div className="flex flex-wrap gap-2">
                <button
                    type="button"
                    disabled={!url.trim() || status?.allowed === false}
                    onClick={() =>
                        void run(
                            strings.operations.applyZip,
                            () => appBridge.applyCustomZip(url.trim()),
                            'ApplyCustomZip'
                        ).then(load)
                    }
                    className="rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground disabled:opacity-50"
                >
                    {strings.apply}
                </button>
                <button
                    type="button"
                    disabled={!active}
                    onClick={() =>
                        void run(
                            strings.operations.revertToDefault,
                            () => appBridge.disableCustomZip(),
                            'DisableCustomZip'
                        ).then(load)
                    }
                    className="rounded-md border border-border px-2 py-1 text-xs disabled:opacity-50"
                >
                    {strings.turnOff}
                </button>
                <button
                    type="button"
                    onClick={() => void load()}
                    className="rounded-md border border-border px-2 py-1 text-xs"
                >
                    {strings.refresh}
                </button>
            </div>

            {result && <p className="break-all font-mono text-[12px] text-muted-foreground">{result}</p>}
        </div>
    );
};
