import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { runtime } from '@chatic/runtime-react';

import { CopyButton } from '../../components/CopyButton';
import { FilterBar } from '../../components/FilterBar';
import { Row } from '../../components/Row';
import { Section } from '../../components/Section';
import { useDBBrowserStrings } from '../../i18n/screens/DBBrowser';
import {
    assertWritableRow,
    CACHE_DOMAINS,
    cachedChannelIds,
    clearDomain,
    DEFAULT_PER_CHANNEL_LIMIT,
    deleteDomainRow,
    loadDomainRows,
    rowKey,
    TEMPLATES,
    writeDomainRow,
    type CacheDomain,
    type CacheDomainKey,
    type CacheRow,
    type LoadResult,
} from '../../lib/cacheDomains';
import { applyFilter, EMPTY_FILTER, fieldNamesOf } from '../../lib/dataQuery';
import {
    readCacheRoutes,
    readPortChoices,
    type ActiveCacheRoute,
    type ActivePortChoices,
} from '../../../../runtime/activeStorage';
import { readLaunchSessionOwner } from '../../../../runtime/launchSessionOwner';

type PageRepositories = runtime.data.PageRepositories;

const RENDER_CAP = 300;

const SUMMARY_FIELDS = ['channelId', 'chatNo', 'name', 'nick', 'content', 'sid', 'userId', 'state'] as const;

export interface DBBrowserProps {
    repos?: PageRepositories;
    cloudRepos?: (cid: string) => PageRepositories;
    routes?: readonly ActiveCacheRoute[] | null;
    choices?: ActivePortChoices;
    sessionOwner?: 'web' | 'native';
    scope?: { cloud: string | null; uid: string | null };
}

const readScope = (): { cloud: string | null; uid: string | null } => {
    try {
        const { cloud, identity } = runtime.session.getGlobalSessionContext();
        return { cloud: cloud.isActive ? cloud.cloudId : null, uid: identity.userId };
    } catch {
        return { cloud: null, uid: null };
    }
};

const summaryOf = (row: CacheRow): string =>
    SUMMARY_FIELDS.filter(field => row[field] !== undefined && row[field] !== '')
        .map(field => `${field}: ${String(row[field]).slice(0, 60)}`)
        .join(' · ');

export const DBBrowser = ({
    repos: reposProp,
    cloudRepos = runtime.data.getCloudRepositories,
    routes: routesProp,
    choices: choicesProp,
    sessionOwner: ownerProp,
    scope: scopeProp,
}: DBBrowserProps = {}) => {
    const t = useDBBrowserStrings();
    const selectedRepos = runtime.data.useRuntimeRepositories();
    const routes = routesProp === undefined ? readCacheRoutes() : routesProp;
    const choices = choicesProp ?? readPortChoices();
    const sessionOwner = ownerProp ?? readLaunchSessionOwner() ?? 'web';
    const scope = scopeProp ?? readScope();

    const [domainKey, setDomainKey] = useState<CacheDomainKey>('channel');
    const [cloudId, setCloudId] = useState<string>('');
    const [channelId, setChannelId] = useState<string>('');
    const [perChannel, setPerChannel] = useState(DEFAULT_PER_CHANNEL_LIMIT);
    const [perChannelDraft, setPerChannelDraft] = useState(String(DEFAULT_PER_CHANNEL_LIMIT));
    const [cloudIds, setCloudIds] = useState<string[]>([]);
    const [channelIds, setChannelIds] = useState<string[]>([]);
    const [result, setResult] = useState<(LoadResult & { view: string }) | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [filter, setFilter] = useState(EMPTY_FILTER);
    const [expanded, setExpanded] = useState<string | null>(null);
    const [editorText, setEditorText] = useState<string | null>(null);
    const [armed, setArmed] = useState<string | null>(null);
    const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
    const loadSeq = useRef(0);

    const repos = useMemo(
        () => (cloudId ? cloudRepos(cloudId) : (reposProp ?? selectedRepos)),
        [cloudId, cloudRepos, reposProp, selectedRepos]
    );
    const domain: CacheDomain = CACHE_DOMAINS.find(d => d.key === domainKey)!;
    const perChannelDomain = domain.listBy === 'channel' || domain.key === 'user';
    const view = `${domainKey}|${cloudId}`;

    const load = useCallback(async () => {
        const seq = ++loadSeq.current;
        setLoading(true);
        setLoadError(null);
        try {
            const next = await loadDomainRows(repos, domain, {
                channelId: channelId || undefined,
                perChannelLimit: perChannel,
            });
            if (seq === loadSeq.current) setResult({ ...next, view });
        } catch (e) {
            if (seq === loadSeq.current) {
                setResult(null);
                setLoadError((e as Error).message ?? String(e));
            }
        } finally {
            if (seq === loadSeq.current) setLoading(false);
        }
    }, [repos, domain, channelId, perChannel, view]);

    useEffect(() => {
        void load();
    }, [load]);

    useEffect(() => {
        let live = true;
        void loadDomainRows(reposProp ?? selectedRepos, CACHE_DOMAINS.find(d => d.key === 'cloud')!)
            .then(r => live && setCloudIds(r.rows.map(row => row.id)))
            .catch(() => live && setCloudIds([]));
        return () => {
            live = false;
        };
    }, [reposProp, selectedRepos]);
    useEffect(() => {
        let live = true;
        void cachedChannelIds(repos)
            .then(ids => live && setChannelIds(ids))
            .catch(() => live && setChannelIds([]));
        return () => {
            live = false;
        };
    }, [repos]);

    const current = result?.view === view ? result : null;
    const rows = useMemo(() => current?.rows ?? [], [current]);
    const fields = useMemo(() => fieldNamesOf(rows), [rows]);
    const effectiveFilter = useMemo(
        () => ({
            ...filter,
            field: fields.includes(filter.field) ? filter.field : '',
            sortField: fields.includes(filter.sortField) ? filter.sortField : '',
        }),
        [filter, fields]
    );
    const shown = useMemo(() => applyFilter(rows, effectiveFilter), [rows, effectiveFilter]);

    const resetPick = () => {
        setEditorText(null);
        setArmed(null);
        setMessage(null);
        setExpanded(null);
    };

    const write = async (done: string, action: () => Promise<void>) => {
        setArmed(null);
        try {
            await action();
            setMessage({ text: done });
            return true;
        } catch (e) {
            setMessage({ text: (e as Error).message ?? String(e), error: true });
            return false;
        } finally {
            void load();
        }
    };

    const saveEditor = async () => {
        if (editorText === null) return;
        let row: CacheRow;
        try {
            row = assertWritableRow(JSON.parse(editorText));
        } catch (e) {
            setMessage({ text: (e as Error).message, error: true });
            return;
        }
        if (await write(t.saved, () => writeDomainRow(repos, domain, row))) setEditorText(null);
    };

    const arm = (id: string, action: () => void) => {
        if (armed === id) action();
        else setArmed(id);
    };

    const routeOf = (cacheType: string): string => {
        const route = routes?.find(r => r.type === cacheType)?.route;
        if (route) return t.active.routeNames[route] ?? route;
        return t.active.routeNames[sessionOwner === 'native' ? 'nativeRuntime' : 'unknown'];
    };

    return (
        <div className="flex flex-col gap-3">
            <div>
                <h1 className="text-[20px] font-semibold leading-[1.35]">{t.title}</h1>
                <p className="mt-1 text-[13px] text-muted-foreground">{t.subtitle}</p>
            </div>

            <Section title={t.active.section}>
                <Row label={t.active.adapter} value={choices.cache ?? '—'} />
                <Row label={t.active.engine} value={choices.engine ?? '—'} />
                <Row label={t.active.sessionOwner} value={t.active.owners[sessionOwner]} />
                <Row label={t.active.scope} value={`${scope.cloud ?? t.active.relay} · ${scope.uid ?? '—'}`} />
                {sessionOwner === 'native' && !routes && (
                    <p className="text-xs text-muted-foreground">{t.active.nativeOwnedNote}</p>
                )}
                <p className="pt-1 text-[11px] font-semibold text-muted-foreground">{t.active.routes}</p>
                {CACHE_DOMAINS.map(d => (
                    <Row key={d.key} label={t.domains[d.key]} value={`${routeOf(d.cacheType)} · ${d.cacheType}`} />
                ))}
            </Section>

            <div className="flex flex-wrap gap-1" role="group" aria-label={t.active.routes}>
                {CACHE_DOMAINS.map(d => (
                    <button
                        key={d.key}
                        type="button"
                        aria-pressed={d.key === domainKey}
                        onClick={() => {
                            setDomainKey(d.key);
                            setFilter(EMPTY_FILTER);
                            resetPick();
                        }}
                        className={`rounded border px-2 py-0.5 text-[11px] ${
                            d.key === domainKey ? 'border-primary text-primary' : 'border-border text-muted-foreground'
                        }`}
                    >
                        {t.domains[d.key]}
                    </button>
                ))}
            </div>

            <div className="flex flex-wrap gap-2">
                <label className="flex flex-col gap-0.5 text-[10px] text-muted-foreground">
                    {t.cloud}
                    <select
                        value={cloudId}
                        onChange={e => {
                            setCloudId(e.target.value);
                            setChannelId('');
                            resetPick();
                        }}
                        className="max-w-[12rem] rounded border border-border bg-background px-1 py-1 text-xs text-foreground"
                    >
                        <option value="">{t.selectedCloud}</option>
                        {cloudIds.map(id => (
                            <option key={id} value={id}>
                                {id}
                            </option>
                        ))}
                    </select>
                </label>
                {perChannelDomain && (
                    <label className="flex flex-col gap-0.5 text-[10px] text-muted-foreground">
                        {t.channel}
                        <select
                            value={channelId}
                            onChange={e => setChannelId(e.target.value)}
                            className="max-w-[12rem] rounded border border-border bg-background px-1 py-1 text-xs text-foreground"
                        >
                            <option value="">{t.allChannels}</option>
                            {channelIds.map(id => (
                                <option key={id} value={id}>
                                    {id}
                                </option>
                            ))}
                        </select>
                    </label>
                )}
                {domain.key === 'chat' && (
                    <label className="flex flex-col gap-0.5 text-[10px] text-muted-foreground">
                        {t.perChannel}
                        <input
                            type="number"
                            min={1}
                            value={perChannelDraft}
                            onChange={e => setPerChannelDraft(e.target.value)}
                            onBlur={() => {
                                const next = Math.max(
                                    1,
                                    Math.floor(Number(perChannelDraft)) || DEFAULT_PER_CHANNEL_LIMIT
                                );
                                setPerChannel(next);
                                setPerChannelDraft(String(next));
                            }}
                            onKeyDown={e => {
                                if (e.key === 'Enter') e.currentTarget.blur();
                            }}
                            className="w-20 rounded border border-border bg-background px-1 py-1 text-xs text-foreground"
                        />
                    </label>
                )}
            </div>

            <FilterBar
                filter={effectiveFilter}
                onChange={setFilter}
                shown={shown.length}
                total={rows.length}
                fields={fields}
            />

            <div className="flex flex-wrap gap-2">
                <button
                    type="button"
                    disabled={loading}
                    onClick={() => void load()}
                    className="rounded border border-border px-2 py-1 text-xs disabled:opacity-50"
                >
                    {t.refresh}
                </button>
                <button
                    type="button"
                    onClick={() => setEditorText(JSON.stringify(TEMPLATES[domain.key](), null, 2))}
                    className="rounded bg-primary px-2 py-1 text-xs text-primary-foreground"
                >
                    {t.newRow}
                </button>
                {shown.length > 0 && <CopyButton value={() => JSON.stringify(shown, null, 2)} label={t.copyAll} />}
                <button
                    type="button"
                    aria-live="polite"
                    onClick={() => arm('clear', () => void write(t.cleared, () => clearDomain(repos, domain)))}
                    className="rounded border border-destructive px-2 py-1 text-xs text-destructive"
                >
                    {armed === 'clear' ? t.confirm : t.clearDomain}
                </button>
            </div>

            {editorText !== null && (
                <div className="space-y-2 rounded-lg border border-border bg-card p-3">
                    <label className="flex flex-col gap-0.5 text-xs font-semibold">
                        {t.editor}
                        <textarea
                            value={editorText}
                            onChange={e => setEditorText(e.target.value)}
                            className="h-48 w-full rounded border border-border bg-background p-2 font-mono text-xs font-normal"
                        />
                    </label>
                    <p className="text-[11px] text-muted-foreground">{t.mergeNote}</p>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={() => void saveEditor()}
                            className="rounded bg-primary px-3 py-1 text-xs text-primary-foreground"
                        >
                            {t.save}
                        </button>
                        <button
                            type="button"
                            onClick={() => setEditorText(null)}
                            className="rounded border border-border px-3 py-1 text-xs text-muted-foreground"
                        >
                            {t.cancel}
                        </button>
                    </div>
                </div>
            )}

            {message && (
                <p
                    className={`break-all text-xs ${message.error ? 'text-destructive' : 'text-muted-foreground'}`}
                    role="status"
                >
                    {message.text}
                </p>
            )}
            {loadError && <p className="break-all text-xs text-destructive">{t.loadFailed(loadError)}</p>}
            {current?.failures.map(f => (
                <p key={f.channelId} className="break-all text-xs text-destructive">
                    {t.channelFailed(f.channelId, f.message)}
                </p>
            ))}

            {loading && !current ? (
                <p className="text-xs text-muted-foreground">{t.loading}</p>
            ) : rows.length === 0 ? (
                <p className="text-xs text-muted-foreground">{loading ? t.loading : t.noRows}</p>
            ) : shown.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t.noMatch}</p>
            ) : (
                <ul className="space-y-1">
                    {shown.slice(0, RENDER_CAP).map((row, index) => {
                        const key = rowKey(row, index);
                        const summary = summaryOf(row);
                        return (
                            <li key={key} className="rounded border border-border bg-card text-xs">
                                <div className="flex items-start gap-2 px-2 py-1.5">
                                    <button
                                        type="button"
                                        aria-expanded={expanded === key}
                                        onClick={() => setExpanded(v => (v === key ? null : key))}
                                        className="min-w-0 flex-1 text-left"
                                    >
                                        <span className="break-all font-mono">{row.id}</span>
                                        {summary && (
                                            <span className="block truncate text-muted-foreground">{summary}</span>
                                        )}
                                    </button>
                                    <CopyButton value={() => JSON.stringify(row, null, 2)} />
                                    <button
                                        type="button"
                                        onClick={() => setEditorText(JSON.stringify(row, null, 2))}
                                        className="shrink-0 text-primary"
                                    >
                                        {t.edit}
                                    </button>
                                    <button
                                        type="button"
                                        aria-live="polite"
                                        onClick={() =>
                                            arm(
                                                `delete:${key}`,
                                                () =>
                                                    void write(t.deleted, () => deleteDomainRow(repos, domain, row.id))
                                            )
                                        }
                                        className="shrink-0 text-destructive"
                                    >
                                        {armed === `delete:${key}` ? t.confirm : t.delete}
                                    </button>
                                </div>
                                {expanded === key && (
                                    <pre className="whitespace-pre-wrap break-all border-t border-border px-2 py-1 font-mono text-[10px] text-muted-foreground">
                                        {JSON.stringify(row, null, 2)}
                                    </pre>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}
            {shown.length > RENDER_CAP && <p className="text-[11px] text-muted-foreground">{t.capped(RENDER_CAP)}</p>}
        </div>
    );
};
