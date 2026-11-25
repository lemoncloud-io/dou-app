import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

import type { OnFetchNativeStorageSummaryPayload } from '@chatic/bridge-messages';
import { runtime } from '@chatic/runtime-react';
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
import { activeKeyValueMedia } from '../../lib/keyValueMedia';
import { appBridge } from '../../../../bridge';
import {
    describeStoreRoles,
    readActiveStores,
    readPortChoices,
    type ActivePortChoices,
    type ActiveStores,
    type StorageRole,
} from '../../../../runtime/activeStorage';
import { readLaunchSessionOwner } from '../../../../runtime/launchSessionOwner';
import { StorageKeyBrowser } from './StorageKeyBrowser';

type NativeState =
    | { status: 'loading' }
    | { status: 'noShell' }
    | { status: 'error'; message: string }
    | { status: 'ready'; summary: OnFetchNativeStorageSummaryPayload };

type ClearTarget = 'native' | 'web' | 'both';

export interface StorageScreenProps {
    env?: WebStorageEnv;
    navigate?: (to: 'reload' | 'root') => void;
    active?: ActiveStores | null;
    choices?: ActivePortChoices;
    sessionOwner?: 'web' | 'native';
}

const ROLE_ORDER: readonly StorageRole[] = ['secret', 'plain', 'device', 'tab'];

const defaultNavigate = (to: 'reload' | 'root') => {
    if (to === 'root') window.location.replace('/');
    else window.location.reload();
};

const SizeLine = ({ name, detail, tag }: { name: string; detail: string; tag?: string }) => (
    <div className="flex items-start justify-between gap-2 text-xs">
        <span className="break-all font-mono">
            {name}
            {tag && <span className="ml-1 rounded bg-destructive/10 px-1 text-destructive">{tag}</span>}
        </span>
        <span className="shrink-0 font-mono text-muted-foreground">{detail}</span>
    </div>
);

export const StorageScreen = ({
    env: envProp,
    navigate = defaultNavigate,
    active: activeProp,
    choices: choicesProp,
    sessionOwner: ownerProp,
}: StorageScreenProps = {}) => {
    const t = useStorageScreenStrings();
    const [active] = useState(() => (activeProp === undefined ? readActiveStores() : activeProp));
    const choices = choicesProp ?? readPortChoices();
    const sessionOwner = ownerProp ?? readLaunchSessionOwner() ?? 'web';
    const media = useMemo(() => (active ? activeKeyValueMedia(active, sessionOwner) : []), [active, sessionOwner]);
    const roles = active ? describeStoreRoles(active) : null;
    const vaultBlocked = media.find(m => m.medium === 'vault')?.blocked;
    const [env] = useState(() => envProp ?? browserWebStorageEnv());
    const [web, setWeb] = useState<WebStorageSummary | null>(null);
    const [native, setNative] = useState<NativeState>({ status: 'loading' });
    const [includeInvitedClouds, setIncludeInvitedClouds] = useState(false);
    const [armed, setArmed] = useState<ClearTarget | null>(null);
    const [busy, setBusy] = useState(false);
    const { result, run } = useDebugOperation();
    const warningId = useId();
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
            next = { status: 'error', message: (e as Error).message };
        }
        if (current()) setNative(next);
    }, [env]);

    useEffect(() => {
        void load();
    }, [load]);

    const clearNative = async (): Promise<boolean> => {
        let cleared = false;
        await run(t.operations.clearNative, async () => {
            const res = await appBridge.clearNativeCache(includeInvitedClouds);
            const failed = res.data?.failed ?? [];
            if (failed.length > 0) throw new Error(t.nativeFailed(failed.join(', ')));
            cleared = true;
            return res;
        });
        return cleared;
    };

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
        if (env.clearVault && !(await env.clearVault())) {
            await run(t.operations.clearWeb, async () => {
                throw new Error('the device vault was not cleared');
            });
            return false;
        }
        try {
            const stores = clearWebStores(env);
            await runtime.data.requestSyncCursorReset();
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
        if (target !== 'web' && !(await clearNative())) {
            setBusy(false);
            void load();
            return;
        }
        if (target === 'native') {
            await runtime.data.requestSyncCursorReset();
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

            <Section title={t.active.section}>
                <Row label={t.active.adapter} value={choices.storage ?? '—'} />
                <Row label={t.active.sessionOwner} value={t.active.owners[sessionOwner]} />
                {roles ? (
                    ROLE_ORDER.map(role => {
                        const medium = roles[role];
                        return (
                            <Row
                                key={role}
                                label={t.active.roles[role]}
                                value={medium ? t.active.media[medium] : '—'}
                            />
                        );
                    })
                ) : (
                    <p className="text-xs text-muted-foreground">{t.active.notRecorded}</p>
                )}
                {vaultBlocked && <p className="text-xs text-destructive">{t.active.vaultBlocked[vaultBlocked]}</p>}
            </Section>

            {active && (
                <Section title={t.keys.section}>
                    <StorageKeyBrowser media={media} />
                </Section>
            )}

            <p className="border-t border-border pt-3 text-sm font-semibold">{t.clearSection}</p>

            <Section title={t.native.section}>
                {native.status === 'noShell' && <p className="text-xs text-muted-foreground">{t.native.noShell}</p>}
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
