import type { LoadTest } from '../../../hooks/use-load-test';
import LoadConfig from './LoadConfig';
import LoadReport from './LoadReport';
import LoadRunning from './LoadRunning';

export interface LoadTestViewProps {
    load: LoadTest;
}

/** Load test 모드 — idle / running / done 3-state 전환. */
export default function LoadTestView({ load }: LoadTestViewProps) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {load.loadState === 'idle' ? (
                <LoadConfig load={load} />
            ) : load.loadState === 'running' ? (
                <LoadRunning load={load} />
            ) : (
                <LoadReport load={load} />
            )}
        </div>
    );
}
