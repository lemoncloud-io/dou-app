import { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, Database, RotateCcw } from 'lucide-react';

import { getCacheMetricsSource, isNativeApp } from '@chatic/app-runtime';

import { copyText } from '../../lib';

const REFRESH_MS = 1000;

interface Row {
    key: string;
    count: number;
    avgMs: number;
    maxMs: number;
    totalMs: number;
}

/**
 * 네이티브 캐시 호출 계측 뷰어(`nativeCacheMetrics`).
 *
 * 정렬 기준이 평균이 아니라 **누적 시간(count × avg)** 인 것이 핵심입니다. 한 번이 느린 호출과
 * 빠르지만 자주 불리는 호출은 처방이 다른데(저장소 vs 옵저버 재조회), 어느 쪽이 실제로 시간을
 * 쓰는지는 누적으로만 보입니다.
 */
export const CacheMetricsScreen = () => {
    const [rows, setRows] = useState<Row[]>([]);
    const [totalOps, setTotalOps] = useState(0);

    // 화면은 @chatic/db를 직접 import하지 않는다 — app-runtime이 결합한 포트 인스턴스만 본다
    // (ADR-0070 결정 5).
    const metricsSource = useMemo(() => getCacheMetricsSource(), []);

    const read = useCallback(() => {
        const { totalOps: ops, operations } = metricsSource.read();
        setTotalOps(ops);
        setRows(
            Object.entries(operations)
                .map(([key, stat]) => ({ key, ...stat, totalMs: stat.count * stat.avgMs }))
                .sort((a, b) => b.totalMs - a.totalMs)
        );
    }, [metricsSource]);

    // 계측은 모듈 상태라 이벤트를 쏘지 않는다 — 열어둔 동안만 폴링한다.
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
                    <button
                        type="button"
                        onClick={() => copyText(JSON.stringify(metricsSource.read(), null, 2))}
                        className="flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-[12px] text-muted-foreground"
                    >
                        <Copy size={12} /> Copy
                    </button>
                    <button
                        type="button"
                        onClick={onReset}
                        className="flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-[12px] text-muted-foreground"
                    >
                        <RotateCcw size={12} /> Reset
                    </button>
                </div>
            </div>

            {!isNativeApp() && (
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
