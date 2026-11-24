import { useCallback, useMemo, useState } from 'react';

import { runtime, type ConfigSnapshot, type SetResult } from '@chatic/runtime';

import { readCheckoutOptions } from '../../../../runtime/checkoutOptions';
import { CopyButton } from '../../components/CopyButton';
import { Section } from '../../components/Section';
import { useConfigScreenStrings } from '../../i18n/screens/ConfigScreen';

type ConfigScreenStrings = ReturnType<typeof useConfigScreenStrings>;

const isHidden = (snapshot: ConfigSnapshot) => snapshot.entry.meta === true || snapshot.key === 'debug.entryCode';

const show = (value: unknown) => (typeof value === 'object' ? JSON.stringify(value) : String(value));

const CHECKOUT_PORT_KEY = 'port.checkout';
const CHECKOUT_SANDBOX_KEY = 'checkout.sandbox';

const devBuild = import.meta.env.VITE_ENV === 'DEV' || import.meta.env.VITE_ENV === 'LOCAL';

const shellSandbox = (): boolean | undefined => {
    const value: unknown = (runtime.checkout as { sandbox?: unknown }).sandbox;
    return typeof value === 'boolean' ? value : undefined;
};

const reasonOf = (result: SetResult, t: ConfigScreenStrings): string | null =>
    result.ok ? null : t.rejection[result.reason];

export const ConfigScreen = () => {
    const t = useConfigScreenStrings();
    const [query, setQuery] = useState('');
    const [tick, setTick] = useState(0);

    const snapshots = useMemo(() => {
        void tick;
        return runtime.settings.snapshotAll().filter(snapshot => !isHidden(snapshot));
    }, [tick]);

    const refresh = useCallback(() => setTick(t => t + 1), []);

    const filtered = useMemo(() => {
        const needle = query.trim().toLowerCase();
        if (!needle) return snapshots;
        return snapshots.filter(
            s => s.key.toLowerCase().includes(needle) || s.entry.title.toLowerCase().includes(needle)
        );
    }, [snapshots, query]);

    const overridden = filtered.filter(s => s.isOverridden);
    const rest = filtered.filter(s => !s.isOverridden);

    const copyAll = useCallback(
        () =>
            JSON.stringify(
                snapshots.map(s => ({ key: s.key, value: s.value, origin: s.origin, overridden: s.isOverridden })),
                null,
                2
            ),
        [snapshots]
    );

    return (
        <div className="flex flex-col gap-3 p-4">
            <p className="text-[13px] text-muted-foreground">{t.description}</p>

            <div className="flex items-center gap-2">
                <input
                    type="text"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder={t.searchPlaceholder}
                    className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:border-foreground"
                />
                <button type="button" onClick={refresh} className="rounded-md border border-border px-2 py-1 text-xs">
                    {t.refresh}
                </button>
                <CopyButton value={copyAll} label={t.copyJson} />
            </div>

            {snapshots.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t.notWiredUp}</p>
            ) : (
                <>
                    <Section title={t.overriddenTitle(overridden.length)}>
                        {overridden.length === 0 ? (
                            <p className="text-xs text-muted-foreground">{t.noneOverridden}</p>
                        ) : (
                            overridden.map(s => <ConfigRow key={s.key} snapshot={s} onChanged={refresh} t={t} />)
                        )}
                    </Section>

                    <Section title={t.restTitle(rest.length)}>
                        {rest.map(s => (
                            <ConfigRow key={s.key} snapshot={s} onChanged={refresh} t={t} />
                        ))}
                    </Section>
                </>
            )}
        </div>
    );
};

const ConfigRow = ({
    snapshot,
    onChanged,
    t,
}: {
    snapshot: ConfigSnapshot;
    onChanged: () => void;
    t: ConfigScreenStrings;
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [draft, setDraft] = useState(() => show(snapshot.value));
    const [message, setMessage] = useState<string | null>(null);

    const { entry, key, value, origin, isOverridden, canWrite } = snapshot;
    const checkoutOptions = key === CHECKOUT_PORT_KEY ? readCheckoutOptions() : [];
    const sandboxRow = key === CHECKOUT_SANDBOX_KEY;
    const shellSays = sandboxRow ? shellSandbox() : undefined;
    const canEdit = canWrite.includes('local') && (!sandboxRow || devBuild);

    const apply = (next: unknown) => {
        const result = runtime.settings.set(key, next, { lane: 'local' });
        setMessage(reasonOf(result, t));
        if (result.ok) onChanged();
    };

    const revert = () => {
        const result = runtime.settings.clear(key, { lane: 'local' });
        setMessage(reasonOf(result, t));
        if (result.ok) {
            setDraft(show(runtime.settings.snapshotAll().find(s => s.key === key)?.value));
            onChanged();
        }
    };

    const applyDraft = () => {
        if (entry.type === 'number') {
            const parsed = Number(draft);
            if (draft.trim() === '' || Number.isNaN(parsed)) {
                setMessage(t.notANumber);
                return;
            }
            apply(parsed);
            return;
        }
        if (entry.type === 'json') {
            try {
                apply(JSON.parse(draft));
            } catch (e) {
                setMessage(t.jsonParseFailed((e as Error).message));
            }
            return;
        }
        apply(draft);
    };

    return (
        <div className="border-b border-border/60 py-1.5 last:border-b-0">
            <button
                type="button"
                onClick={() => setIsOpen(open => !open)}
                className="flex w-full flex-col gap-0.5 text-left"
            >
                <span className="flex w-full items-baseline gap-2">
                    <span className="flex-1 truncate text-[13px] font-medium text-foreground">{entry.title}</span>
                    <span className="shrink-0 break-all font-mono text-[11px]">
                        {show(value)}
                        <span className="ml-1 text-muted-foreground">· {origin}</span>
                    </span>
                </span>
                <span className="line-clamp-1 text-[11px] text-muted-foreground">{entry.description}</span>
            </button>

            {isOpen && (
                <div className="mt-2 rounded-lg bg-muted/40 p-2.5">
                    <p className="text-[11px] text-muted-foreground">{entry.description}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                        {t.defaultLabel} {show(entry.defaultValue)} · {entry.type} ·{' '}
                        {t.appliesAt[entry.appliesAt ?? 'restart']}
                    </p>

                    {canEdit ? (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                            {entry.type === 'boolean' && (
                                <button
                                    type="button"
                                    onClick={() => apply(!value)}
                                    className="rounded-md bg-primary px-2.5 py-1 text-xs text-primary-foreground"
                                >
                                    {value ? t.off : t.on}
                                </button>
                            )}

                            {entry.type === 'enum' && (
                                <select
                                    value={String(value)}
                                    onChange={e => {
                                        const picked = entry.values?.find(v => String(v) === e.target.value);
                                        apply(picked ?? e.target.value);
                                    }}
                                    className="rounded-md border border-border bg-background px-2 py-1 text-xs"
                                >
                                    {(entry.values ?? []).map(option => (
                                        <option key={String(option)} value={String(option)}>
                                            {String(option)}
                                        </option>
                                    ))}
                                </select>
                            )}

                            {checkoutOptions.length > 0 && (
                                <select
                                    aria-label={entry.title}
                                    value={String(value)}
                                    onChange={e => apply(e.target.value)}
                                    className="rounded-md border border-border bg-background px-2 py-1 text-xs"
                                >
                                    <option value="">{t.declaredDefault}</option>
                                    {checkoutOptions.map(option => (
                                        <option key={option.id} value={option.id} disabled={!option.supported}>
                                            {option.supported ? option.id : `${option.id} — ${t.notOffered}`}
                                        </option>
                                    ))}
                                </select>
                            )}

                            {checkoutOptions.length === 0 &&
                                (entry.type === 'number' || entry.type === 'string' || entry.type === 'json') && (
                                    <>
                                        <input
                                            type={entry.type === 'number' ? 'number' : 'text'}
                                            value={draft}
                                            onChange={e => setDraft(e.target.value)}
                                            spellCheck={false}
                                            className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 font-mono text-xs outline-none focus:border-foreground"
                                        />
                                        <button
                                            type="button"
                                            onClick={applyDraft}
                                            className="rounded-md bg-primary px-2.5 py-1 text-xs text-primary-foreground"
                                        >
                                            {t.apply}
                                        </button>
                                    </>
                                )}

                            {isOverridden && (
                                <button
                                    type="button"
                                    onClick={revert}
                                    className="rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground"
                                >
                                    {t.revert}
                                </button>
                            )}
                        </div>
                    ) : (
                        <p className="mt-2 text-[11px] text-muted-foreground">
                            {t.readOnly(canWrite.join(', ') || t.noWriters)}
                        </p>
                    )}

                    {shellSays !== undefined && (
                        <p className="mt-1.5 text-[11px] text-muted-foreground">{t.shellOverrides(shellSays)}</p>
                    )}
                    {sandboxRow && !devBuild && (
                        <p className="mt-1.5 text-[11px] text-muted-foreground">{t.productionIgnored}</p>
                    )}

                    {message && <p className="mt-1.5 text-[11px] text-destructive">{message}</p>}
                </div>
            )}
        </div>
    );
};
