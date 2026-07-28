import { useEffect, useState } from 'react';

import { Button } from '@chatic/ui-kit/components/ui/button';

import { getCustomUiApi, type CustomUiStatus } from '../../../shared';

/**
 * Sample bundle: a real desktop-web production build with every theme hue rotated 189°, so
 * the whole app arrives violet instead of lime. That makes it the stronger demo — it shows
 * the actual product running off the custom scheme, not a page written to talk about it, and
 * the color leaves no doubt about which build the window is showing.
 *
 * Two other archives exist and can be pasted into the field below:
 *   custom-web-poc-desktop.zip  — the probe page (origin, privileges, backend reachability)
 *   custom-web-poc.zip          — the mobile PoC's phone-shaped build
 */
const SAMPLE_ZIP_URL = 'https://lemon-ade-storage.s3.ap-northeast-2.amazonaws.com/custom-web-poc-desktopweb.zip';

// Read once: the shell injects it before any page script, and a per-render read would be a
// fresh dependency for the status effect below.
const api = getCustomUiApi();

/**
 * Custom web bundle PoC (desktop shell only): swap the whole UI for a downloaded ZIP.
 *
 * Applying reloads the window into the bundle, so this panel disappears with it — the way back
 * is the shell's own "Reset custom UI", in the menu bar and the tray. Both live in main and so
 * survive whatever the bundle does; a button inside the bundle would not.
 */
export const DebugCustomUiPage = () => {
    const [zipUrl, setZipUrl] = useState(SAMPLE_ZIP_URL);
    const [status, setStatus] = useState<CustomUiStatus | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (!api) return;
        // Surfaced, not swallowed: an unhandled rejection here would leave status null, which
        // renders as "inactive" — a confident answer the panel does not actually have.
        api.status()
            .then(setStatus)
            .catch((error: unknown) => setStatus({ active: false, root: null, error: String(error) }));
    }, []);

    const run = async (request: Promise<CustomUiStatus>) => {
        setBusy(true);
        try {
            setStatus(await request);
        } catch (error) {
            setStatus({ active: false, root: null, error: String(error) });
        } finally {
            setBusy(false);
        }
    };

    if (!api) {
        return (
            <div className="mx-auto flex w-full max-w-md flex-col gap-4 p-8">
                <h1 className="text-base font-semibold text-foreground">Custom UI</h1>
                <p className="text-xs text-muted-foreground">
                    Only available inside the desktop shell — the browser has no way to serve a local bundle.
                </p>
            </div>
        );
    }

    return (
        <div className="mx-auto flex w-full max-w-md flex-col gap-4 p-8">
            <h1 className="text-base font-semibold text-foreground">Custom UI</h1>

            <div className="rounded-xl border border-border bg-card p-4 text-xs text-muted-foreground">
                {status?.active ? (
                    <>
                        <span className="font-semibold text-primary">active</span>
                        <div className="mt-1 break-all">{status.root}</div>
                    </>
                ) : (
                    'inactive — running the deployed web build'
                )}
            </div>

            {status?.error && (
                <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-600 dark:text-red-400">
                    {status.error}
                </div>
            )}

            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Bundle ZIP URL
                <input
                    value={zipUrl}
                    onChange={e => setZipUrl(e.target.value)}
                    placeholder="https://example.com/custom-web.zip"
                    className="h-10 rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-focus-border"
                />
            </label>

            <div className="flex items-center gap-2">
                <Button size="sm" disabled={busy || !zipUrl.trim()} onClick={() => void run(api.apply(zipUrl.trim()))}>
                    Apply
                </Button>
                <Button variant="outline" size="sm" disabled={busy} onClick={() => void run(api.disable())}>
                    Reset
                </Button>
            </div>

            <p className="text-xs text-muted-foreground">
                Applying reloads the window into the bundle, so this panel goes with it. Get back via the menu bar →
                Custom UI → Reset custom UI (⌘⌥R), or the tray icon → Reset custom UI. Both live in the shell, so they
                survive whatever the bundle does.
            </p>
        </div>
    );
};
