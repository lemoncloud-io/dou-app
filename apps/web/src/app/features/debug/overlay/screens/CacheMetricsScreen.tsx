import { useCallback, useEffect, useMemo, useState } from 'react';
import { Database, RotateCcw } from 'lucide-react';

import { runtime } from '@chatic/app-runtime';

import { CopyButton } from '../../components/CopyButton';

const REFRESH_MS = 1000;

interface Row {
    key: string;
    count: number;
    avgMs: number;
    maxMs: number;
    totalMs: number;
}

/**
 * A viewer for native cache call instrumentation (`nativeCacheMetrics`).
 *
 * The key point is that the sort key is **cumulative time (count × avg)**, not the average. A
 * call that's slow once and a call that's fast but called often call for different fixes
 * (storage vs. observer re-fetching), and only the cumulative view shows which one is actually
 * eating the time.
 */
export const CacheMetricsScreen = () => {
    const [rows, setRows] = useState<Row[]>([]);
    const [totalOps, setTotalOps] = useState(0);

    // The screen doesn't import @chatic/db directly — it only sees the port instance wired up by
    // app-runtime (ADR-0070 decision 5).
    const metricsSource = useMemo(() => runtime.data.getCacheMetricsSource(), []);

    const read = useCallback(() => {
        const { totalOps: ops, operations } = metricsSource.read();
        setTotalOps(ops);
        setRows(
            Object.entries(operations)
                .map(([key, stat]) => ({ key, ...stat, totalMs: stat.count * stat.avgMs }))
                .sort((a, b) => b.totalMs - a.totalMs)
        );
    }, [metricsSource]);

    // Instrumentation is module state, so it doesn't fire events — poll only while this is open.
    useEffect(() => {
        read();
        const id = setInterval(read, REFRESH_MS);
        return () => clearInterval(id);
    }, [read]);

    const onReset = () => {
        metricsSource.reset();
        read();
    };

    const grandTotalMs = rows.reduce((sum, row) => sum + row.totalMs, 0);

    return (
        <div className="p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <Database size={16} className="text-muted-foreground" />
                    <span className="text-[13px] font-semibold text-foreground">Native Cache Metrics</span>
                </div>
                <div className="flex items-center gap-2">
                    <CopyButton value={() => JSON.stringify(metricsSource.read(), null, 2)} />
                    <button
                        type="button"
                        onClick={onReset}
                        className="flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-[12px] text-muted-foreground"
                    >
                        <RotateCcw size={12} /> Reset
                    </button>
                </div>
            </div>

            {!runtime.boot.isNativeApp() && (
                <p className="mb-3 rounded-[12px] bg-muted px-3 py-2 text-[12px] text-muted-foreground">
                    브라우저에서는 네이티브 저장소를 쓰지 않아 계측이 비어 있습니다. 앱(WebView)에서 확인하세요.
                </p>
            )}

            <p className="mb-3 text-[13px] text-muted-foreground">
                총 {totalOps.toLocaleString()}회 · 누적 {grandTotalMs.toLocaleString()}ms
            </p>

            <div className="overflow-x-auto rounded-[18px] bg-card px-4 py-3 shadow-[0px_2px_12px_0px_rgba(0,0,0,0.08)] dark:border dark:border-border dark:shadow-none">
                {rows.length === 0 ? (
                    <p className="py-4 text-center text-[12px] text-muted-foreground">아직 기록된 호출이 없습니다.</p>
                ) : (
                    <table className="w-full text-[12px]">
                        <thead>
                            <tr className="text-left text-muted-foreground">
                                <th className="pb-2 font-medium">연산</th>
                                <th className="pb-2 text-right font-medium">횟수</th>
                                <th className="pb-2 text-right font-medium">평균</th>
                                <th className="pb-2 text-right font-medium">최대</th>
                                <th className="pb-2 text-right font-medium">누적</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map(row => (
                                <tr key={row.key} className="border-t border-border/50">
                                    <td className="py-1.5 pr-2 font-medium text-foreground">{row.key}</td>
                                    <td className="py-1.5 text-right text-foreground">{row.count.toLocaleString()}</td>
                                    <td className="py-1.5 text-right text-foreground">{row.avgMs}ms</td>
                                    <td className="py-1.5 text-right text-foreground">{row.maxMs}ms</td>
                                    <td className="py-1.5 text-right font-medium text-foreground">
                                        {row.totalMs.toLocaleString()}ms
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">
                누적이 큰 항목이 평균은 낮은데 횟수가 많다면, 범인은 저장소가 아니라 옵저버가 emit마다 다시 읽는
                구조입니다. 평균 자체가 크다면 저장소 쪽입니다.
            </p>
        </div>
    );
};
