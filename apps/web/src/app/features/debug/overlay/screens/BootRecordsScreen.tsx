import { useCallback, useEffect, useState } from 'react';

import type { BootRecord } from '@chatic/bridge-messages';
import { Row } from '../../components/Row';
import { Section } from '../../components/Section';
import { CopyButton } from '../../components/CopyButton';
import { useDebugOperation } from '../../hooks';
import { useBootRecordsScreenStrings } from '../../i18n/screens/BootRecordsScreen';
import { appBridge } from '../../../../bridge';

type BootRecordsScreenStrings = ReturnType<typeof useBootRecordsScreenStrings>;

const ms = (value: number | null | undefined) => (value != null ? `${value} ms` : null);

const NATIVE_MARK_KEYS = [
    'provider-ready',
    'app-mount',
    'main-screen-mount',
    'load-start',
    'load-end',
    'web-app-ready',
] as const;

const NATIVE_MARK_LABEL_KEYS: Record<(typeof NATIVE_MARK_KEYS)[number], keyof BootRecordsScreenStrings['nativeMarks']> =
    {
        'provider-ready': 'providerReady',
        'app-mount': 'appMount',
        'main-screen-mount': 'mainScreenMount',
        'load-start': 'loadStart',
        'load-end': 'loadEnd',
        'web-app-ready': 'webAppReady',
    };

interface Loaded {
    records: BootRecord[];
    contentProcessReloadCount: number;
    lastForegroundResumeMs: number | null;
}

export const BootRecordsScreen = () => {
    const t = useBootRecordsScreenStrings();
    const [loaded, setLoaded] = useState<Loaded | null>(null);
    const [busy, setBusy] = useState(false);
    const { result, run } = useDebugOperation();

    const load = useCallback(async () => {
        setBusy(true);
        await run(t.loadOperation, async () => {
            const res = await appBridge.fetchBootRecords();
            setLoaded({
                records: res.data?.records ?? [],
                contentProcessReloadCount: res.data?.contentProcessReloadCount ?? 0,
                lastForegroundResumeMs: res.data?.lastForegroundResumeMs ?? null,
            });
            return res;
        });
        setBusy(false);
    }, [run, t]);

    useEffect(() => {
        void load();
    }, [load]);

    const clear = useCallback(async () => {
        setBusy(true);
        await run(t.clearOperation, () => appBridge.clearBootRecords());
        setBusy(false);
        await load();
    }, [run, load, t]);

    return (
        <div className="space-y-3 p-4">
            <div className="flex items-center gap-2">
                <button
                    type="button"
                    onClick={() => void load()}
                    disabled={busy}
                    className="rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground disabled:opacity-50"
                >
                    {t.refresh}
                </button>
                <button
                    type="button"
                    onClick={() => void clear()}
                    disabled={busy || !loaded?.records.length}
                    className="rounded-md border border-border px-2 py-1 text-xs disabled:opacity-50"
                >
                    {t.clear}
                </button>
                {loaded && <CopyButton value={() => JSON.stringify(loaded.records, null, 2)} label={t.copyJson} />}
                <span className="ml-auto text-xs text-muted-foreground">{t.rowCount(loaded?.records.length ?? 0)}</span>
            </div>

            {result && <p className="break-all font-mono text-[12px] text-muted-foreground">{result}</p>}

            {loaded && (
                <Section title={t.currentRun.title}>
                    <Row label={t.currentRun.webViewKills} value={loaded.contentProcessReloadCount} />
                    <Row label={t.currentRun.lastResume} value={ms(loaded.lastForegroundResumeMs)} />
                </Section>
            )}

            {loaded?.records.length === 0 && <p className="text-xs text-muted-foreground">{t.noRecords}</p>}

            {loaded?.records.map(record => (
                <Section
                    key={record.finalizedAt}
                    title={`${new Date(record.finalizedAt).toLocaleString()} · ${record.type} · v${record.appVersion}`}
                >
                    <Row label={t.totalBoot} value={ms(record.totalMs)} />
                    {NATIVE_MARK_KEYS.map(key => (
                        <Row
                            key={key}
                            label={t.nativeMarks[NATIVE_MARK_LABEL_KEYS[key]]}
                            value={ms(record.native[key])}
                        />
                    ))}
                    {record.web ? (
                        <>
                            <Row label={t.webSnapshot.mainStart} value={ms(record.web.marks.mainStartMs)} />
                            <Row label={t.webSnapshot.appRender} value={ms(record.web.marks.appRenderMs)} />
                            <Row label={t.webSnapshot.sessionInit} value={ms(record.web.marks.sessionInitializedMs)} />
                        </>
                    ) : (
                        <Row label={t.webSnapshot.label} value={t.webSnapshot.none} />
                    )}
                </Section>
            ))}
        </div>
    );
};
