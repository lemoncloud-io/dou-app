import { useCallback, useEffect, useState } from 'react';

import type { BootRecord } from '@chatic/app-messages';
import { Row } from '../../components/Row';
import { Section } from '../../components/Section';
import { useDebugOperation } from '../../hooks';
import { copyText } from '../../lib';
import { appBridge } from '../../../../bridge';

/**
 * What the NATIVE side recorded about past boots — moved here from the app's own Boot Performance
 * screen (ADR-0080 결정 11).
 *
 * Not the same thing as the Boot tab. That one measures the CURRENT web session live (navigation
 * timing, paint vitals, asset cache hits) and is web-only; this one is the persisted history of
 * merged records, one per boot, where the native milestones and the web snapshot sit side by side.
 * A record only exists after a boot finished, so this list answers "how did the last N launches
 * go", which is the question the live tab cannot.
 *
 * The two counters come back with the same request because the app reports them together: they
 * describe the running app, not any one record.
 */
const ms = (value: number | null | undefined) => (value != null ? `${value} ms` : null);

/** Native milestones in timeline order, so rows read top to bottom as the boot happened. */
const NATIVE_MARKS = [
    ['provider-ready', 'provider ready'],
    ['app-mount', 'app mount'],
    ['main-screen-mount', 'main screen mount'],
    ['load-start', 'WebView load start'],
    ['load-end', 'WebView load end'],
    ['web-app-ready', 'web app ready'],
] as const;

interface Loaded {
    records: BootRecord[];
    contentProcessReloadCount: number;
    lastForegroundResumeMs: number | null;
}

export const BootRecordsScreen = () => {
    const [loaded, setLoaded] = useState<Loaded | null>(null);
    const [busy, setBusy] = useState(false);
    // Shared so the NOT_FOUND wording and the learning are the same here as on every other screen
    // (ADR-0080 결정 11 단계 4) — this screen used to hand-roll both.
    const { result, run, isUnsupported } = useDebugOperation();
    const unsupported = isUnsupported('FetchBootRecords');

    const load = useCallback(async () => {
        setBusy(true);
        await run(
            '부팅 기록',
            async () => {
                const res = await appBridge.fetchBootRecords();
                setLoaded({
                    records: res.data?.records ?? [],
                    contentProcessReloadCount: res.data?.contentProcessReloadCount ?? 0,
                    lastForegroundResumeMs: res.data?.lastForegroundResumeMs ?? null,
                });
                return res;
            },
            'FetchBootRecords'
        );
        setBusy(false);
    }, [run]);

    useEffect(() => {
        void load();
    }, [load]);

    const clear = useCallback(async () => {
        setBusy(true);
        await run('기록 초기화', () => appBridge.clearBootRecords(), 'ClearBootRecords');
        setBusy(false);
        await load();
    }, [run, load]);

    return (
        <div className="space-y-3 p-4">
            <div className="flex items-center gap-2">
                <button
                    type="button"
                    onClick={() => void load()}
                    disabled={busy || unsupported}
                    className="rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground disabled:opacity-50"
                >
                    새로고침
                </button>
                <button
                    type="button"
                    onClick={() => void clear()}
                    disabled={busy || unsupported || !loaded?.records.length}
                    className="rounded-md border border-border px-2 py-1 text-xs disabled:opacity-50"
                >
                    초기화
                </button>
                {loaded && (
                    <button
                        type="button"
                        onClick={() => copyText(JSON.stringify(loaded.records, null, 2))}
                        className="rounded-md border border-border px-2 py-1 text-xs"
                    >
                        JSON 복사
                    </button>
                )}
                <span className="ml-auto text-xs text-muted-foreground">{loaded?.records.length ?? 0}건</span>
            </div>

            {result && <p className="break-all font-mono text-[12px] text-muted-foreground">{result}</p>}

            {loaded && (
                <Section title="현재 앱 실행">
                    <Row label="WebView 프로세스 종료" value={loaded.contentProcessReloadCount} />
                    <Row label="마지막 포그라운드 복귀" value={ms(loaded.lastForegroundResumeMs)} />
                </Section>
            )}

            {loaded?.records.length === 0 && !unsupported && (
                <p className="text-xs text-muted-foreground">기록이 없습니다 — 앱을 한 번 재시작하면 남습니다</p>
            )}

            {loaded?.records.map(record => (
                <Section
                    key={record.finalizedAt}
                    title={`${new Date(record.finalizedAt).toLocaleString()} · ${record.type} · v${record.appVersion}`}
                >
                    <Row label="총 부팅" value={ms(record.totalMs)} />
                    {NATIVE_MARKS.map(([key, label]) => (
                        <Row key={key} label={label} value={ms(record.native[key])} />
                    ))}
                    {record.web ? (
                        <>
                            <Row label="web main start" value={ms(record.web.marks.mainStartMs)} />
                            <Row label="web app render" value={ms(record.web.marks.appRenderMs)} />
                            <Row label="web session init" value={ms(record.web.marks.sessionInitializedMs)} />
                        </>
                    ) : (
                        <Row label="웹 스냅샷" value="없음 (타임아웃)" />
                    )}
                </Section>
            ))}
        </div>
    );
};
