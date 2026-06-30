import { useState } from 'react';

import type { CanarySim } from '../../hooks/use-canary-sim';
import type { LoadTest } from '../../hooks/use-load-test';
import CanaryView from './canary/CanaryView';
import LoadTestView from './load/LoadTestView';
import ModeToggle, { type ProbeMode } from './ModeToggle';

export interface ProbeTabProps {
    canary: CanarySim;
    load: LoadTest;
    endpoint: string;
}

/** Probe 탭 — Canary(live) / Load test(on-demand) 모드 전환. */
export default function ProbeTab({ canary, load, endpoint }: ProbeTabProps) {
    const [mode, setMode] = useState<ProbeMode>('canary');

    return (
        <div style={{ padding: '22px 22px 40px', display: 'flex', flexDirection: 'column', gap: 18 }}>
            <ModeToggle mode={mode} setMode={setMode} />
            {mode === 'canary' ? <CanaryView canary={canary} endpoint={endpoint} /> : <LoadTestView load={load} />}
        </div>
    );
}
