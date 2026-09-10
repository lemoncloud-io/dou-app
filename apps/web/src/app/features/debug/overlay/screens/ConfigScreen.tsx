import { useCallback, useMemo, useState } from 'react';

import { config } from '@chatic/config';
import type { ConfigSnapshot } from '@chatic/config';

import { Row } from '../../components/Row';
import { Section } from '../../components/Section';
import { copyText } from '../../lib';

/**
 * Every setting this device is actually running with — the screen half of ADR-0079 결정 16, which
 * shipped its logging half without a viewer (see `libs/app-runtime/src/config/configStateLog.ts`).
 *
 * `snapshotAll()` already carries what a row needs: title, description, current value, default,
 * which row won (`origin`), and who may write it here and now (`canWrite`). So this only draws.
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

export const ConfigScreen = () => {
    const [query, setQuery] = useState('');
    const [tick, setTick] = useState(0);

    // Re-read on demand rather than subscribing: a settings list that reorders itself while being
    // read is harder to use than one with a refresh button, and `configStateLog` already records
    // every change for anyone who needs the timeline.
    const snapshots = useMemo(() => {
        void tick;
        return config.snapshotAll().filter(snapshot => !isHidden(snapshot));
    }, [tick]);

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

    const renderRow = (snapshot: ConfigSnapshot) => (
        <Row
            key={snapshot.key}
            label={snapshot.key}
            value={
                <span title={snapshot.entry.description}>
                    {show(snapshot.value)}
                    <span className="ml-1 text-muted-foreground">· {snapshot.origin}</span>
                    {snapshot.isOverridden && show(snapshot.entry.defaultValue) !== show(snapshot.value) && (
                        <span className="ml-1 text-muted-foreground">(기본 {show(snapshot.entry.defaultValue)})</span>
                    )}
                </span>
            }
        />
    );

    return (
        <div className="flex flex-col gap-3 p-4">
            <div>
                <h1 className="text-[20px] font-semibold leading-[1.35]">지금 설정</h1>
                <p className="mt-1 text-[13px] text-muted-foreground">
                    이 기기가 실제로 쓰는 값 — 이긴 행(origin)까지 함께 봅니다
                </p>
            </div>

            <div className="flex items-center gap-2">
                <input
                    type="text"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="키 또는 이름으로 찾기"
                    className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:border-foreground"
                />
                <button
                    type="button"
                    onClick={() => setTick(t => t + 1)}
                    className="rounded-md border border-border px-2 py-1 text-xs"
                >
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
                            overridden.map(renderRow)
                        )}
                    </Section>

                    <Section title={`나머지 (${rest.length})`}>{rest.map(renderRow)}</Section>
                </>
            )}
        </div>
    );
};
