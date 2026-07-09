import { useEffect, useState } from 'react';

import { getSyncManager, useSocketState } from '@chatic/app-runtime';
import type { SyncTargetDescriptor } from '@lemoncloud/chatic-sockets-lib';

import { Row } from '../../components/Row';
import { Section } from '../../components/Section';
import { useRuntimeMetrics } from '../../metrics/useRuntimeMetrics';
import { getLongTaskStats, isLongTaskSupported, type LongTaskStats } from '../../metrics/longTasks';
import { getVitals, type VitalSample } from '../../metrics/webVitalsStore';

// performance.memory is Chrome/Android-WebView only (absent in WKWebView).
const readUsedHeapMb = (): number | null => {
    const memory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    return memory ? Math.round(memory.usedJSHeapSize / 1024 / 1024) : null;
};

// All values are computed web-side by the MetricsCollector; this tab only renders
// the snapshot plus a 1s poll of the live sync target registry.
export const PerfTab = () => {
    const metrics = useRuntimeMetrics();
    const socketState = useSocketState();
    const [targets, setTargets] = useState<SyncTargetDescriptor[]>([]);
    const [longTasks, setLongTasks] = useState<LongTaskStats>(getLongTaskStats());
    const [vitals, setVitals] = useState<Record<string, VitalSample>>({});
    const [usedHeapMb, setUsedHeapMb] = useState<number | null>(null);

    useEffect(() => {
        const poll = () => {
            setTargets(getSyncManager().listTargets());
            setLongTasks(getLongTaskStats());
            setVitals(getVitals());
            setUsedHeapMb(readUsedHeapMb());
        };
        poll();
        const id = setInterval(poll, 1000);
        return () => clearInterval(id);
    }, []);

    const sinceSec =
        metrics.socketStateSinceMs != null ? Math.round((Date.now() - metrics.socketStateSinceMs) / 1000) : null;

    return (
        <>
            <Section title={`Sync Targets (${targets.length})`}>
                {targets.length === 0 ? (
                    <p className="text-xs text-muted-foreground">등록된 sync 타깃이 없습니다</p>
                ) : (
                    targets.map(t => <Row key={`${t.type}:${t.id ?? ''}`} label={t.type} value={t.id ?? '(current)'} />)
                )}
            </Section>

            <Section title="Throughput / Latency">
                <Row label="chat msgs total" value={metrics.chatMessagesTotal} />
                <Row label="chat msgs/s (10s)" value={metrics.chatMessagesPerSec} />
                <Row
                    label="last latency"
                    value={metrics.lastChatLatencyMs != null ? `${metrics.lastChatLatencyMs} ms` : null}
                />
                <Row
                    label="avg latency"
                    value={metrics.avgChatLatencyMs != null ? `${metrics.avgChatLatencyMs} ms` : null}
                />
            </Section>

            <Section title="Cache observations">
                {Object.keys(metrics.cacheObservations).length === 0 ? (
                    <p className="text-xs text-muted-foreground">관측된 변화가 없습니다</p>
                ) : (
                    Object.entries(metrics.cacheObservations).map(([domain, count]) => (
                        <Row key={domain} label={domain} value={count} />
                    ))
                )}
            </Section>

            <Section title="Renders">
                {Object.keys(metrics.renders).length === 0 ? (
                    <p className="text-xs text-muted-foreground">렌더 보고가 없습니다</p>
                ) : (
                    Object.entries(metrics.renders).map(([label, count]) => (
                        <Row key={label} label={label} value={count} />
                    ))
                )}
            </Section>

            <Section title="Connection quality">
                <Row label="state" value={socketState.state} />
                <Row label="connects" value={metrics.socketConnects} />
                <Row label="disconnects" value={metrics.socketDisconnects} />
                <Row label="in state for" value={sinceSec != null ? `${sinceSec}s` : null} />
            </Section>

            <Section title="Main thread (long tasks >50ms)">
                {isLongTaskSupported() ? (
                    <>
                        <Row label="count" value={longTasks.count} />
                        <Row label="total blocked" value={`${longTasks.totalMs} ms`} />
                        <Row label="max task" value={`${longTasks.maxMs} ms`} />
                    </>
                ) : (
                    <p className="text-xs text-muted-foreground">이 엔진은 Long Tasks API를 지원하지 않습니다</p>
                )}
            </Section>

            <Section title="Responsiveness / Memory">
                <Row
                    label="INP"
                    value={vitals.INP ? `${Math.round(vitals.INP.value)} ms (${vitals.INP.rating})` : null}
                />
                <Row label="CLS" value={vitals.CLS ? `${vitals.CLS.value.toFixed(3)} (${vitals.CLS.rating})` : null} />
                <Row label="JS heap" value={usedHeapMb != null ? `${usedHeapMb} MB` : 'n/a (WKWebView)'} />
            </Section>
        </>
    );
};
