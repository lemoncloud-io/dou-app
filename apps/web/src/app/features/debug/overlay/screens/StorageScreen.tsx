import { useCallback, useEffect, useId, useRef, useState } from 'react';

import type { OnFetchNativeStorageSummaryPayload } from '@chatic/app-messages';
import { runtime } from '@chatic/app-runtime';
import { isNative, logger } from '@chatic/bridges';

import { Row } from '../../components/Row';
import { Section } from '../../components/Section';
import { useDebugOperation } from '../../hooks';
import { useStorageScreenStrings } from '../../i18n/screens/StorageScreen';
import {
    browserWebStorageEnv,
    clearWebDatabases,
    clearWebStores,
    formatSize,
    summarizeWebStorage,
    type WebStorageEnv,
    type WebStorageSummary,
} from '../../lib/webStorage';
import { appBridge } from '../../../../bridge';

type NativeState =
    | { status: 'loading' }
    | { status: 'noShell' }
    | { status: 'unsupported' }
    | { status: 'error'; message: string }
    | { status: 'ready'; summary: OnFetchNativeStorageSummaryPayload };

type ClearTarget = 'native' | 'web' | 'both';

export interface StorageScreenProps {
    /** Test seam; the browser's own storage otherwise. */
    env?: WebStorageEnv;
    /**
     * Test seam. `reload` keeps the URL (a native clear leaves the session alone); `root` starts over
     * at `/`, because after a web clear the route the page was on belongs to a session that is gone.
     */
    navigate?: (to: 'reload' | 'root') => void;
}

const defaultNavigate = (to: 'reload' | 'root') => {
    if (to === 'root') window.location.replace('/');
    else window.location.reload();
};

const isNotFound = (error: unknown) => (error as { code?: string } | undefined)?.code === 'NOT_FOUND';

/** One name with its size, wrapping a long key instead of pushing the size off the panel. */
const SizeLine = ({ name, detail, tag }: { name: string; detail: string; tag?: string }) => (
    <div className="flex items-start justify-between gap-2 text-xs">
        <span className="break-all font-mono">
            {name}
            {tag && <span className="ml-1 rounded bg-destructive/10 px-1 text-destructive">{tag}</span>}
        </span>
        <span className="shrink-0 font-mono text-muted-foreground">{detail}</span>
    </div>
);

/**
 * Both halves of what the device keeps, and a clear for each.
 *
 * Inside the app the WebView's storage holds the session — sign-in, the per-cloud token cache, the
 * selected cloud — while the chat cache and the invited-cloud list live in the native shell's SQLite.
 * The Settings clear empties only the chat cache, and a WebView reset leaves the native half, so a
 * stale entry on either side survived the clear people reached for. This screen shows both and clears
 * either or both.
 *
 * Every clear reloads afterwards, because screens and react-query still hold what they already read.
 * A partial native clear does not, so the failure stays on screen. Each successful clear also asks the
 * next boot to retire every sync cursor saved before it: a sync in flight during the clear can land
 * afterwards and record "synced up to now" over an emptied store, and the gap would never fill.
 */
export const StorageScreen = ({ env: envProp, navigate = defaultNavigate }: StorageScreenProps = {}) => {
    const t = useStorageScreenStrings();
    const [env] = useState(() => envProp ?? browserWebStorageEnv());
    const [web, setWeb] = useState<WebStorageSummary | null>(null);
    const [native, setNative] = useState<NativeState>({ status: 'loading' });
    const [includeInvitedClouds, setIncludeInvitedClouds] = useState(false);
    // Clears take two taps: the first arms the button, the second runs it.
    const [armed, setArmed] = useState<ClearTarget | null>(null);
    const [busy, setBusy] = useState(false);
    const { result, run } = useDebugOperation();
    const warningId = useId();
    // Refresh can be pressed while a slow native scan is still out; only the latest load may land.
    const loadSeq = useRef(0);

    const load = useCallback(async () => {
        const seq = ++loadSeq.current;
        const current = () => seq === loadSeq.current;
        try {
            const summary = await summarizeWebStorage(env);
            if (current()) setWeb(summary);
        } catch (e) {
            logger.warn('APP', 'debug storage: web summary failed', e as Error);
        }
        if (!isNative()) {
            if (current()) setNative({ status: 'noShell' });
            return;
        }
        let next: NativeState;
        try {
            const res = await appBridge.fetchNativeStorageSummary();
            next = res.data ? { status: 'ready', summary: res.data } : { status: 'error', message: 'empty response' };
        } catch (e) {
            // An app build older than this screen answers NOT_FOUND: a version gap, not a failure.
            next = isNotFound(e) ? { status: 'unsupported' } : { status: 'error', message: (e as Error).message };
        }
        if (current()) setNative(next);
    }, [env]);

    useEffect(() => {
        void load();
    }, [load]);

    /** True when the native tables all cleared. */
    const clearNative = async (): Promise<boolean> => {
        let cleared = false;
        await run(
            t.operations.clearNative,
            async () => {
                const res = await appBridge.clearNativeCache(includeInvitedClouds);
                const failed = res.data?.failed ?? [];
                // Thrown so the result line reports it as a failure, not as a response to read.
                if (failed.length > 0) throw new Error(t.nativeFailed(failed.join(', ')));
                cleared = true;
                return res;
            },
            'ClearNativeCache'
        );
        return cleared;
    };

    /**
     * The databases go first because deleting them awaits; the storages go last, synchronously, and the
     * page leaves in the same task. The app keeps running until then, and a token refresh or a store
     * write that slipped in after the storages emptied would put session state straight back.
     */
    const clearWebAndLeave = async () => {
        let databases: Awaited<ReturnType<typeof clearWebDatabases>>;
        try {
            databases = await clearWebDatabases(env);
        } catch (e) {
            await run(t.operations.clearWeb, async () => {
                throw e;
            });
            return false;
        }
        try {
            const stores = clearWebStores(env);
            // Written after the wipe so it survives it; read by the next boot.
            runtime.data.requestSyncCursorReset();
            // The result line is gone with the page, so the outcome goes to the logs, which the wipe keeps.
            logger.info('APP', 'debug storage: web cache cleared', { data: { ...databases, ...stores } });
        } catch (e) {
            await run(t.operations.clearWeb, async () => {
                throw e;
            });
            return false;
        }
        navigate('root');
        return true;
    };

    const execute = async (target: ClearTarget) => {
        setArmed(null);
        setBusy(true);
        // Native first: if it fails, the person is still signed in to see why and retry.
        if (target !== 'web' && !(await clearNative())) {
            setBusy(false);
            void load();
            return;
        }
        if (target === 'native') {
            runtime.data.requestSyncCursorReset();
            navigate('reload');
            return;
        }
        if (!(await clearWebAndLeave())) {
            setBusy(false);
            void load();
        }
    };

    const press = (target: ClearTarget) => {
        if (armed === target) void execute(target);
        else setArmed(target);
    };

    const nativeReady = native.status === 'ready';
    const label = (target: ClearTarget, text: string) => (armed === target ? t.confirm : text);

    return (
        <div className="flex flex-col gap-4 p-4">
            <div>
                <h1 className="text-[20px] font-semibold leading-[1.35]">{t.title}</h1>
                <p className="mt-1 text-[13px] text-muted-foreground">{t.subtitle}</p>
            </div>

            <Section title={t.native.section}>
                {native.status === 'noShell' && <p className="text-xs text-muted-foreground">{t.native.noShell}</p>}
                {native.status === 'unsupported' && (
                    <p className="text-xs text-muted-foreground">{t.native.unsupported}</p>
                )}
                {native.status === 'error' && <p className="text-xs text-destructive">{native.message}</p>}
                {native.status === 'ready' && (
                    <>
                        <p className="pt-1 text-xs font-semibold">{t.native.sqlite}</p>
                        {native.summary.sqlite.map(entry => (
                            <SizeLine
                                key={entry.name}
                                name={entry.name}
                                detail={
                                    entry.missing
                                        ? t.native.tableMissing
                                        : (entry.error ?? `${t.rowCount(entry.count)} · ${formatSize(entry.bytes)}`)
                                }
                                tag={
                                    native.summary.keptTables.includes(entry.name)
                                        ? t.native.alwaysKept
                                        : native.summary.unrecoverableTables.includes(entry.name)
                                          ? t.native.unrecoverable
                                          : undefined
                                }
                            />
                        ))}
                        <p className="pt-2 text-xs font-semibold">{t.native.mmkv}</p>
                        <p className="text-[11px] text-muted-foreground">{t.native.mmkvNote}</p>
                        {native.summary.mmkv.map(entry => (
                            <SizeLine key={entry.name} name={entry.name} detail={formatSize(entry.bytes)} />
                        ))}
                        <label className="flex items-start gap-2 pt-2 text-xs">
                            <input
                                type="checkbox"
                                checked={includeInvitedClouds}
                                disabled={busy}
                                aria-describedby={warningId}
                                onChange={e => {
                                    setIncludeInvitedClouds(e.target.checked);
                                    // A confirmation given before the box changed does not cover what it adds.
                                    setArmed(null);
                                }}
                                className="mt-0.5"
                            />
                            <span className="font-semibold">{t.native.includeInvitedClouds}</span>
                        </label>
                        <p id={warningId} className="pl-5 text-xs text-destructive">
                            {t.native.invitedCloudsWarning}
                        </p>
                    </>
                )}
                <div className="pt-1">
                    <button
                        type="button"
                        aria-live="polite"
                        disabled={!nativeReady || busy}
                        onClick={() => press('native')}
                        className="rounded-md border border-destructive px-2 py-1 text-xs text-destructive disabled:opacity-50"
                    >
                        {label('native', t.native.clear)}
                    </button>
                </div>
            </Section>

            <Section title={t.web.section}>
                {web?.local.map(group => (
                    <details key={group.group} className="text-xs">
                        <summary className="cursor-pointer">
                            <span className="font-semibold">{t.web.groups[group.group]}</span>{' '}
                            <span className="font-mono text-muted-foreground">
                                {t.keyCount(group.keys.length)} · {formatSize(group.bytes)}
                            </span>
                        </summary>
                        <div className="space-y-0.5 pl-3 pt-1">
                            {group.keys.map(entry => (
                                <SizeLine key={entry.key} name={entry.key} detail={formatSize(entry.bytes)} />
                            ))}
                        </div>
                    </details>
                ))}
                {web && (
                    <>
                        <Row
                            label={t.web.sessionStorage}
                            value={`${t.keyCount(web.sessionStorage.count)} · ${formatSize(web.sessionStorage.bytes)}`}
                        />
                        <Row
                            label={t.web.indexedDb}
                            value={web.indexedDb === null ? t.web.notListable : web.indexedDb.join(', ') || t.web.none}
                        />
                        <Row
                            label={t.web.cacheStorage}
                            value={
                                web.cacheStorage === null
                                    ? t.web.notListable
                                    : web.cacheStorage.join(', ') || t.web.none
                            }
                        />
                        <Row label={t.web.usage} value={web.usageBytes === null ? '—' : formatSize(web.usageBytes)} />
                    </>
                )}
                <p className="pt-1 text-[11px] text-destructive">{t.web.signOutWarning}</p>
                <div className="pt-1">
                    <button
                        type="button"
                        aria-live="polite"
                        disabled={!web || busy}
                        onClick={() => press('web')}
                        className="rounded-md border border-destructive px-2 py-1 text-xs text-destructive disabled:opacity-50"
                    >
                        {label('web', t.web.clear)}
                    </button>
                </div>
            </Section>

            <div className="flex flex-wrap gap-2">
                <button
                    type="button"
                    aria-live="polite"
                    disabled={!nativeReady || !web || busy}
                    onClick={() => press('both')}
                    className="rounded-md bg-destructive px-2 py-1 text-xs text-destructive-foreground disabled:opacity-50"
                >
                    {label('both', t.clearBoth)}
                </button>
                <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                        setArmed(null);
                        void load();
                    }}
                    className="rounded-md border border-border px-2 py-1 text-xs disabled:opacity-50"
                >
                    {t.refresh}
                </button>
            </div>

            {result && <p className="break-all font-mono text-[12px] text-muted-foreground">{result}</p>}
        </div>
    );
};
