import { useState } from 'react';

import type { LoadTest } from '../../hooks/use-load-test';
import type { Sandbox } from '../../hooks/use-sandbox';
import LoadTestView from './load/LoadTestView';
import ModeToggle, { type ProbeMode } from './ModeToggle';
import SandboxView from './sandbox/SandboxView';

export interface ProbeTabProps {
    sandbox: Sandbox;
    load: LoadTest;
}

export default function ProbeTab({ sandbox, load }: ProbeTabProps) {
    const [mode, setMode] = useState<ProbeMode>('sandbox');
    const sandboxActive = sandbox.clients.some(
        c => c.status === 'verified' || c.status === 'connecting' || c.status === 'reconnecting'
    );

    return (
        <div style={{ padding: '22px 22px 40px', display: 'flex', flexDirection: 'column', gap: 18 }}>
            <ModeToggle mode={mode} setMode={setMode} sandboxActive={sandboxActive} />
            {mode === 'sandbox' ? <SandboxView sandbox={sandbox} /> : <LoadTestView load={load} />}
        </div>
    );
}
