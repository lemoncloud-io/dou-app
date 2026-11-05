import { useCallback, useState, useSyncExternalStore } from 'react';

import type { SubWebViewParams } from '@chatic/bridge-messages';

import { appBridge, openSubWebView, useOnSubWebViewClosed } from '../../../../bridge';
import { shellCapabilities } from '../../../../bridge/shellCapabilities';
import { Section } from '../../components/Section';
import { useSubWebViewScreenStrings } from '../../i18n/screens/SubWebViewScreen';

/**
 * Opens a sub WebView by hand and shows the whole round trip: where the page went, its `viewId`,
 * and the `OnSubWebViewClosed` that comes back with its reason and `result`. The Bridge screen can
 * send `OpenSubWebView` too, but it shows no event, so the close — the half a page's `result` rides
 * on — would go unseen.
 */

interface LogLine {
    id: number;
    ok: boolean;
    text: string;
    result?: string;
}

const MAX_LOGS = 20;

/** The page deployed for trying the sub WebView in a dev build; editable, so any other page works too. */
export const DEFAULT_PAGE_URL = 'https://dou-raise.apps-dev.chatic.io/';

/** `undefined` for an empty field, the object for a JSON object, an `Error` for anything else. */
export const parseParams = (raw: string): SubWebViewParams | undefined | Error => {
    if (!raw.trim()) return undefined;
    try {
        const value: unknown = JSON.parse(raw);
        if (typeof value !== 'object' || value === null || Array.isArray(value)) return new Error('not an object');
        return value as SubWebViewParams;
    } catch (e) {
        return e as Error;
    }
};

export const SubWebViewScreen = () => {
    const strings = useSubWebViewScreenStrings();
    const supported = useSyncExternalStore(shellCapabilities.subscribe, () =>
        shellCapabilities.supports('OpenSubWebView')
    );
    const [url, setUrl] = useState(DEFAULT_PAGE_URL);
    const [title, setTitle] = useState('');
    const [params, setParams] = useState('');
    const [paramsError, setParamsError] = useState<string | null>(null);
    const [lastViewId, setLastViewId] = useState<string | null>(null);
    const [logs, setLogs] = useState<LogLine[]>([]);

    const append = useCallback(
        (line: Omit<LogLine, 'id'>) =>
            setLogs(current => [{ id: Date.now() + Math.random(), ...line }, ...current].slice(0, MAX_LOGS)),
        []
    );

    useOnSubWebViewClosed(({ data }) => {
        append({
            ok: true,
            text: strings.closed(data.viewId, data.reason),
            ...(data.result !== undefined ? { result: JSON.stringify(data.result) } : {}),
        });
        setLastViewId(current => (current === data.viewId ? null : current));
    });

    const fail = (e: unknown) => {
        const error = e as { code?: string; message?: string };
        append({ ok: false, text: strings.failed(error.code ?? 'ERROR', error.message ?? String(e)) });
    };

    const open = async () => {
        const parsed = parseParams(params);
        if (parsed instanceof Error) {
            setParamsError(strings.paramsInvalid(parsed.message));
            return;
        }
        setParamsError(null);
        try {
            const opening = await openSubWebView({ url: url.trim(), title: title.trim() || undefined, params: parsed });
            const viewId = opening.via === 'subWebView' ? opening.viewId : undefined;
            if (viewId) setLastViewId(viewId);
            append({ ok: true, text: strings.opened(opening.via, viewId) });
        } catch (e) {
            fail(e);
        }
    };

    const closeLast = async () => {
        if (!lastViewId) return;
        try {
            await appBridge.closeSubWebView(lastViewId);
        } catch (e) {
            fail(e);
        }
    };

    const field =
        'w-full rounded-xl border border-border bg-background px-3 py-2 font-mono text-[13px] outline-none focus:border-foreground';

    return (
        <div className="flex flex-col gap-4 p-4">
            <p className="text-[13px] text-muted-foreground">{strings.intro}</p>
            <p className="text-[12px] text-muted-foreground">{strings.supported(supported)}</p>

            <Section title={strings.urlLabel}>
                <input
                    type="url"
                    aria-label={strings.urlLabel}
                    value={url}
                    onChange={e => setUrl(e.target.value)}
                    placeholder={strings.urlPlaceholder}
                    className={field}
                />
                <label className="mt-2 flex flex-col gap-1.5">
                    <span className="text-[13px] font-semibold text-foreground">{strings.titleLabel}</span>
                    <input type="text" value={title} onChange={e => setTitle(e.target.value)} className={field} />
                </label>
                <label className="flex flex-col gap-1.5">
                    <span className="text-[13px] font-semibold text-foreground">{strings.paramsLabel}</span>
                    <textarea
                        value={params}
                        onChange={e => setParams(e.target.value)}
                        rows={3}
                        spellCheck={false}
                        placeholder='{ "orderId": 7 }'
                        className={`${field} resize-none text-[12px]`}
                    />
                </label>
                {paramsError && <p className="text-[12px] text-destructive">{paramsError}</p>}

                <div className="flex flex-wrap gap-2 pt-1">
                    <button
                        type="button"
                        disabled={!url.trim()}
                        onClick={() => void open()}
                        className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground disabled:opacity-50"
                    >
                        {strings.open}
                    </button>
                    {lastViewId && (
                        <button
                            type="button"
                            onClick={() => void closeLast()}
                            className="rounded-md border border-border px-3 py-1.5 text-xs"
                        >
                            {strings.closeLast(lastViewId)}
                        </button>
                    )}
                    <button
                        type="button"
                        disabled={logs.length === 0}
                        onClick={() => setLogs([])}
                        className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground disabled:opacity-50"
                    >
                        {strings.clear}
                    </button>
                </div>
            </Section>

            <Section title={strings.log(logs.length)}>
                {logs.length === 0 ? (
                    <p className="text-xs text-muted-foreground">{strings.nothingYet}</p>
                ) : (
                    <ul className="flex flex-col gap-1.5">
                        {logs.map(line => (
                            <li key={line.id} className="rounded-lg border border-border px-2.5 py-2 text-[12px]">
                                <p className={line.ok ? 'text-foreground' : 'text-destructive'}>{line.text}</p>
                                {line.result !== undefined && (
                                    <pre className="mt-1 whitespace-pre-wrap break-all font-mono text-[11px] text-muted-foreground">
                                        {strings.result}: {line.result}
                                    </pre>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </Section>
        </div>
    );
};
