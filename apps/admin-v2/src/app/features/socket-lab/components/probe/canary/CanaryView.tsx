import { dur } from '../../../lib/stats';
import type { CanarySim } from '../../../hooks/use-canary-sim';
import ControlBar from './ControlBar';
import EventStream from './EventStream';
import FanoutHero from './FanoutHero';
import SliTileGrid from './SliTileGrid';
import SmokeTest from './SmokeTest';

export interface CanaryViewProps {
    canary: CanarySim;
    endpoint: string;
}

/** Canary(live) 모드 — 컨트롤 바 + Fan-out 히어로 + SLI 타일 + Frame Stream. */
export default function CanaryView({ canary, endpoint }: CanaryViewProps) {
    const ready = canary.running && canary.pubStatus === 'connected' && canary.subStatus === 'connected';
    const probeOpacity = ready ? 1 : 0.4;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <ControlBar
                running={canary.running}
                uptimeStr={dur(1838 + canary.clock)}
                sentStr={(240 + Math.floor(canary.clock / 2)).toLocaleString()}
                pubStatus={canary.pubStatus}
                subStatus={canary.subStatus}
                gapDrop={canary.gapDrop}
                onStart={canary.start}
                onStop={canary.stop}
                toggleGapDrop={canary.toggleGapDrop}
            />
            {!canary.running ? <SmokeTest endpoint={endpoint} /> : null}
            <FanoutHero series={canary.metrics.fanout?.series ?? []} probeOpacity={probeOpacity} />
            <SliTileGrid metrics={canary.metrics} probeOpacity={probeOpacity} />
            <EventStream events={canary.events} paused={canary.paused} togglePause={canary.togglePause} />
        </div>
    );
}
