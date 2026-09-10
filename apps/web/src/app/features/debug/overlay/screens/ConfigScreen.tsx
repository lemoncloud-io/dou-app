import { useCallback, useMemo, useState } from 'react';

import { config } from '@chatic/config';
import type { ConfigSnapshot, SetRejection, SetResult } from '@chatic/config';

import { Section } from '../../components/Section';
import { copyText } from '../../lib';

/**
 * Every setting this device is actually running with, and — for the keys this device may write —
 * the control that changes it. The screen half of ADR-0079 결정 16, which shipped its logging half
 * without a viewer (see `libs/app-runtime/src/config/configStateLog.ts`).
 *
 * `snapshotAll()` already carries what a row needs: title, description, current value, default,
 * which row won (`origin`), and who may write it here and now (`canWrite`). Editing writes the
 * LOCAL lane only — the panel is this device's operator, not the shell and not the server — and
 * `config.set` reports refusals as a reason, so a control that does nothing says why (types.ts:
 * "a debug panel should show the reason, not crash").
 *
 * Two exclusions, both from the ADRs rather than taste:
 *
 * - **`meta: true` keys** — `system.*`, `debug.overlayEnabled`, `debug.entryCode`. A generic panel
 *   rendering the lock switch inside the screen the lock guards is the recursion ADR-0080 결정 6
 *   removed by marking them.
 * - **`debug.entryCode`** would be excluded by `meta` anyway; it is named here because ADR-0079
 *   결정 16 excludes it for a second, independent reason — it is a credential, and this view is
 *   copyable.
 *
 * Overridden keys are listed first because they are the answer to "why is this device behaving
 * differently", which is the question that brings someone here.
 */
const isHidden = (snapshot: ConfigSnapshot) => snapshot.entry.meta === true || snapshot.key === 'debug.entryCode';

const show = (value: unknown) => (typeof value === 'object' ? JSON.stringify(value) : String(value));

const REJECTION_TEXT: Record<SetRejection, string> = {
    unknownKey: '레지스트리에 없는 키입니다',
    laneNotAllowed: '이 화면이 쓸 수 있는 키가 아닙니다 (로컬 레인 밖)',
    locked: '오버라이드 잠금이 걸려 있습니다',
    invalidValue: '이 키의 타입과 맞지 않는 값입니다',
    notWired: '설정이 아직 배선되지 않았습니다',
};

/** When the change actually lands. A control that silently needs a restart is a lie. */
const APPLIES_AT_TEXT = {
    live: '즉시 적용',
    reconnect: '재연결 후 적용',
    restart: '재시작 후 적용',
} as const;

const reasonOf = (result: SetResult) => (result.ok ? null : REJECTION_TEXT[result.reason]);

export const ConfigScreen = () => {
    const [query, setQuery] = useState('');
    const [tick, setTick] = useState(0);

    // Re-read on demand rather than subscribing: a settings list that reorders itself while being
    // read is harder to use than one with a refresh button, and `configStateLog` already records
    // every change for anyone who needs the timeline. Writes bump the same counter.
    const snapshots = useMemo(() => {
        void tick;
        return config.snapshotAll().filter(snapshot => !isHidden(snapshot));
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

    const copyAll = useCallback(() => {
        copyText(
            JSON.stringify(
                snapshots.map(s => ({ key: s.key, value: s.value, origin: s.origin, overridden: s.isOverridden })),
                null,
                2
            )
        );
    }, [snapshots]);

    return (
        <div className="flex flex-col gap-3 p-4">
            <p className="text-[13px] text-muted-foreground">
                이 기기가 실제로 쓰는 값 — 이긴 행(origin)까지 보고, 쓸 수 있는 키는 여기서 바꿉니다
            </p>

            <div className="flex items-center gap-2">
                <input
                    type="text"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="키 또는 이름으로 찾기"
                    className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:border-foreground"
                />
                <button type="button" onClick={refresh} className="rounded-md border border-border px-2 py-1 text-xs">
                    새로고침
                </button>
                <button type="button" onClick={copyAll} className="rounded-md border border-border px-2 py-1 text-xs">
                    JSON 복사
                </button>
            </div>

            {snapshots.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                    레지스트리가 아직 배선되지 않았습니다 — `config.init()` 전이거나 이 빌드에 어댑터가 없습니다
                </p>
            ) : (
                <>
                    <Section title={`오버라이드됨 (${overridden.length})`}>
                        {overridden.length === 0 ? (
                            <p className="text-xs text-muted-foreground">없습니다 — 전부 빌드가 정한 값입니다</p>
                        ) : (
                            overridden.map(s => <ConfigRow key={s.key} snapshot={s} onChanged={refresh} />)
                        )}
                    </Section>

                    <Section title={`나머지 (${rest.length})`}>
                        {rest.map(s => (
                            <ConfigRow key={s.key} snapshot={s} onChanged={refresh} />
                        ))}
                    </Section>
                </>
            )}
        </div>
    );
};

/**
 * One key. Collapsed it reads like the old list row; expanded it offers the control for its type.
 * Expanding one key at a time keeps 80+ rows scannable — a screen of inline editors is not.
 */
const ConfigRow = ({ snapshot, onChanged }: { snapshot: ConfigSnapshot; onChanged: () => void }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [draft, setDraft] = useState(() => show(snapshot.value));
    const [message, setMessage] = useState<string | null>(null);

    const { entry, key, value, origin, isOverridden, canWrite } = snapshot;
    const canEdit = canWrite.includes('local');

    const apply = (next: unknown) => {
        const result = config.set(key, next, { lane: 'local' });
        setMessage(reasonOf(result));
        if (result.ok) onChanged();
    };

    const revert = () => {
        const result = config.clear(key, { lane: 'local' });
        setMessage(reasonOf(result));
        if (result.ok) {
            setDraft(show(config.snapshotAll().find(s => s.key === key)?.value));
            onChanged();
        }
    };

    const applyDraft = () => {
        if (entry.type === 'number') {
            const parsed = Number(draft);
            if (draft.trim() === '' || Number.isNaN(parsed)) {
                setMessage('숫자가 아닙니다');
                return;
            }
            apply(parsed);
            return;
        }
        if (entry.type === 'json') {
            try {
                apply(JSON.parse(draft));
            } catch (e) {
                setMessage(`JSON 파싱 실패: ${(e as Error).message}`);
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
                className="flex w-full items-start gap-2 text-left"
            >
                <span className="w-40 shrink-0 truncate font-mono text-[11px] text-muted-foreground">{key}</span>
                <span className="flex-1 break-all font-mono text-xs">
                    {show(value)}
                    <span className="ml-1 text-muted-foreground">· {origin}</span>
                </span>
                {canEdit && <span className="shrink-0 text-[10px] text-muted-foreground">{isOpen ? '−' : '수정'}</span>}
            </button>

            {isOpen && (
                <div className="mt-2 rounded-lg bg-muted/40 p-2.5">
                    <p className="text-[12px] font-medium text-foreground">{entry.title}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{entry.description}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                        기본 {show(entry.defaultValue)} · {entry.type} · {APPLIES_AT_TEXT[entry.appliesAt ?? 'restart']}
                    </p>

                    {canEdit ? (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                            {entry.type === 'boolean' && (
                                <button
                                    type="button"
                                    onClick={() => apply(!value)}
                                    className="rounded-md bg-primary px-2.5 py-1 text-xs text-primary-foreground"
                                >
                                    {value ? '끄기' : '켜기'}
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

                            {(entry.type === 'number' || entry.type === 'string' || entry.type === 'json') && (
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
                                        적용
                                    </button>
                                </>
                            )}

                            {isOverridden && (
                                <button
                                    type="button"
                                    onClick={revert}
                                    className="rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground"
                                >
                                    되돌리기
                                </button>
                            )}
                        </div>
                    ) : (
                        <p className="mt-2 text-[11px] text-muted-foreground">
                            이 기기에서는 읽기 전용입니다 — 쓸 수 있는 주체: {canWrite.join(', ') || '없음'}
                        </p>
                    )}

                    {message && <p className="mt-1.5 text-[11px] text-destructive">{message}</p>}
                </div>
            )}
        </div>
    );
};
