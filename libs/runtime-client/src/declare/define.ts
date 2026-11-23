import type { RuntimePorts } from '@chatic/runtime-core';

import type { HostPorts } from '../host/ports';
import type {
    Adapter,
    AdapterRef,
    EngineAdapter,
    HostAdapter,
    HostPortName,
    PortConstraint,
    PortName,
    RuntimeDeclaration,
} from './types';

export const defineRuntime = <Facts, Owner = never>(
    declaration: RuntimeDeclaration<Facts, Owner>
): RuntimeDeclaration<Facts, Owner> => declaration;

export const defineAdapter = <P extends PortName, Facts = unknown, Impl extends RuntimePorts[P] = RuntimePorts[P]>(
    adapter: Adapter<P, Impl, Facts>
): Adapter<P, Impl, Facts> => adapter;

export const defineHostAdapter = <P extends HostPortName, Facts = unknown, Impl extends HostPorts[P] = HostPorts[P]>(
    adapter: HostAdapter<P, Impl, Facts>
): HostAdapter<P, Impl, Facts> => adapter;

export const defineEngineAdapter = <Facts = unknown, Owner = never>(
    adapter: EngineAdapter<Facts, Owner>
): EngineAdapter<Facts, Owner> => adapter;

const refOf = ({ id, port }: AdapterRef): AdapterRef => ({ id, port });

export const requires = (adapter: AdapterRef, needs: AdapterRef): PortConstraint => ({
    kind: 'requires',
    adapter: refOf(adapter),
    needs: refOf(needs),
});

export const conflicts = (adapter: AdapterRef, other: AdapterRef): PortConstraint => ({
    kind: 'conflicts',
    adapter: refOf(adapter),
    other: refOf(other),
});
