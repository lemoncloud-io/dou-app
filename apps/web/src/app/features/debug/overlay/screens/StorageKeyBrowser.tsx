import { useCallback, useMemo, useState } from 'react';

import { CopyButton } from '../../components/CopyButton';
import { FilterBar } from '../../components/FilterBar';
import { useStorageScreenStrings } from '../../i18n/screens/StorageScreen';
import { applyFilter, EMPTY_FILTER } from '../../lib/dataQuery';
import {
    formatValueForEdit,
    readKeyValueEntries,
    valueToStore,
    type KeyValueEntry,
    type KeyValueMedium,
} from '../../lib/keyValueMedia';
import { formatSize } from '../../lib/webStorage';
import type { StorageMedium } from '../../../../runtime/activeStorage';

/** Rendering every config key of a busy device makes the panel crawl; the search finds the rest. */
const RENDER_CAP = 300;

/** The fields a key's record has, offered in the filter and sort pickers. */
const ENTRY_FIELDS = ['key', 'value', 'medium', 'group', 'bytes'] as const;

type Editing = { mode: 'edit'; entry: KeyValueEntry; text: string } | { mode: 'new'; medium: StorageMedium; key: string; text: string };

export interface StorageKeyBrowserProps {
    media: KeyValueMedium[];
    /** Test seam for the reload after an edit. */
    reload?: () => void;
}

/**
 * Every key of every medium the run keeps state in, searchable, with edit, delete and add. Each write
 * goes to the medium's own store object — the one the app holds — and the list is read again from it,
 * so what is shown is what the store now answers, not what was typed.
 */
export const StorageKeyBrowser = ({ media, reload = () => window.location.reload() }: StorageKeyBrowserProps) => {
    const t = useStorageScreenStrings();
    const [version, setVersion] = useState(0);
    const [filter, setFilter] = useState(EMPTY_FILTER);
    const [mediumFilter, setMediumFilter] = useState<StorageMedium | 'all'>('all');
    const [expanded, setExpanded] = useState<string | null>(null);
    const [editing, setEditing] = useState<Editing | null>(null);
    const [armedDelete, setArmedDelete] = useState<string | null>(null);
    const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

    // `version` is the reason to read again: the stores are not observable, so a write bumps it.
    const entries = useMemo(() => readKeyValueEntries(media), [media, version]);
    const scoped = useMemo(
        () => (mediumFilter === 'all' ? entries : entries.filter(e => e.medium === mediumFilter)),
        [entries, mediumFilter]
    );
    const shown = useMemo(() => applyFilter(scoped, filter), [scoped, filter]);
    const writable = media.filter(m => !m.blocked);
    // Only a medium that is not blocked: a vault the page did not open must never receive a write.
    const storeOf = useCallback(
        (medium: StorageMedium) => media.find(m => m.medium === medium && !m.blocked)?.store,
        [media]
    );

    const save = () => {
        if (!editing) return;
        const key = editing.mode === 'edit' ? editing.entry.key : editing.key.trim();
        const medium = editing.mode === 'edit' ? editing.entry.medium : editing.medium;
        if (!key) {
            setMessage({ text: t.keys.keyRequired, error: true });
            return;
        }
        const store = storeOf(medium);
        if (!store) {
            setMessage({ text: t.keys.notWritable, error: true });
            return;
        }
        try {
            store.set(key, valueToStore(editing.text));
            setMessage({ text: t.keys.saved(key) });
            setEditing(null);
        } catch (e) {
            setMessage({ text: (e as Error).message, error: true });
        }
        setVersion(v => v + 1);
    };

    const remove = (entry: KeyValueEntry) => {
        if (armedDelete !== entry.id) {
            setArmedDelete(entry.id);
            return;
        }
        setArmedDelete(null);
        try {
            storeOf(entry.medium)?.remove(entry.key);
            setMessage({ text: t.keys.removed(entry.key) });
        } catch (e) {
            setMessage({ text: (e as Error).message, error: true });
        }
        setVersion(v => v + 1);
    };

    const countOf = (medium: StorageMedium) => entries.filter(e => e.medium === medium).length;

    return (
        <div className="space-y-2">
            <div className="flex flex-wrap gap-1" role="group" aria-label={t.keys.filter}>
                {(['all', ...media.map(m => m.medium)] as const).map(medium => (
                    <button
                        key={medium}
                        type="button"
                        aria-pressed={mediumFilter === medium}
                        onClick={() => setMediumFilter(medium)}
                        className={`rounded border px-2 py-0.5 text-[11px] ${
                            mediumFilter === medium ? 'border-primary text-primary' : 'border-border text-muted-foreground'
                        }`}
                    >
                        {medium === 'all' ? t.keys.all : t.active.media[medium]}{' '}
                        <span className="font-mono">{medium === 'all' ? entries.length : countOf(medium)}</span>
                    </button>
                ))}
            </div>

            <FilterBar filter={filter} onChange={setFilter} shown={shown.length} total={scoped.length} fields={ENTRY_FIELDS} />

            <div className="flex flex-wrap items-center gap-2">
                <button
                    type="button"
                    disabled={writable.length === 0}
                    onClick={() =>
                        setEditing({
                            mode: 'new',
                            medium: writable.some(m => m.medium === mediumFilter)
                                ? (mediumFilter as StorageMedium)
                                : writable[0].medium,
                            key: '',
                            text: '',
                        })
                    }
                    className="rounded bg-primary px-2 py-1 text-xs text-primary-foreground disabled:opacity-50"
                >
                    {t.keys.newKey}
                </button>
                <button type="button" onClick={reload} className="rounded border border-border px-2 py-1 text-xs">
                    {t.keys.reload}
                </button>
            </div>
            <p className="text-[11px] text-muted-foreground">{t.keys.writeNote}</p>

            {editing && (
                <div className="space-y-2 rounded-lg border border-border bg-card p-3">
                    {editing.mode === 'new' ? (
                        <div className="flex flex-wrap gap-2">
                            <label className="flex flex-col gap-0.5 text-[10px] text-muted-foreground">
                                {t.keys.medium}
                                <select
                                    value={editing.medium}
                                    onChange={e => setEditing({ ...editing, medium: e.target.value as StorageMedium })}
                                    className="rounded border border-border bg-background px-1 py-1 text-xs text-foreground"
                                >
                                    {writable.map(m => (
                                        <option key={m.medium} value={m.medium}>
                                            {t.active.media[m.medium]}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <label className="flex min-w-0 flex-1 flex-col gap-0.5 text-[10px] text-muted-foreground">
                                {t.keys.key}
                                <input
                                    value={editing.key}
                                    onChange={e => setEditing({ ...editing, key: e.target.value })}
                                    className="rounded border border-border bg-background px-2 py-1 font-mono text-xs text-foreground"
                                />
                            </label>
                        </div>
                    ) : (
                        <p className="break-all font-mono text-xs">
                            <span className="text-muted-foreground">{t.active.media[editing.entry.medium]} · </span>
                            {editing.entry.key}
                        </p>
                    )}
                    <label className="flex flex-col gap-0.5 text-[10px] text-muted-foreground">
                        {t.keys.value}
                        <textarea
                            value={editing.text}
                            onChange={e => setEditing({ ...editing, text: e.target.value })}
                            className="h-40 w-full rounded border border-border bg-background p-2 font-mono text-xs text-foreground"
                        />
                    </label>
                    <div className="flex gap-2">
                        <button type="button" onClick={save} className="rounded bg-primary px-3 py-1 text-xs text-primary-foreground">
                            {t.keys.save}
                        </button>
                        <button
                            type="button"
                            onClick={() => setEditing(null)}
                            className="rounded border border-border px-3 py-1 text-xs text-muted-foreground"
                        >
                            {t.keys.cancel}
                        </button>
                    </div>
                </div>
            )}

            {message && (
                <p className={`break-all text-xs ${message.error ? 'text-destructive' : 'text-muted-foreground'}`} role="status">
                    {message.text}
                </p>
            )}

            {entries.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t.keys.empty}</p>
            ) : shown.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t.keys.noMatch}</p>
            ) : (
                <ul className="space-y-1">
                    {shown.slice(0, RENDER_CAP).map(entry => (
                        <li key={entry.id} className="rounded border border-border bg-card text-xs">
                            <div className="flex items-start gap-2 px-2 py-1.5">
                                <button
                                    type="button"
                                    aria-expanded={expanded === entry.id}
                                    onClick={() => setExpanded(v => (v === entry.id ? null : entry.id))}
                                    className="min-w-0 flex-1 text-left"
                                >
                                    <span className="mr-1 rounded bg-muted px-1 text-[10px] text-muted-foreground">
                                        {t.active.media[entry.medium]}
                                    </span>
                                    <span className="mr-1 rounded bg-muted px-1 text-[10px] text-muted-foreground">
                                        {t.web.groups[entry.group]}
                                    </span>
                                    <span className="break-all font-mono">{entry.key}</span>
                                </button>
                                <span className="shrink-0 font-mono text-muted-foreground">{formatSize(entry.bytes)}</span>
                                <CopyButton value={() => entry.value} />
                                <button
                                    type="button"
                                    onClick={() =>
                                        setEditing({ mode: 'edit', entry, text: formatValueForEdit(entry.value) })
                                    }
                                    className="shrink-0 text-primary"
                                >
                                    {t.keys.edit}
                                </button>
                                <button
                                    type="button"
                                    aria-live="polite"
                                    onClick={() => remove(entry)}
                                    className="shrink-0 text-destructive"
                                >
                                    {armedDelete === entry.id ? t.confirm : t.keys.delete}
                                </button>
                            </div>
                            {expanded === entry.id && (
                                <pre className="whitespace-pre-wrap break-all border-t border-border px-2 py-1 font-mono text-[10px] text-muted-foreground">
                                    {formatValueForEdit(entry.value)}
                                </pre>
                            )}
                        </li>
                    ))}
                </ul>
            )}
            {shown.length > RENDER_CAP && <p className="text-[11px] text-muted-foreground">{t.keys.capped(RENDER_CAP)}</p>}
        </div>
    );
};
