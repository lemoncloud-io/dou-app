import { useEffect, useState } from 'react';

import { getSyncManager, useSocketState } from '@chatic/app-runtime';
import type { SyncTargetDescriptor } from '@lemoncloud/chatic-sockets-lib';

import { Row } from '../../components/Row';
import { Section } from '../../components/Section';
import { useRuntimeMetrics } from '../../metrics/useRuntimeMetrics';

// All values are computed web-side by the MetricsCollector; this tab only renders
// the snapshot plus a 1s poll of the live sync target registry.
export const PerfTab = () => {
    const metrics = useRuntimeMetrics();
    const socketState = useSocketState();
    const [targets, setTargets] = useState<SyncTargetDescriptor[]>([]);

    useEffect(() => {
        const poll = () => setTargets(getSyncManager().listTargets());
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
        </>
    );
};
