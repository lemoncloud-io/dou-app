/**
 * `hooks/use-client-container.ts`
 */
import { useEffect, useState } from 'react';
import type { ClientSocketState, SyncTargetDescriptor } from '@lemoncloud/chatic-sockets-lib';
import type { DemoLogEntry } from '../demo-model';
import type { ClientContainer } from '../runtime/client-container';

export interface ContainerViewState {
    state: ClientSocketState;
    logs: DemoLogEntry[];
    syncTargets: SyncTargetDescriptor[];
}

export const useClientContainer = (container: ClientContainer): ContainerViewState => {
    const [state, setState] = useState<ClientSocketState>(() => container.getState());
    const [logs, setLogs] = useState<DemoLogEntry[]>([]);
    const [syncTargets, setSyncTargets] = useState<SyncTargetDescriptor[]>([]);

    useEffect(() => {
        setState(container.getState());
        return container.subscribe(event => {
            if (event.type === 'state') setState(event.state);
            else if (event.type === 'log') setLogs(prev => [event.entry, ...prev].slice(0, 80));
            else if (event.type === 'sync-targets') setSyncTargets(event.targets);
        });
    }, [container]);

    return { state, logs, syncTargets };
};
