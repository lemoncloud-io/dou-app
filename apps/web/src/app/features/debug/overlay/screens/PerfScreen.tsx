import { useCallback, useEffect, useState } from 'react';

import { runtime } from '@chatic/app-runtime';
import type { SyncTargetDescriptor } from '@lemoncloud/chatic-sockets-lib';

import { CopyButton } from '../../components/CopyButton';
import { Row } from '../../components/Row';
import { Section } from '../../components/Section';
import { usePerfScreenStrings } from '../../i18n/screens/PerfScreen';
import { useRuntimeMetrics } from '../../metrics/useRuntimeMetrics';
import { getLongTaskStats, isLongTaskSupported, type LongTaskStats } from '../../metrics/longTasks';
import { getVitals, type VitalSample } from '../../../../utils/webVitalsStore';

// performance.memory is Chrome/Android-WebView only (absent in WKWebView).
const readUsedHeapMb = (): number | null => {
    const memory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    return memory ? Math.round(memory.usedJSHeapSize / 1024 / 1024) : null;
};

// All values are computed web-side by the MetricsCollector; this tab only renders
// the snapshot plus a 1s poll of the live sync target registry.
export const PerfScreen = () => {
    const strings = usePerfScreenStrings();
    const metrics = useRuntimeMetrics();
    const socketState = runtime.connection.useRuntimeSocketState();
    const [targets, setTargets] = useState<Array<SyncTargetDescriptor & { cid: string }>>([]);
    const [longTasks, setLongTasks] = useState<LongTaskStats>(getLongTaskStats());
    const [vitals, setVitals] = useState<Record<string, VitalSample>>({});
    const [usedHeapMb, setUsedHeapMb] = useState<number | null>(null);

    useEffect(() => {
        const poll = () => {
            setTargets(runtime.sync.getSyncManager().listTargets());
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

    const snapshot = useCallback(
        () => JSON.stringify({ metrics, socketState, targets, longTasks, vitals, usedHeapMb }, null, 2),
        [metrics, socketState, targets, longTasks, vitals, usedHeapMb]
    );

    return (
        <div className="space-y-3 p-4">
            <div className="flex justify-end">
                <CopyButton value={snapshot} label={strings.copyMetrics} />
            </div>

            <Section title={strings.syncTargets.title(targets.length)}>
                {targets.length === 0 ? (
                    <p className="text-xs text-muted-foreground">{strings.syncTargets.empty}</p>
                ) : (
                    targets.map(target => (
                        <Row
                            key={`${target.cid}|${target.type}:${target.id ?? ''}`}
                            label={target.type}
                            value={target.id ?? strings.syncTargets.current}
                        />
                    ))
                )}
            </Section>

            <Section title={strings.throughput.title}>
                <Row label={strings.throughput.chatMsgsTotal} value={metrics.chatMessagesTotal} />
                <Row label={strings.throughput.chatMsgsPerSec} value={metrics.chatMessagesPerSec} />
                <Row
                    label={strings.throughput.lastLatency}
                    value={metrics.lastChatLatencyMs != null ? `${metrics.lastChatLatencyMs} ms` : null}
                />
                <Row
                    label={strings.throughput.avgLatency}
                    value={metrics.avgChatLatencyMs != null ? `${metrics.avgChatLatencyMs} ms` : null}
                />
            </Section>

            <Section title={strings.cache.title}>
                {Object.keys(metrics.cacheObservations).length === 0 ? (
                    <p className="text-xs text-muted-foreground">{strings.cache.empty}</p>
                ) : (
                    Object.entries(metrics.cacheObservations).map(([domain, count]) => (
                        <Row key={domain} label={domain} value={count} />
                    ))
                )}
            </Section>

            <Section title={strings.renders.title}>
                {Object.keys(metrics.renders).length === 0 ? (
                    <p className="text-xs text-muted-foreground">{strings.renders.empty}</p>
                ) : (
                    Object.entries(metrics.renders).map(([label, count]) => (
                        <Row key={label} label={label} value={count} />
                    ))
                )}
            </Section>

            <Section title={strings.connection.title}>
                <Row label={strings.connection.state} value={socketState.state} />
                <Row label={strings.connection.connects} value={metrics.socketConnects} />
                <Row label={strings.connection.disconnects} value={metrics.socketDisconnects} />
                <Row label={strings.connection.inStateFor} value={sinceSec != null ? `${sinceSec}s` : null} />
            </Section>

            <Section title={strings.longTasks.title}>
                {isLongTaskSupported() ? (
                    <>
                        <Row label={strings.longTasks.count} value={longTasks.count} />
                        <Row label={strings.longTasks.totalBlocked} value={`${longTasks.totalMs} ms`} />
                        <Row label={strings.longTasks.maxTask} value={`${longTasks.maxMs} ms`} />
                    </>
                ) : (
                    <p className="text-xs text-muted-foreground">{strings.longTasks.unsupported}</p>
                )}
            </Section>

            <Section title={strings.responsiveness.title}>
                <Row
                    label="INP"
                    value={vitals.INP ? `${Math.round(vitals.INP.value)} ms (${vitals.INP.rating})` : null}
                />
                <Row label="CLS" value={vitals.CLS ? `${vitals.CLS.value.toFixed(3)} (${vitals.CLS.rating})` : null} />
                <Row
                    label={strings.responsiveness.jsHeap}
                    value={usedHeapMb != null ? `${usedHeapMb} MB` : strings.responsiveness.jsHeapUnsupported}
                />
            </Section>
        </div>
    );
};
